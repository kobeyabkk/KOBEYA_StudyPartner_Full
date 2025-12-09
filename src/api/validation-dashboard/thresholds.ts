/**
 * Phase 5E: Validation Thresholds API
 * 
 * 検証閾値の取得・更新API
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface ValidationThreshold {
  id?: number;
  grade: string;
  format: string;
  vocabulary_threshold?: number;
  vocabulary_enabled: boolean;
  copyright_threshold?: number;
  copyright_enabled: boolean;
  grammar_enabled: boolean;
  grammar_max_words_per_sentence?: number;
  grammar_max_clauses?: number;
  uniqueness_enabled: boolean;
  duplicate_enabled: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * 閾値を取得（fallback順: 指定grade+format → grade+default → default+default）
 */
export async function getThreshold(
  db: D1Database,
  grade: string,
  format: string
): Promise<ValidationThreshold> {
  // 1. 指定されたgrade+formatを試す
  let threshold = await db
    .prepare('SELECT * FROM validation_thresholds WHERE grade = ? AND format = ?')
    .bind(grade, format)
    .first();

  // 2. なければgrade+defaultを試す
  if (!threshold) {
    threshold = await db
      .prepare('SELECT * FROM validation_thresholds WHERE grade = ? AND format = ?')
      .bind(grade, 'default')
      .first();
  }

  // 3. なければdefault+defaultを使う
  if (!threshold) {
    threshold = await db
      .prepare('SELECT * FROM validation_thresholds WHERE grade = ? AND format = ?')
      .bind('default', 'default')
      .first();
  }

  // デフォルト値（DBにも何もない場合）
  if (!threshold) {
    return {
      grade: 'default',
      format: 'default',
      vocabulary_threshold: 85.0,
      vocabulary_enabled: true,
      copyright_threshold: 85.0,
      copyright_enabled: true,
      grammar_enabled: true,
      uniqueness_enabled: true,
      duplicate_enabled: true,
    };
  }

  return threshold as ValidationThreshold;
}

/**
 * すべての閾値設定を取得
 */
export async function getAllThresholds(db: D1Database): Promise<ValidationThreshold[]> {
  const result = await db
    .prepare('SELECT * FROM validation_thresholds ORDER BY grade, format')
    .all();

  return (result.results || []) as ValidationThreshold[];
}

/**
 * 閾値を更新または作成
 */
export async function upsertThreshold(
  db: D1Database,
  threshold: ValidationThreshold,
  changedBy?: string
): Promise<ValidationThreshold> {
  // 既存レコードを確認
  const existing = await db
    .prepare('SELECT * FROM validation_thresholds WHERE grade = ? AND format = ?')
    .bind(threshold.grade, threshold.format)
    .first();

  if (existing) {
    // 更新
    await db
      .prepare(`
        UPDATE validation_thresholds
        SET vocabulary_threshold = ?,
            vocabulary_enabled = ?,
            copyright_threshold = ?,
            copyright_enabled = ?,
            grammar_enabled = ?,
            grammar_max_words_per_sentence = ?,
            grammar_max_clauses = ?,
            uniqueness_enabled = ?,
            duplicate_enabled = ?,
            description = ?,
            updated_at = datetime('now')
        WHERE grade = ? AND format = ?
      `)
      .bind(
        threshold.vocabulary_threshold || null,
        threshold.vocabulary_enabled ? 1 : 0,
        threshold.copyright_threshold || null,
        threshold.copyright_enabled ? 1 : 0,
        threshold.grammar_enabled ? 1 : 0,
        threshold.grammar_max_words_per_sentence || null,
        threshold.grammar_max_clauses || null,
        threshold.uniqueness_enabled ? 1 : 0,
        threshold.duplicate_enabled ? 1 : 0,
        threshold.description || null,
        threshold.grade,
        threshold.format
      )
      .run();

    // 変更履歴を記録
    await db
      .prepare(`
        INSERT INTO validation_threshold_history (threshold_id, changed_by, change_type, old_values, new_values)
        VALUES (?, ?, 'update', ?, ?)
      `)
      .bind(
        (existing as any).id,
        changedBy || 'system',
        JSON.stringify(existing),
        JSON.stringify(threshold)
      )
      .run();

    return { ...threshold, id: (existing as any).id };
  } else {
    // 新規作成
    const result = await db
      .prepare(`
        INSERT INTO validation_thresholds (
          grade, format, vocabulary_threshold, vocabulary_enabled,
          copyright_threshold, copyright_enabled, grammar_enabled,
          grammar_max_words_per_sentence, grammar_max_clauses,
          uniqueness_enabled, duplicate_enabled, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `)
      .bind(
        threshold.grade,
        threshold.format,
        threshold.vocabulary_threshold || null,
        threshold.vocabulary_enabled ? 1 : 0,
        threshold.copyright_threshold || null,
        threshold.copyright_enabled ? 1 : 0,
        threshold.grammar_enabled ? 1 : 0,
        threshold.grammar_max_words_per_sentence || null,
        threshold.grammar_max_clauses || null,
        threshold.uniqueness_enabled ? 1 : 0,
        threshold.duplicate_enabled ? 1 : 0,
        threshold.description || null
      )
      .first();

    // 変更履歴を記録
    if (result) {
      await db
        .prepare(`
          INSERT INTO validation_threshold_history (threshold_id, changed_by, change_type, new_values)
          VALUES (?, ?, 'create', ?)
        `)
        .bind((result as any).id, changedBy || 'system', JSON.stringify(result))
        .run();
    }

    return result as ValidationThreshold;
  }
}

/**
 * 閾値を削除
 */
export async function deleteThreshold(
  db: D1Database,
  grade: string,
  format: string,
  changedBy?: string
): Promise<boolean> {
  const existing = await db
    .prepare('SELECT * FROM validation_thresholds WHERE grade = ? AND format = ?')
    .bind(grade, format)
    .first();

  if (!existing) {
    return false;
  }

  // 変更履歴を記録
  await db
    .prepare(`
      INSERT INTO validation_threshold_history (threshold_id, changed_by, change_type, old_values)
      VALUES (?, ?, 'delete', ?)
    `)
    .bind((existing as any).id, changedBy || 'system', JSON.stringify(existing))
    .run();

  // 削除
  await db
    .prepare('DELETE FROM validation_thresholds WHERE grade = ? AND format = ?')
    .bind(grade, format)
    .run();

  return true;
}

/**
 * 変更履歴を取得
 */
export async function getThresholdHistory(
  db: D1Database,
  limit: number = 50
): Promise<any[]> {
  const result = await db
    .prepare(`
      SELECT * FROM validation_threshold_history
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(limit)
    .all();

  return result.results || [];
}
