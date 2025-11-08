/**
 * 英検対策システム - データベースユーティリティ
 * V3設計書に基づく実装
 */

import type { EikenEnv } from '../types';

/**
 * 外部キー制約を有効化
 * 各リクエストの開始時に実行する必要がある
 */
export async function enableForeignKeys(env: EikenEnv): Promise<void> {
  await env.DB.exec('PRAGMA foreign_keys = ON;');
}

/**
 * 外部キー制約が有効かチェック
 */
export async function checkForeignKeys(env: EikenEnv): Promise<boolean> {
  const result = await env.DB.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>();
  return result?.foreign_keys === 1;
}

/**
 * updated_atを現在時刻に更新
 * V3では、トリガーを使わずアプリケーション層で明示的に更新
 */
export function withUpdatedAt<T extends Record<string, unknown>>(data: T): T & { updated_at: string } {
  return {
    ...data,
    updated_at: new Date().toISOString()
  };
}

/**
 * D1バッチトランザクションのヘルパー
 * 全て成功するか、全て失敗するかの原子性を保証
 */
export async function executeBatch(
  env: EikenEnv,
  statements: D1PreparedStatement[]
): Promise<D1Result[]> {
  if (statements.length === 0) {
    return [];
  }
  
  try {
    const results = await env.DB.batch(statements);
    return results;
  } catch (error) {
    console.error('Batch transaction failed:', error);
    throw new Error(`Database batch transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * JSON文字列のバリデーション
 */
export function validateJSON(jsonString: string | null | undefined): boolean {
  if (!jsonString) return false;
  
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * JSON配列のパース（安全版）
 */
export function parseJSONArray<T = unknown>(jsonString: string | null | undefined): T[] {
  if (!jsonString) return [];
  
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Failed to parse JSON array:', jsonString);
    return [];
  }
}

/**
 * JSONオブジェクトのパース（安全版）
 */
export function parseJSONObject<T = Record<string, unknown>>(
  jsonString: string | null | undefined
): T | null {
  if (!jsonString) return null;
  
  try {
    const parsed = JSON.parse(jsonString);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    console.error('Failed to parse JSON object:', jsonString);
    return null;
  }
}

/**
 * MCQの選択肢数を検証（V3修正版）
 * CHECK制約では静的上限10を使用し、アプリ層で厳密に検証
 */
export function validateMCQChoices(choices: string[]): { valid: boolean; error?: string } {
  if (!Array.isArray(choices)) {
    return { valid: false, error: 'Choices must be an array' };
  }
  
  if (choices.length < 2) {
    return { valid: false, error: 'Must have at least 2 choices' };
  }
  
  if (choices.length > 4) {
    return { valid: false, error: 'Cannot have more than 4 choices for MCQ' };
  }
  
  // 選択肢の一意性チェック
  const uniqueChoices = new Set(choices.map(c => c.trim().toLowerCase()));
  if (uniqueChoices.size !== choices.length) {
    return { valid: false, error: 'Choices must be unique' };
  }
  
  // 空の選択肢チェック
  if (choices.some(c => !c || c.trim().length === 0)) {
    return { valid: false, error: 'Choices cannot be empty' };
  }
  
  return { valid: true };
}

/**
 * 正解インデックスの検証
 */
export function validateCorrectAnswerIndex(
  index: number,
  choicesLength: number
): { valid: boolean; error?: string } {
  if (!Number.isInteger(index)) {
    return { valid: false, error: 'Answer index must be an integer' };
  }
  
  if (index < 0) {
    return { valid: false, error: 'Answer index cannot be negative' };
  }
  
  if (index >= choicesLength) {
    return { valid: false, error: `Answer index ${index} out of range (0-${choicesLength - 1})` };
  }
  
  return { valid: true };
}

/**
 * 難易度スコアの検証
 */
export function validateDifficultyScore(score: number): { valid: boolean; error?: string } {
  if (typeof score !== 'number' || isNaN(score)) {
    return { valid: false, error: 'Difficulty score must be a number' };
  }
  
  if (score < 0.0 || score > 1.0) {
    return { valid: false, error: 'Difficulty score must be between 0.0 and 1.0' };
  }
  
  return { valid: true };
}

/**
 * 英検級の検証
 */
export function validateGrade(grade: string): grade is '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' {
  return ['5', '4', '3', 'pre2', '2', 'pre1', '1'].includes(grade);
}
