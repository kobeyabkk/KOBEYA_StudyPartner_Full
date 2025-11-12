/**
 * 語彙バリデーションAPIルート
 */

import { Hono } from 'hono';
import type { EikenEnv } from '../types';
import type { ValidationConfig } from '../types/vocabulary';
import { validateVocabularyWithCache, validateBatch } from '../lib/vocabulary-validator-cached';
import { lookupWordWithCache, getCacheStats, clearAllCache } from '../lib/vocabulary-cache';
import { getVocabularyCount } from '../lib/vocabulary-validator';

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

export default app;
