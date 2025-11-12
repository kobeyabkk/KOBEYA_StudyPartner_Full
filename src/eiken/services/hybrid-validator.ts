/**
 * Hybrid Validator
 * 
 * Purpose: Orchestrate rule-based + LLM validation
 * - Fast rule-based validation first (95-99% of cases)
 * - LLM re-validation for edge cases (1-5% of cases)
 * - Comprehensive logging for monitoring
 * 
 * Flow:
 * 1. Rule-based validation (fast, frozen code)
 * 2. If passed → return immediately (no LLM call)
 * 3. If failed → LLM re-validation (context-aware judgment)
 * 4. Log results for monitoring
 * 5. Return LLM result (LLM takes priority)
 */

import type { ValidationResult, ValidationConfig, CEFRLevel } from '../types/vocabulary';
import { validateVocabulary } from '../lib/vocabulary-validator';
import { LLMValidator, type LLMConfig } from './llm-validator';
import { ValidationLogger } from './validation-logger';

export interface HybridValidatorConfig {
  llm_enabled: boolean;
  llm_provider: 'openai' | 'anthropic';
  llm_model: string;
  llm_api_key: string;
  llm_timeout: number;
  llm_max_retries: number;
  enable_sampling: boolean;
  sampling_rate: number;
  cache_ttl: number;
}

export class HybridValidator {
  private llmValidator: LLMValidator | null = null;
  private logger: ValidationLogger;
  private cache: Map<string, { result: ValidationResult; timestamp: number }> = new Map();

  constructor(
    private db: D1Database,
    private config: HybridValidatorConfig,
    private analytics?: AnalyticsEngineDataset
  ) {
    // Initialize logger
    this.logger = new ValidationLogger(db, analytics);

    // Initialize LLM validator if enabled
    if (config.llm_enabled) {
      const llmConfig: LLMConfig = {
        provider: config.llm_provider,
        model: config.llm_model,
        apiKey: config.llm_api_key,
        maxRetries: config.llm_max_retries,
        timeout: config.llm_timeout
      };
      this.llmValidator = new LLMValidator(llmConfig);
    }
  }

  /**
   * Main validation entry point
   */
  async validate(
    text: string,
    validationConfig: ValidationConfig
  ): Promise<ValidationResult> {
    const timestamp = new Date().toISOString();
    
    // Check cache first
    const cacheKey = this.getCacheKey(text, validationConfig.target_level);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Step 1: Rule-based validation (FAST)
    const ruleStartTime = Date.now();
    const ruleResult = await validateVocabulary(text, this.db, validationConfig);
    const ruleExecutionTime = Date.now() - ruleStartTime;

    // Step 2: Decide if LLM call is needed
    const shouldCallLLM = this.shouldTriggerLLM(ruleResult, validationConfig.target_level);

    if (!shouldCallLLM) {
      // Rule-based passed → return immediately (no LLM call)
      await this.logger.log({
        timestamp,
        text,
        targetLevel: validationConfig.target_level,
        ruleResult: {
          valid: ruleResult.valid,
          violations: ruleResult.violations,
          executionTime: ruleExecutionTime
        },
        discrepancy: false
      });

      this.setCache(cacheKey, ruleResult);
      return ruleResult;
    }

    // Step 3: LLM re-validation
    if (!this.llmValidator) {
      // LLM disabled but should be called → log warning and return rule result
      console.warn('LLM validation needed but disabled');
      await this.logger.log({
        timestamp,
        text,
        targetLevel: validationConfig.target_level,
        ruleResult: {
          valid: ruleResult.valid,
          violations: ruleResult.violations,
          executionTime: ruleExecutionTime
        },
        discrepancy: false
      });

      return ruleResult;
    }

    try {
      const llmStartTime = Date.now();
      const llmResult = await this.llmValidator.validate(
        text,
        validationConfig.target_level,
        ruleResult.violations
      );
      const llmExecutionTime = Date.now() - llmStartTime;
      const llmCost = this.llmValidator.estimateCost(text);

      // Step 4: Detect discrepancy
      const discrepancy = ruleResult.valid !== llmResult.valid;

      // Step 5: Log everything
      await this.logger.log({
        timestamp,
        text,
        targetLevel: validationConfig.target_level,
        ruleResult: {
          valid: ruleResult.valid,
          violations: ruleResult.violations,
          executionTime: ruleExecutionTime
        },
        llmResult: {
          valid: llmResult.valid,
          violations: llmResult.violations,
          executionTime: llmExecutionTime,
          cost: llmCost
        },
        discrepancy
      });

      // LLM result takes priority
      this.setCache(cacheKey, llmResult);
      return llmResult;

    } catch (error) {
      console.error('LLM validation failed:', error);
      
      // Fall back to rule-based result
      await this.logger.log({
        timestamp,
        text,
        targetLevel: validationConfig.target_level,
        ruleResult: {
          valid: ruleResult.valid,
          violations: ruleResult.violations,
          executionTime: ruleExecutionTime
        },
        discrepancy: false
      });

      return ruleResult;
    }
  }

  /**
   * Decide if LLM validation is needed
   */
  private shouldTriggerLLM(ruleResult: ValidationResult, targetLevel: CEFRLevel): boolean {
    // If rule-based passed, no need for LLM
    if (ruleResult.valid) {
      return false;
    }

    // If LLM is disabled, skip
    if (!this.config.llm_enabled) {
      return false;
    }

    // If in sampling mode, only call LLM sometimes
    if (this.config.enable_sampling) {
      return Math.random() < this.config.sampling_rate;
    }

    // Otherwise, call LLM for all failed cases
    return true;
  }

  /**
   * Cache management
   */
  private getCacheKey(text: string, level: CEFRLevel): string {
    // Use first 100 chars + level as key (avoid huge keys)
    const textKey = text.substring(0, 100).toLowerCase().replace(/\s+/g, '_');
    return `${level}:${textKey}`;
  }

  private getFromCache(key: string): ValidationResult | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.config.cache_ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  private setCache(key: string, result: ValidationResult): void {
    // Limit cache size (LRU: delete oldest if > 1000 entries)
    if (this.cache.size >= 1000) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Get weekly report
   */
  async getWeeklyReport(): Promise<string> {
    return this.logger.generateWeeklyReport();
  }

  /**
   * Get discrepancy cases for analysis
   */
  async getDiscrepancyCases(limit: number = 10) {
    return this.logger.getDiscrepancyCases(limit);
  }

  /**
   * Clean old logs
   */
  async cleanOldLogs(): Promise<number> {
    return this.logger.cleanOldLogs();
  }

  /**
   * Get current statistics
   */
  async getWeeklyStats() {
    return this.logger.getWeeklyStats();
  }
}
