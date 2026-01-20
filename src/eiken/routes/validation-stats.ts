/**
 * Phase 6.9: Validation Statistics API
 * 
 * 複数正解検証の統計情報を確認するためのAPI
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/eiken/validation/stats
 * 
 * 複数正解検証の統計を取得
 */
app.get('/stats', async (c) => {
  const db = c.env.DB;
  
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  try {
    // 最近の検証結果を取得
    const recentValidations = await db
      .prepare(`
        SELECT 
          validation_stage,
          validation_passed,
          grade,
          format,
          COUNT(*) as count,
          DATE(created_at) as date
        FROM question_validation_logs
        WHERE validation_stage = 'uniqueness'
          AND created_at >= datetime('now', '-7 days')
        GROUP BY validation_stage, validation_passed, grade, format, DATE(created_at)
        ORDER BY created_at DESC
      `)
      .all();

    // 失敗した検証の詳細を取得
    const failedValidations = await db
      .prepare(`
        SELECT 
          student_id,
          grade,
          format,
          topic_code,
          validation_details,
          created_at
        FROM question_validation_logs
        WHERE validation_stage = 'uniqueness'
          AND validation_passed = 0
          AND created_at >= datetime('now', '-7 days')
        ORDER BY created_at DESC
        LIMIT 50
      `)
      .all();

    // 統計サマリーを計算
    const summary = {
      total: 0,
      passed: 0,
      failed: 0,
      pass_rate: 0,
      by_grade: {} as Record<string, { total: number; passed: number; failed: number }>,
      by_format: {} as Record<string, { total: number; passed: number; failed: number }>
    };

    for (const row of recentValidations.results) {
      const count = Number(row.count);
      summary.total += count;
      
      if (row.validation_passed) {
        summary.passed += count;
      } else {
        summary.failed += count;
      }

      // By grade
      const grade = String(row.grade);
      if (!summary.by_grade[grade]) {
        summary.by_grade[grade] = { total: 0, passed: 0, failed: 0 };
      }
      summary.by_grade[grade].total += count;
      if (row.validation_passed) {
        summary.by_grade[grade].passed += count;
      } else {
        summary.by_grade[grade].failed += count;
      }

      // By format
      const format = String(row.format);
      if (!summary.by_format[format]) {
        summary.by_format[format] = { total: 0, passed: 0, failed: 0 };
      }
      summary.by_format[format].total += count;
      if (row.validation_passed) {
        summary.by_format[format].passed += count;
      } else {
        summary.by_format[format].failed += count;
      }
    }

    summary.pass_rate = summary.total > 0 
      ? Math.round((summary.passed / summary.total) * 100) 
      : 0;

    return c.json({
      success: true,
      summary,
      recent: recentValidations.results,
      failed_details: failedValidations.results.map((row: any) => ({
        ...row,
        validation_details: row.validation_details ? JSON.parse(row.validation_details) : null
      }))
    });

  } catch (error) {
    console.error('[Validation Stats Error]', error);
    return c.json({
      error: 'Failed to fetch validation statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/validation/recent-failures
 * 
 * 最近失敗した検証の詳細を取得（デバッグ用）
 */
app.get('/recent-failures', async (c) => {
  const db = c.env.DB;
  const limit = Number(c.req.query('limit')) || 20;
  
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  try {
    const failures = await db
      .prepare(`
        SELECT 
          student_id,
          grade,
          format,
          topic_code,
          attempt_number,
          validation_details,
          model_used,
          created_at
        FROM question_validation_logs
        WHERE validation_stage = 'uniqueness'
          AND validation_passed = 0
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all();

    return c.json({
      success: true,
      count: failures.results.length,
      failures: failures.results.map((row: any) => ({
        ...row,
        validation_details: row.validation_details ? JSON.parse(row.validation_details) : null,
        created_at: new Date(row.created_at).toISOString()
      }))
    });

  } catch (error) {
    console.error('[Recent Failures Error]', error);
    return c.json({
      error: 'Failed to fetch recent failures',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
