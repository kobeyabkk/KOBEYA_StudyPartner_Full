/**
 * キャッシュ付き語彙バリデーション
 * 
 * vocabulary-validator.ts の高速版
 * KVキャッシュを利用してパフォーマンスを向上
 */

import type {
  VocabularyEntry,
  ValidationResult,
  ValidationConfig,
  VocabularyViolation,
  CEFRLevel,
} from '../types/vocabulary';

import { extractWords } from './vocabulary-validator';
import { lookupWordsWithCache } from './vocabulary-cache';

// ====================
// 定数
// ====================

const DEFAULT_CONFIG: ValidationConfig = {
  target_level: 'A1',
  max_violation_rate: 0.05, // 5%まで許容
  strict_mode: false,
  ignore_words: ['i'], // 一人称代名詞は必ず許容
  allow_next_level: true,
};

const CEFR_LEVEL_ORDER: Record<CEFRLevel, number> = {
  'A1': 1,
  'A2': 2,
  'B1': 3,
  'B2': 4,
  'C1': 5,
  'C2': 6,
};

// ====================
// ヘルパー関数
// ====================

function shouldIgnoreWord(word: string, ignoreList: string[]): boolean {
  return ignoreList.some(ignored => 
    word.toLowerCase() === ignored.toLowerCase()
  );
}

function isLevelAcceptable(
  actual: CEFRLevel,
  target: CEFRLevel,
  config: ValidationConfig
): boolean {
  const actualOrder = CEFR_LEVEL_ORDER[actual];
  const targetOrder = CEFR_LEVEL_ORDER[target];
  
  if (actualOrder <= targetOrder) {
    return true;
  }
  
  if (config.allow_next_level && actualOrder === targetOrder + 1) {
    return true;
  }
  
  return false;
}

function determineSeverity(
  actual: CEFRLevel,
  target: CEFRLevel
): 'error' | 'warning' | 'info' {
  const diff = CEFR_LEVEL_ORDER[actual] - CEFR_LEVEL_ORDER[target];
  
  if (diff >= 2) return 'error';
  if (diff === 1) return 'warning';
  return 'info';
}

// ====================
// メインバリデーション関数（キャッシュ付き）
// ====================

/**
 * キャッシュを利用した高速バリデーション
 */
export async function validateVocabularyWithCache(
  text: string,
  db: D1Database,
  kv: KVNamespace,
  config: Partial<ValidationConfig> = {}
): Promise<ValidationResult> {
  const startTime = Date.now();
  let cacheHits = 0;
  let cacheMisses = 0;
  
  // 設定をマージ
  const finalConfig: ValidationConfig = { ...DEFAULT_CONFIG, ...config };
  
  // 単語を抽出
  const extractedWords = extractWords(text);
  const uniqueWords = Array.from(new Set(extractedWords.map(w => w.word)));
  
  // 無視する単語を除外
  const wordsToCheck = uniqueWords.filter(
    word => !shouldIgnoreWord(word, finalConfig.ignore_words || [])
  );
  
  if (wordsToCheck.length === 0) {
    return {
      valid: true,
      total_words: 0,
      valid_words: 0,
      violations: [],
      violation_rate: 0,
      message: 'No words to validate',
      metadata: {
        execution_time_ms: Date.now() - startTime,
        cache_hits: 0,
        cache_misses: 0,
      },
    };
  }
  
  // キャッシュ付きバッチ検索
  const wordMap = await lookupWordsWithCache(wordsToCheck, db, kv);
  
  // キャッシュ統計を計算（簡易版）
  cacheHits = wordMap.size;
  cacheMisses = wordsToCheck.length - cacheHits;
  
  // 各単語をチェック
  const violations: VocabularyViolation[] = [];
  let validWords = 0;
  
  for (const word of wordsToCheck) {
    const entry = wordMap.get(word);
    
    if (!entry) {
      // 語彙データベースに存在しない
      violations.push({
        word,
        expected_level: finalConfig.target_level,
        actual_level: 'C2',
        severity: 'error',
      });
      continue;
    }
    
    // レベルチェック
    const actualLevel = entry.cefr_level as CEFRLevel;
    if (!isLevelAcceptable(actualLevel, finalConfig.target_level, finalConfig)) {
      violations.push({
        word,
        expected_level: finalConfig.target_level,
        actual_level: actualLevel,
        severity: determineSeverity(actualLevel, finalConfig.target_level),
      });
    } else {
      validWords++;
    }
  }
  
  // 厳格モードでない場合、warningレベルの違反を除外
  const significantViolations = finalConfig.strict_mode
    ? violations
    : violations.filter(v => v.severity === 'error');
  
  const violationRate = significantViolations.length / wordsToCheck.length;
  const isValid = violationRate <= finalConfig.max_violation_rate;
  
  return {
    valid: isValid,
    total_words: wordsToCheck.length,
    valid_words: validWords,
    violations: significantViolations,
    violation_rate: violationRate,
    message: isValid
      ? 'Vocabulary level is appropriate'
      : `Violation rate ${(violationRate * 100).toFixed(1)}% exceeds maximum ${(finalConfig.max_violation_rate * 100)}%`,
    metadata: {
      execution_time_ms: Date.now() - startTime,
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
    },
  };
}

/**
 * バッチバリデーション（複数のテキストを一度に検証）
 */
export async function validateMultipleTexts(
  texts: string[],
  db: D1Database,
  kv: KVNamespace,
  config: Partial<ValidationConfig> = {}
): Promise<ValidationResult[]> {
  const promises = texts.map(text => 
    validateVocabularyWithCache(text, db, kv, config)
  );
  
  return Promise.all(promises);
}

/**
 * サマリー付きバッチバリデーション
 */
export async function validateBatch(
  texts: string[],
  db: D1Database,
  kv: KVNamespace,
  config: Partial<ValidationConfig> = {}
): Promise<{
  results: ValidationResult[];
  summary: {
    total_texts: number;
    valid_texts: number;
    total_violations: number;
    average_violation_rate: number;
    total_execution_time_ms: number;
  };
}> {
  const startTime = Date.now();
  
  const results = await validateMultipleTexts(texts, db, kv, config);
  
  const summary = {
    total_texts: results.length,
    valid_texts: results.filter(r => r.valid).length,
    total_violations: results.reduce((sum, r) => sum + r.violations.length, 0),
    average_violation_rate: results.reduce((sum, r) => sum + r.violation_rate, 0) / results.length,
    total_execution_time_ms: Date.now() - startTime,
  };
  
  return { results, summary };
}
