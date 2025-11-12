/**
 * LLM Validator
 * 
 * Purpose: Use LLM (GPT-4o-mini or Claude Haiku) to validate vocabulary level
 * - More flexible than rule-based
 * - Understands context and nuance
 * - Handles edge cases automatically
 */

import type { ValidationResult, VocabularyViolation, CEFRLevel } from '../types/vocabulary';

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey: string;
  maxRetries: number;
  timeout: number;
}

interface LLMResponse {
  valid: boolean;
  violations: Array<{
    word: string;
    actual_level: string;
    confidence: number;
    reason: string;
  }>;
}

export class LLMValidator {
  constructor(private config: LLMConfig) {}
  
  /**
   * Validate text using LLM
   */
  async validate(
    text: string,
    targetLevel: CEFRLevel,
    ruleViolations: VocabularyViolation[]
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.callLLM(text, targetLevel, ruleViolations);
      
      const wordCount = text.split(/\s+/).length;
      const validWords = wordCount - response.violations.length;
      const violationRate = response.violations.length / wordCount;
      
      return {
        valid: response.valid,
        total_words: wordCount,
        valid_words: validWords,
        violations: response.violations.map(v => ({
          word: v.word,
          expected_level: targetLevel,
          actual_level: v.actual_level as CEFRLevel,
          severity: 'error' as const,
          confidence: v.confidence,
          reason: v.reason
        })),
        violation_rate: violationRate,
        message: response.valid 
          ? 'Vocabulary level is appropriate (validated by LLM)' 
          : `LLM detected ${response.violations.length} violation(s)`,
        metadata: {
          execution_time_ms: Date.now() - startTime,
          source: 'llm',
          model: this.config.model,
          provider: this.config.provider
        }
      };
    } catch (error) {
      console.error('LLM validation failed:', error);
      throw new Error(`LLM validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Call LLM API based on provider
   */
  private async callLLM(
    text: string,
    targetLevel: CEFRLevel,
    ruleViolations: VocabularyViolation[]
  ): Promise<LLMResponse> {
    if (this.config.provider === 'openai') {
      return this.callOpenAI(text, targetLevel, ruleViolations);
    } else if (this.config.provider === 'anthropic') {
      return this.callAnthropic(text, targetLevel, ruleViolations);
    } else {
      throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
    }
  }
  
  /**
   * Call OpenAI API (GPT-4o-mini)
   */
  private async callOpenAI(
    text: string,
    targetLevel: CEFRLevel,
    ruleViolations: VocabularyViolation[]
  ): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt()
            },
            {
              role: 'user',
              content: this.getUserPrompt(text, targetLevel, ruleViolations)
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 500
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
      }
      
      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI API timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }
  
  /**
   * Call Anthropic API (Claude Haiku)
   */
  private async callAnthropic(
    text: string,
    targetLevel: CEFRLevel,
    ruleViolations: VocabularyViolation[]
  ): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 500,
          temperature: 0.1,
          messages: [
            {
              role: 'user',
              content: `${this.getSystemPrompt()}\n\n${this.getUserPrompt(text, targetLevel, ruleViolations)}`
            }
          ]
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
      }
      
      const data = await response.json();
      const content = data.content[0].text;
      
      // Extract JSON from markdown code block if present
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
      
      return JSON.parse(content);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Anthropic API timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }
  
  /**
   * Get system prompt for LLM
   */
  private getSystemPrompt(): string {
    return `You are an expert English vocabulary level validator for Japanese learners preparing for Eiken (英検) exams.

Your task: Verify if vocabulary in a given text is appropriate for the target CEFR level.

## CEFR to Eiken mapping:
- **A1** = 英検5級 (Elementary, ~600 core words, e.g., cat, eat, happy, school)
- **A2** = 英検4級 (Pre-intermediate, ~1,300 words, e.g., usually, bicycle, because)
- **B1** = 英検3級 (Intermediate, ~2,100 words, e.g., although, environment, convenient)
- **B2** = 英検準2級 (~3,000 words)
- **C1/C2** = Advanced

## Critical rules:
1. **Proper nouns** (names, places, dates) are ALWAYS allowed regardless of level
2. **Function words** (the, a, is, have, to, from, etc.) are ALWAYS allowed
3. Judge by **LEMMA** (base form): "playing" → "play", "easier" → "easy", "studied" → "study"
4. Consider the **most common meaning** in context
5. Be **lenient** with compound words if both components are appropriate
6. Inflected forms (plays, played, playing) are at the **same level** as base form
7. If a word has multiple meanings at different levels, judge by context

## Examples:
- "I **need** to go" (A1) - "need" is basic vocabulary ✓
- "The **movie** was interesting" (A1) - "movie" is A1, "interesting" is A2 ✓ (if target is A2+)
- "I've been **practicing** basketball" (A2) - "practice" is A2 vocabulary ✓

## Output format (STRICT JSON):
{
  "valid": true/false,
  "violations": [
    {
      "word": "exact word from text (not lemma)",
      "actual_level": "B2",
      "confidence": 0.85,
      "reason": "This word is typically taught at B2 level"
    }
  ]
}

## Important:
- If there are NO violations, return: {"valid": true, "violations": []}
- Be conservative: only flag clear violations
- When in doubt, allow the word (false positives are worse than false negatives)`;
  }
  
  /**
   * Get user prompt for specific validation
   */
  private getUserPrompt(
    text: string,
    targetLevel: CEFRLevel,
    ruleViolations: VocabularyViolation[]
  ): string {
    let prompt = `Validate this English text for vocabulary level appropriateness.

**Text:** "${text}"

**Target level:** ${targetLevel}

`;
    
    if (ruleViolations.length > 0) {
      prompt += `**Note:** Our rule-based system flagged these words as potential violations:
${ruleViolations.map(v => `- "${v.word}" (detected as ${v.actual_level})`).join('\n')}

Please verify if these are genuine violations or false positives. Consider:
- Is the word truly beyond ${targetLevel} level?
- Could it be a proper noun, function word, or inflected form?
- Is the context appropriate?

`;
    }
    
    prompt += `Provide your assessment in JSON format. Remember:
- Only flag CLEAR violations
- When in doubt, allow the word
- Consider lemma, not just surface form
- Proper nouns are always OK`;
    
    return prompt;
  }
  
  /**
   * Estimate cost of this LLM call
   */
  estimateCost(text: string): number {
    // Token estimation (rough): 1 word ≈ 1.3 tokens
    const inputTokens = text.split(/\s+/).length * 1.5 + 500; // + system prompt
    const outputTokens = 100; // JSON response
    
    if (this.config.provider === 'openai') {
      // GPT-4o-mini pricing (as of Nov 2024)
      const costPer1MInput = 0.150;
      const costPer1MOutput = 0.600;
      return (inputTokens / 1000000 * costPer1MInput) + 
             (outputTokens / 1000000 * costPer1MOutput);
    } else if (this.config.provider === 'anthropic') {
      // Claude Haiku pricing (as of Nov 2024)
      const costPer1MInput = 0.25;
      const costPer1MOutput = 1.25;
      return (inputTokens / 1000000 * costPer1MInput) + 
             (outputTokens / 1000000 * costPer1MOutput);
    }
    
    return 0;
  }
}
