/**
 * Phase 5D: Validation Dashboard API - Statistics Endpoint
 * 
 * 検証ログの統計情報を取得するAPI
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface ValidationStats {
  // 総合統計
  overview: {
    total_attempts: number;
    successful_generations: number;
    failed_generations: number;
    success_rate: number;
    average_attempts_per_question: number;
  };
  
  // 形式別統計
  by_format: Array<{
    format: string;
    total: number;
    success: number;
    failed: number;
    success_rate: number;
  }>;
  
  // 級別統計
  by_grade: Array<{
    grade: string;
    total: number;
    success: number;
    failed: number;
    success_rate: number;
  }>;
  
  // 失敗理由の内訳
  failure_reasons: {
    vocabulary: number;
    copyright: number;
    grammar: number;
    uniqueness: number;
    duplicate: number;
  };
  
  // 時系列データ（直近7日間）
  timeline: Array<{
    date: string;
    total: number;
    success: number;
    failed: number;
    success_rate: number;
  }>;
  
  // 検証ステージ別の通過率
  validation_stages: Array<{
    stage: string;
    total: number;
    passed: number;
    failed: number;
    pass_rate: number;
  }>;
}

/**
 * 検証統計を取得
 */
export async function getValidationStats(
  db: D1Database,
  options: {
    days?: number;  // デフォルト7日間
    format?: string;
    grade?: string;
  } = {}
): Promise<ValidationStats> {
  const days = options.days || 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  // 総合統計
  const overviewQuery = await db
    .prepare(`
      SELECT 
        COUNT(*) as total_attempts,
        SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN validation_passed = 0 THEN 1 ELSE 0 END) as failed
      FROM question_validation_logs
      WHERE DATE(created_at) >= ?
      ${options.format ? 'AND format = ?' : ''}
      ${options.grade ? 'AND grade = ?' : ''}
    `)
    .bind(
      cutoffDateStr,
      ...(options.format ? [options.format] : []),
      ...(options.grade ? [options.grade] : [])
    )
    .first();

  const totalAttempts = overviewQuery?.total_attempts || 0;
  const successful = overviewQuery?.successful || 0;
  const failed = overviewQuery?.failed || 0;
  const successRate = totalAttempts > 0 ? (successful / totalAttempts) * 100 : 0;

  // 形式別統計
  const formatStatsResults = await db
    .prepare(`
      SELECT 
        format,
        COUNT(*) as total,
        SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN validation_passed = 0 THEN 1 ELSE 0 END) as failed
      FROM question_validation_logs
      WHERE DATE(created_at) >= ?
      ${options.grade ? 'AND grade = ?' : ''}
      GROUP BY format
      ORDER BY total DESC
    `)
    .bind(cutoffDateStr, ...(options.grade ? [options.grade] : []))
    .all();

  const byFormat = (formatStatsResults.results || []).map((row: any) => ({
    format: row.format,
    total: row.total,
    success: row.success,
    failed: row.failed,
    success_rate: row.total > 0 ? (row.success / row.total) * 100 : 0,
  }));

  // 級別統計
  const gradeStatsResults = await db
    .prepare(`
      SELECT 
        grade,
        COUNT(*) as total,
        SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN validation_passed = 0 THEN 1 ELSE 0 END) as failed
      FROM question_validation_logs
      WHERE DATE(created_at) >= ?
      ${options.format ? 'AND format = ?' : ''}
      GROUP BY grade
      ORDER BY 
        CASE grade
          WHEN '5' THEN 1
          WHEN '4' THEN 2
          WHEN '3' THEN 3
          WHEN 'pre-2' THEN 4
          WHEN '2' THEN 5
          WHEN 'pre-1' THEN 6
          WHEN '1' THEN 7
          ELSE 8
        END
    `)
    .bind(cutoffDateStr, ...(options.format ? [options.format] : []))
    .all();

  const byGrade = (gradeStatsResults.results || []).map((row: any) => ({
    grade: row.grade,
    total: row.total,
    success: row.success,
    failed: row.failed,
    success_rate: row.total > 0 ? (row.success / row.total) * 100 : 0,
  }));

  // 失敗理由の内訳（最後に失敗したステージを集計）
  const failureReasonsResults = await db
    .prepare(`
      SELECT 
        validation_stage,
        COUNT(*) as count
      FROM question_validation_logs
      WHERE DATE(created_at) >= ?
        AND validation_passed = 0
        ${options.format ? 'AND format = ?' : ''}
        ${options.grade ? 'AND grade = ?' : ''}
      GROUP BY validation_stage
    `)
    .bind(
      cutoffDateStr,
      ...(options.format ? [options.format] : []),
      ...(options.grade ? [options.grade] : [])
    )
    .all();

  const failureReasons = {
    vocabulary: 0,
    copyright: 0,
    grammar: 0,
    uniqueness: 0,
    duplicate: 0,
  };

  for (const row of failureReasonsResults.results || []) {
    const stage = (row as any).validation_stage;
    const count = (row as any).count;
    if (stage in failureReasons) {
      failureReasons[stage as keyof typeof failureReasons] = count;
    }
  }

  // 時系列データ（直近7日間）
  const timelineResults = await db
    .prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN validation_passed = 0 THEN 1 ELSE 0 END) as failed
      FROM question_validation_logs
      WHERE DATE(created_at) >= ?
        ${options.format ? 'AND format = ?' : ''}
        ${options.grade ? 'AND grade = ?' : ''}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 7
    `)
    .bind(
      cutoffDateStr,
      ...(options.format ? [options.format] : []),
      ...(options.grade ? [options.grade] : [])
    )
    .all();

  const timeline = (timelineResults.results || []).map((row: any) => ({
    date: row.date,
    total: row.total,
    success: row.success,
    failed: row.failed,
    success_rate: row.total > 0 ? (row.success / row.total) * 100 : 0,
  })).reverse();

  // 検証ステージ別の通過率
  const stageStatsResults = await db
    .prepare(`
      SELECT 
        validation_stage,
        COUNT(*) as total,
        SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN validation_passed = 0 THEN 1 ELSE 0 END) as failed
      FROM question_validation_logs
      WHERE DATE(created_at) >= ?
        ${options.format ? 'AND format = ?' : ''}
        ${options.grade ? 'AND grade = ?' : ''}
      GROUP BY validation_stage
      ORDER BY 
        CASE validation_stage
          WHEN 'duplicate' THEN 1
          WHEN 'grammar' THEN 2
          WHEN 'vocabulary' THEN 3
          WHEN 'copyright' THEN 4
          WHEN 'uniqueness' THEN 5
          ELSE 6
        END
    `)
    .bind(
      cutoffDateStr,
      ...(options.format ? [options.format] : []),
      ...(options.grade ? [options.grade] : [])
    )
    .all();

  const validationStages = (stageStatsResults.results || []).map((row: any) => ({
    stage: row.validation_stage,
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    pass_rate: row.total > 0 ? (row.passed / row.total) * 100 : 0,
  }));

  // 平均試行回数を計算（セッション統計から）
  const avgAttemptsResult = await db
    .prepare(`
      SELECT 
        AVG(total_attempts * 1.0 / NULLIF(successful_generations, 0)) as avg_attempts
      FROM generation_sessions
      WHERE DATE(started_at) >= ?
        AND successful_generations > 0
        ${options.format ? 'AND format = ?' : ''}
        ${options.grade ? 'AND grade = ?' : ''}
    `)
    .bind(
      cutoffDateStr,
      ...(options.format ? [options.format] : []),
      ...(options.grade ? [options.grade] : [])
    )
    .first();

  const avgAttempts = avgAttemptsResult?.avg_attempts || 1.0;

  return {
    overview: {
      total_attempts: totalAttempts,
      successful_generations: successful,
      failed_generations: failed,
      success_rate: Math.round(successRate * 10) / 10,
      average_attempts_per_question: Math.round(avgAttempts * 10) / 10,
    },
    by_format: byFormat,
    by_grade: byGrade,
    failure_reasons: failureReasons,
    timeline: timeline,
    validation_stages: validationStages,
  };
}

/**
 * 最近の検証ログを取得（リアルタイム監視用）
 */
export async function getRecentValidationLogs(
  db: D1Database,
  limit: number = 50
): Promise<any[]> {
  const results = await db
    .prepare(`
      SELECT 
        id,
        student_id,
        grade,
        format,
        topic_code,
        attempt_number,
        validation_stage,
        validation_passed,
        validation_details,
        model_used,
        generation_mode,
        created_at
      FROM question_validation_logs
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(limit)
    .all();

  return results.results || [];
}
