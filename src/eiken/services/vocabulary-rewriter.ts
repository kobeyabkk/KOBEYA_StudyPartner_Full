/**
 * Vocabulary Rewriter Service
 * 
 * 目的: 語彙違反を検出した問題を、GPT-4oを使ってA1語彙に自動修正
 */

import type { EikenEnv } from '../types';
import type { VocabularyViolation } from '../types/vocabulary';
import { 
  buildRewritePrompt, 
  buildRewriteSystemPrompt,
  validateRewriteResult,
  formatReplacementSummary,
  type RewriteRequest, 
  type RewriteResult 
} from '../prompts/rewrite-prompts';

export interface RewriteOptions {
  maxAttempts?: number; // デフォルト: 2
  minConfidence?: number; // デフォルト: 0.7
  preserveGrammar?: boolean; // デフォルト: true
  useCompactPrompt?: boolean; // デフォルト: false
}

export interface RewriteResponse {
  success: boolean;
  original: {
    question: string;
    choices: string[];
  };
  rewritten: {
    question: string;
    choices: string[];
    correctAnswerIndex: number;
  };
  replacements: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
  confidence: number;
  attempts: number;
  metadata?: {
    rewriteTimeMs: number;
    tokensUsed?: number;
  };
  error?: string;
  errorDetails?: {
    message: string;
    stack: string;
    hasApiKey: boolean;
    apiKeyLength: number;
  };
}

const DEFAULT_OPTIONS: Required<RewriteOptions> = {
  maxAttempts: 2,
  minConfidence: 0.7,
  preserveGrammar: true,
  useCompactPrompt: false
};

/**
 * 語彙違反を自動修正
 */
export async function rewriteQuestion(
  originalQuestion: string,
  originalChoices: string[],
  violations: VocabularyViolation[],
  targetLevel: string,
  env: EikenEnv,
  options: RewriteOptions = {}
): Promise<RewriteResponse> {
  
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      success: false,
      original: { question: originalQuestion, choices: originalChoices },
      rewritten: { question: '', choices: [], correctAnswerIndex: 0 },
      replacements: [],
      confidence: 0,
      attempts: 0,
      error: 'OpenAI API key not configured'
    };
  }
  
  const violatedWords = Array.from(new Set(violations.map(v => v.word)));
  
  console.log(`🔄 Auto-rewrite attempt for ${violatedWords.length} violations`);
  console.log(`   Violated words: ${violatedWords.join(', ')}`);
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      console.log(`   🔄 Attempt ${attempt}/${opts.maxAttempts}...`);
      
      // Build rewrite request
      const rewriteRequest: RewriteRequest = {
        originalQuestion,
        originalChoices,
        violatedWords,
        targetLevel,
        correctAnswerIndex: 0 // Will be determined by GPT
      };
      
      const userPrompt = buildRewritePrompt(rewriteRequest);
      const systemPrompt = buildRewriteSystemPrompt();
      
      // Call GPT-4o
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o', // 語彙書き換えは常に高品質モデルを使用（文法的正確性・自然さ重視）
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3, // Low temperature for consistency
          max_tokens: 1000
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens: number };
      };
      
      console.log(`   📥 OpenAI response content:`, data.choices[0].message.content.substring(0, 200));
      
      let result: RewriteResult;
      try {
        result = JSON.parse(data.choices[0].message.content);
        console.log(`   ✅ JSON parsed successfully`);
        console.log(`   📋 Result keys:`, Object.keys(result).join(', '));
      } catch (parseError) {
        console.error(`   ❌ JSON parse error:`, parseError);
        throw new Error(`Failed to parse OpenAI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      // Validate result structure
      const validation = validateRewriteResult(result, originalChoices.length);
      if (!validation.valid) {
        console.log(`   ❌ Invalid rewrite result: ${validation.errors.join(', ')}`);
        continue;
      }
      
      // Check confidence
      if (result.confidence < opts.minConfidence) {
        console.log(`   ⚠️ Low confidence: ${result.confidence.toFixed(2)} < ${opts.minConfidence}, retrying...`);
        continue;
      }
      
      const rewriteTimeMs = Date.now() - startTime;
      
      console.log(`   ✅ Rewrite successful! (confidence: ${result.confidence.toFixed(2)})`);
      console.log(`   📝 Replacements: ${formatReplacementSummary(result.replacements)}`);
      console.log(`   ⏱️ Time: ${rewriteTimeMs}ms`);
      
      return {
        success: true,
        original: { question: originalQuestion, choices: originalChoices },
        rewritten: {
          question: result.rewrittenQuestion,
          choices: result.rewrittenChoices,
          correctAnswerIndex: result.correctAnswerIndex
        },
        replacements: result.replacements,
        confidence: result.confidence,
        attempts: attempt,
        metadata: {
          rewriteTimeMs,
          tokensUsed: data.usage?.total_tokens
        }
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : '';
      console.error(`   ❌ Rewrite attempt ${attempt} failed:`, errorMessage);
      console.error(`   🔍 Error details:`, errorStack);
      console.error(`   📋 API Key status: ${openaiApiKey ? 'Present (length: ' + openaiApiKey.length + ')' : 'MISSING'}`);
      
      if (attempt === opts.maxAttempts) {
        const rewriteTimeMs = Date.now() - startTime;
        return {
          success: false,
          original: { question: originalQuestion, choices: originalChoices },
          rewritten: { question: '', choices: [], correctAnswerIndex: 0 },
          replacements: [],
          confidence: 0,
          attempts: attempt,
          metadata: { rewriteTimeMs },
          error: errorMessage,
          errorDetails: {
            message: errorMessage,
            stack: errorStack?.split('\n')[0] || '',
            hasApiKey: !!openaiApiKey,
            apiKeyLength: openaiApiKey?.length || 0
          }
        };
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Should not reach here, but just in case
  const rewriteTimeMs = Date.now() - startTime;
  return {
    success: false,
    original: { question: originalQuestion, choices: originalChoices },
    rewritten: { question: '', choices: [], correctAnswerIndex: 0 },
    replacements: [],
    confidence: 0,
    attempts: opts.maxAttempts,
    metadata: { rewriteTimeMs },
    error: 'Max attempts reached'
  };
}

/**
 * バッチリライト（複数問題を一度に処理）
 */
export async function rewriteQuestions(
  questions: Array<{
    question: string;
    choices: string[];
    violations: VocabularyViolation[];
  }>,
  targetLevel: string,
  env: EikenEnv,
  options: RewriteOptions = {}
): Promise<RewriteResponse[]> {
  
  console.log(`📦 Batch rewrite: ${questions.length} questions`);
  
  const results: RewriteResponse[] = [];
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n📝 Processing question ${i + 1}/${questions.length}`);
    
    const result = await rewriteQuestion(
      q.question,
      q.choices,
      q.violations,
      targetLevel,
      env,
      options
    );
    
    results.push(result);
    
    // Rate limiting
    if (i < questions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n✅ Batch rewrite complete: ${successCount}/${questions.length} successful`);
  
  return results;
}

/**
 * Get rewrite statistics
 */
export function getRewriteStatistics(results: RewriteResponse[]): {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  averageConfidence: number;
  averageAttempts: number;
  averageTimeMs: number;
  totalReplacements: number;
} {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const avgConfidence = successful.length > 0
    ? successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length
    : 0;
  
  const avgAttempts = results.length > 0
    ? results.reduce((sum, r) => sum + r.attempts, 0) / results.length
    : 0;
  
  const avgTimeMs = results.length > 0
    ? results.reduce((sum, r) => sum + (r.metadata?.rewriteTimeMs || 0), 0) / results.length
    : 0;
  
  const totalReplacements = successful.reduce((sum, r) => sum + r.replacements.length, 0);
  
  return {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: results.length > 0 ? successful.length / results.length : 0,
    averageConfidence: avgConfidence,
    averageAttempts: avgAttempts,
    averageTimeMs: avgTimeMs,
    totalReplacements
  };
}
