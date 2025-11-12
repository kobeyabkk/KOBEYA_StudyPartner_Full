/**
 * 語彙バリデーションAPIルート
 */

import { Hono } from 'hono';
import type { EikenEnv } from '../types';
import type { ValidationConfig, VocabularyViolation } from '../types/vocabulary';
import { validateVocabularyWithCache, validateBatch } from '../lib/vocabulary-validator-cached';
import { lookupWordWithCache, getCacheStats, clearAllCache } from '../lib/vocabulary-cache';
import { getVocabularyCount } from '../lib/vocabulary-validator';
import { rewriteQuestion, rewriteQuestions, getRewriteStatistics, type RewriteOptions } from '../services/vocabulary-rewriter';

const app = new Hono<{ Bindings: EikenEnv }>();

// ====================
// 単語検索API
// ====================

/**
 * GET /api/eiken/vocabulary/lookup/:word
 * 単語を検索して語彙情報を返す
 */
app.get('/lookup/:word', async (c) => {
  const word = c.req.param('word');
  
  if (!word) {
    return c.json({ error: 'Word parameter is required' }, 400);
  }
  
  try {
    const entry = await lookupWordWithCache(word, c.env.DB, c.env.KV);
    
    if (!entry) {
      return c.json({
        found: false,
        word,
        message: 'Word not found in vocabulary database',
      }, 404);
    }
    
    return c.json({
      found: true,
      entry,
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return c.json({
      error: 'Failed to lookup word',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ====================
// バリデーションAPI
// ====================

/**
 * POST /api/eiken/vocabulary/validate
 * テキストの語彙レベルを検証
 */
app.post('/validate', async (c) => {
  try {
    const body = await c.req.json<{
      text: string;
      config?: Partial<ValidationConfig>;
    }>();
    
    if (!body.text) {
      return c.json({ error: 'Text is required' }, 400);
    }
    
    const result = await validateVocabularyWithCache(
      body.text,
      c.env.DB,
      c.env.KV,
      body.config || {}
    );
    
    return c.json(result);
  } catch (error) {
    console.error('Validation error:', error);
    return c.json({
      error: 'Failed to validate vocabulary',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * POST /api/eiken/vocabulary/validate/batch
 * 複数のテキストを一括検証
 */
app.post('/validate/batch', async (c) => {
  try {
    const body = await c.req.json<{
      texts: string[];
      config?: Partial<ValidationConfig>;
    }>();
    
    if (!body.texts || !Array.isArray(body.texts)) {
      return c.json({ error: 'Texts array is required' }, 400);
    }
    
    if (body.texts.length > 100) {
      return c.json({ error: 'Maximum 100 texts per batch' }, 400);
    }
    
    const result = await validateBatch(
      body.texts,
      c.env.DB,
      c.env.KV,
      body.config || {}
    );
    
    return c.json(result);
  } catch (error) {
    console.error('Batch validation error:', error);
    return c.json({
      error: 'Failed to validate batch',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ====================
// 統計API
// ====================

/**
 * GET /api/eiken/vocabulary/stats
 * 語彙データベースの統計を取得
 */
app.get('/stats', async (c) => {
  try {
    const levels = ['A1', 'A2', 'B1', 'B2'] as const;
    
    const counts = await Promise.all(
      levels.map(async (level) => ({
        level,
        count: await getVocabularyCount(level, c.env.DB),
      }))
    );
    
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    
    return c.json({
      total,
      by_level: Object.fromEntries(counts.map(item => [item.level, item.count])),
      cache: getCacheStats(),
    });
  } catch (error) {
    console.error('Stats error:', error);
    return c.json({
      error: 'Failed to get statistics',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * GET /api/eiken/vocabulary/cache/stats
 * キャッシュ統計を取得
 */
app.get('/cache/stats', async (c) => {
  try {
    const stats = getCacheStats();
    return c.json(stats);
  } catch (error) {
    console.error('Cache stats error:', error);
    return c.json({
      error: 'Failed to get cache statistics',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * DELETE /api/eiken/vocabulary/cache
 * キャッシュをクリア（開発/テスト用）
 */
app.delete('/cache', async (c) => {
  try {
    await clearAllCache(c.env.KV);
    
    return c.json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    return c.json({
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ====================
// デバッグAPI (Day 1)
// ====================

/**
 * GET /api/eiken/vocabulary/debug/sql/:word
 * SQLクエリを直接テスト
 */
app.get('/debug/sql/:word', async (c) => {
  const word = c.req.param('word');
  
  try {
    const query = `
      SELECT 
        word_lemma,
        MIN(
          CASE cefr_level
            WHEN 'A1' THEN '1_A1'
            WHEN 'A2' THEN '2_A2'
            WHEN 'B1' THEN '3_B1'
            WHEN 'B2' THEN '4_B2'
            WHEN 'C1' THEN '5_C1'
            WHEN 'C2' THEN '6_C2'
            ELSE '9_ZZ'
          END
        ) as min_level_prefixed
      FROM eiken_vocabulary_lexicon 
      WHERE word_lemma = ?
      GROUP BY word_lemma
    `;
    
    const stmt = c.env.DB.prepare(query).bind(word.toLowerCase());
    const result = await stmt.first();
    
    return c.json({
      query_word: word,
      sql_result: result,
      parsed_level: result ? (result.min_level_prefixed as string).split('_')[1] : null,
    });
  } catch (error) {
    return c.json({
      error: 'SQL test failed',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ====================
// 自動リライトAPI
// ====================

/**
 * POST /api/eiken/vocabulary/rewrite
 * 語彙違反を自動修正
 */
app.post('/rewrite', async (c) => {
  try {
    const body = await c.req.json<{
      question: string;
      choices: string[];
      violations: VocabularyViolation[];
      target_level: string;
      options?: RewriteOptions;
    }>();
    
    if (!body.question || !body.choices || !body.violations || !body.target_level) {
      return c.json({ 
        error: 'Missing required fields: question, choices, violations, target_level' 
      }, 400);
    }
    
    const result = await rewriteQuestion(
      body.question,
      body.choices,
      body.violations,
      body.target_level,
      c.env,
      body.options || {}
    );
    
    return c.json(result);
    
  } catch (error) {
    console.error('Rewrite error:', error);
    return c.json({
      success: false,
      error: 'Failed to rewrite question',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * POST /api/eiken/vocabulary/rewrite/batch
 * 複数の問題を一括リライト
 */
app.post('/rewrite/batch', async (c) => {
  try {
    const body = await c.req.json<{
      questions: Array<{
        question: string;
        choices: string[];
        violations: VocabularyViolation[];
      }>;
      target_level: string;
      options?: RewriteOptions;
    }>();
    
    if (!body.questions || !Array.isArray(body.questions) || !body.target_level) {
      return c.json({ 
        error: 'Missing required fields: questions array, target_level' 
      }, 400);
    }
    
    if (body.questions.length > 20) {
      return c.json({ error: 'Maximum 20 questions per batch' }, 400);
    }
    
    const results = await rewriteQuestions(
      body.questions,
      body.target_level,
      c.env,
      body.options || {}
    );
    
    const statistics = getRewriteStatistics(results);
    
    return c.json({
      results,
      statistics,
    });
    
  } catch (error) {
    console.error('Batch rewrite error:', error);
    return c.json({
      error: 'Failed to rewrite batch',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ====================
// ヘルスチェック
// ====================

/**
 * GET /api/eiken/vocabulary/health
 * ヘルスチェックエンドポイント
 */
app.get('/health', async (c) => {
  try {
    // D1接続テスト
    const dbTest = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM eiken_vocabulary_lexicon LIMIT 1'
    ).first<{ count: number }>();
    
    return c.json({
      status: 'healthy',
      database: dbTest ? 'connected' : 'disconnected',
      vocabulary_entries: dbTest?.count || 0,
      cache: getCacheStats(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ====================
// デバッグエンドポイント
// ====================

/**
 * GET /api/eiken/vocabulary/debug/env
 * 環境変数の確認（開発/デバッグ用）
 */
app.get('/debug/env', async (c) => {
  try {
    const hasOpenAI = !!c.env.OPENAI_API_KEY;
    const keyLength = c.env.OPENAI_API_KEY?.length || 0;
    const keyPrefix = c.env.OPENAI_API_KEY?.substring(0, 10) || 'missing';
    
    return c.json({
      openai: {
        configured: hasOpenAI,
        key_length: keyLength,
        key_prefix: keyPrefix,
        key_suffix: hasOpenAI ? '...' + c.env.OPENAI_API_KEY?.substring(c.env.OPENAI_API_KEY.length - 4) : 'N/A'
      },
      database: {
        configured: !!c.env.DB,
        type: 'D1Database'
      },
      kv: {
        configured: !!c.env.KV,
        type: 'KVNamespace'
      },
      environment: 'production'
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return c.json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * POST /api/eiken/vocabulary/debug/openai-test
 * OpenAI API接続テスト
 */
app.post('/debug/openai-test', async (c) => {
  try {
    const openaiApiKey = c.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      return c.json({
        success: false,
        error: 'OpenAI API key not configured',
        has_key: false
      }, 400);
    }
    
    // Simple test request to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "test successful" if you can read this.' }
        ],
        max_tokens: 20,
        temperature: 0
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return c.json({
        success: false,
        error: `OpenAI API error: ${response.status}`,
        details: errorText,
        has_key: true,
        status_code: response.status
      }, 500);
    }
    
    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };
    
    return c.json({
      success: true,
      response: data.choices[0].message.content,
      usage: data.usage,
      has_key: true,
      message: 'OpenAI API connection successful'
    });
    
  } catch (error) {
    console.error('OpenAI test error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      has_key: !!c.env.OPENAI_API_KEY
    }, 500);
  }
});

export default app;
