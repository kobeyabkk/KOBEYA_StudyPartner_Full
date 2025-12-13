/**
 * Vocabulary API Routes
 * CEFR-J Wordlist検索エンドポイント
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/eiken/vocabulary/search
 * 
 * 語彙検索API
 * 
 * Query Parameters:
 *   - level: CEFRレベル (A1, A2, B1, B2) 必須
 *   - pos: 品詞フィルタ (noun, verb, adjective, adverb等) オプション
 *   - limit: 取得件数 (default: 100, max: 1000)
 *   - offset: オフセット (default: 0)
 *   - random: ランダム抽出 (true/false, default: false)
 * 
 * Example:
 *   /api/eiken/vocabulary/search?level=A2&limit=200
 *   /api/eiken/vocabulary/search?level=B1&pos=verb&random=true&limit=50
 */
app.get('/search', async (c) => {
  try {
    const db = c.env.DB;
    
    if (!db) {
      return c.json({
        success: false,
        error: 'Database not configured'
      }, 500);
    }
    
    // クエリパラメータを取得
    const level = c.req.query('level');
    const pos = c.req.query('pos');
    const limitStr = c.req.query('limit') || '100';
    const offsetStr = c.req.query('offset') || '0';
    const random = c.req.query('random') === 'true';
    
    // バリデーション
    if (!level) {
      return c.json({
        success: false,
        error: 'Parameter "level" is required (A1, A2, B1, B2)'
      }, 400);
    }
    
    const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    if (!validLevels.includes(level.toUpperCase())) {
      return c.json({
        success: false,
        error: `Invalid level "${level}". Must be one of: ${validLevels.join(', ')}`
      }, 400);
    }
    
    const limit = Math.min(parseInt(limitStr, 10), 1000);
    const offset = parseInt(offsetStr, 10);
    
    if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
      return c.json({
        success: false,
        error: 'Invalid limit or offset'
      }, 400);
    }
    
    // SQLクエリを構築
    let sql = `
      SELECT 
        word_lemma,
        pos,
        cefr_level,
        confidence
      FROM eiken_vocabulary_lexicon
      WHERE cefr_level = ?
    `;
    
    const params: any[] = [level.toUpperCase()];
    
    // 品詞フィルタ
    if (pos) {
      sql += ' AND pos = ?';
      params.push(pos);
    }
    
    // ランダム抽出またはソート
    if (random) {
      sql += ' ORDER BY RANDOM()';
    } else {
      sql += ' ORDER BY word_lemma ASC';
    }
    
    // LIMIT/OFFSET
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    console.log('[Vocabulary API] Query:', { level, pos, limit, offset, random });
    
    // クエリ実行
    const result = await db.prepare(sql).bind(...params).all();
    
    if (!result.success) {
      console.error('[Vocabulary API] Query failed:', result);
      return c.json({
        success: false,
        error: 'Database query failed'
      }, 500);
    }
    
    // 総件数を取得（ページネーション用）
    let countSql = `
      SELECT COUNT(*) as total
      FROM eiken_vocabulary_lexicon
      WHERE cefr_level = ?
    `;
    
    const countParams: any[] = [level.toUpperCase()];
    
    if (pos) {
      countSql += ' AND pos = ?';
      countParams.push(pos);
    }
    
    const countResult = await db.prepare(countSql).bind(...countParams).first<{ total: number }>();
    const total = countResult?.total || 0;
    
    return c.json({
      success: true,
      data: {
        words: result.results,
        meta: {
          total,
          limit,
          offset,
          count: result.results.length,
          level: level.toUpperCase(),
          pos: pos || null,
          random
        }
      }
    });
    
  } catch (error) {
    console.error('[Vocabulary API] Error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/vocabulary/stats
 * 
 * 語彙統計情報API
 * 
 * レベル別・品詞別の統計情報を返す
 */
app.get('/stats', async (c) => {
  try {
    const db = c.env.DB;
    
    if (!db) {
      return c.json({
        success: false,
        error: 'Database not configured'
      }, 500);
    }
    
    // レベル別統計
    const levelStats = await db.prepare(`
      SELECT 
        cefr_level,
        COUNT(*) as count
      FROM eiken_vocabulary_lexicon
      GROUP BY cefr_level
      ORDER BY cefr_level
    `).all();
    
    // 品詞別統計（上位10件）
    const posStats = await db.prepare(`
      SELECT 
        pos,
        COUNT(*) as count
      FROM eiken_vocabulary_lexicon
      GROUP BY pos
      ORDER BY count DESC
      LIMIT 10
    `).all();
    
    // 総単語数
    const totalResult = await db.prepare(`
      SELECT COUNT(*) as total
      FROM eiken_vocabulary_lexicon
    `).first<{ total: number }>();
    
    return c.json({
      success: true,
      data: {
        total: totalResult?.total || 0,
        by_level: levelStats.results,
        by_pos: posStats.results
      }
    });
    
  } catch (error) {
    console.error('[Vocabulary Stats API] Error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/vocabulary/check
 * 
 * 語彙レベル検証API
 * 
 * Query Parameters:
 *   - word: チェックする単語 (必須)
 * 
 * Example:
 *   /api/eiken/vocabulary/check?word=important
 */
app.get('/check', async (c) => {
  try {
    const db = c.env.DB;
    
    if (!db) {
      return c.json({
        success: false,
        error: 'Database not configured'
      }, 500);
    }
    
    const word = c.req.query('word');
    
    if (!word) {
      return c.json({
        success: false,
        error: 'Parameter "word" is required'
      }, 400);
    }
    
    // 単語を検索（大文字小文字を区別しない）
    const result = await db.prepare(`
      SELECT 
        word_lemma,
        pos,
        cefr_level,
        confidence,
        sources
      FROM eiken_vocabulary_lexicon
      WHERE LOWER(word_lemma) = LOWER(?)
    `).bind(word.trim()).all();
    
    if (!result.success) {
      return c.json({
        success: false,
        error: 'Database query failed'
      }, 500);
    }
    
    return c.json({
      success: true,
      data: {
        word: word.trim(),
        found: result.results.length > 0,
        entries: result.results
      }
    });
    
  } catch (error) {
    console.error('[Vocabulary Check API] Error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
