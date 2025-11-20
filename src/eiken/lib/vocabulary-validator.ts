/**
 * 語彙バリデーションロジック
 * 
 * 目的: 生成された問題文の語彙レベルをチェックし、
 *      ターゲットレベルに適合しているかを検証する
 */

import type {
  VocabularyEntry,
  ValidationResult,
  ValidationConfig,
  VocabularyViolation,
  ExtractedWord,
  CEFRLevel,
} from '../types/vocabulary';

// ====================
// 定数
// ====================

const DEFAULT_CONFIG: ValidationConfig = {
  target_level: 'A1',
  max_violation_rate: 0.05, // 5%まで許容
  strict_mode: false,
  ignore_words: ['i'], // 一人称代名詞は必ず許容
  allow_next_level: true, // A1の場合A2も許容
};

// CEFRレベルの順序マッピング
const CEFR_LEVEL_ORDER: Record<CEFRLevel, number> = {
  'A1': 1,
  'A2': 2,
  'B1': 3,
  'B2': 4,
  'C1': 5,
  'C2': 6,
};

// ====================
// テキスト処理関数
// ====================

/**
 * テキストから単語を抽出する
 */
export function extractWords(text: string): ExtractedWord[] {
  // 単語境界で分割（アポストロフィは保持）- 元のテキストから抽出
  const wordPattern = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;
  const matches = Array.from(text.matchAll(wordPattern));
  
  return matches.map(match => ({
    word: match[0].toLowerCase(), // normalized for lookup
    original: match[0], // preserve original case
    position: match.index!,
  }));
}

/**
 * 無視すべき単語かチェック
 */
function shouldIgnoreWord(word: string, ignoreList: string[]): boolean {
  return ignoreList.some(ignored => 
    word.toLowerCase() === ignored.toLowerCase()
  );
}

/**
 * レベルが許容範囲内かチェック
 */
function isLevelAcceptable(
  actual: CEFRLevel,
  target: CEFRLevel,
  config: ValidationConfig
): boolean {
  const actualOrder = CEFR_LEVEL_ORDER[actual];
  const targetOrder = CEFR_LEVEL_ORDER[target];
  
  // ターゲットレベル以下ならOK
  if (actualOrder <= targetOrder) {
    return true;
  }
  
  // 次のレベルを許容する設定の場合
  if (config.allow_next_level && actualOrder === targetOrder + 1) {
    return true;
  }
  
  return false;
}

/**
 * 違反の深刻度を判定
 */
function determineSeverity(
  actual: CEFRLevel,
  target: CEFRLevel
): 'error' | 'warning' | 'info' {
  const diff = CEFR_LEVEL_ORDER[actual] - CEFR_LEVEL_ORDER[target];
  
  if (diff >= 2) return 'error';    // 2レベル以上離れている
  if (diff === 1) return 'warning';  // 1レベル上
  return 'info';                     // それ以外
}

// ====================
// メインバリデーション関数
// ====================

/**
 * 語彙バリデーションのメイン関数
 */
export async function validateVocabulary(
  text: string,
  db: D1Database,
  config: Partial<ValidationConfig> = {}
): Promise<ValidationResult> {
  const startTime = Date.now();
  
  // 設定をマージ
  const finalConfig: ValidationConfig = { ...DEFAULT_CONFIG, ...config };
  
  // 単語を抽出
  const extractedWords = extractWords(text);
  const uniqueWords = Array.from(new Set(extractedWords.map(w => w.word)));
  
  // 固有名詞を除外（元のテキストで大文字判定）
  const wordsWithOriginal = extractedWords.filter(item => {
    // Check if the original word starts with a capital letter
    const firstChar = item.original[0];
    if (firstChar && firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
      // Skip if it's a proper noun (capitalized in original text)
      return false;
    }
    return true;
  });
  
  const wordsAfterProperNounFilter = Array.from(new Set(wordsWithOriginal.map(w => w.word)));
  
  // 無視する単語を除外
  const wordsToCheck = wordsAfterProperNounFilter.filter(word => {
    return !shouldIgnoreWord(word, finalConfig.ignore_words || []);
  });
  
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
      },
    };
  }
  
  // バッチでD1検索
  const violations: VocabularyViolation[] = [];
  let validWords = 0;
  
  // SQLクエリを構築（IN句を使用）
  const placeholders = wordsToCheck.map(() => '?').join(',');
  const query = `
    SELECT word_lemma as word, word_lemma as base_form, pos, cefr_level, grade_level as eiken_grade
    FROM eiken_vocabulary_lexicon
    WHERE word_lemma IN (${placeholders})
  `;
  
  const stmt = db.prepare(query).bind(...wordsToCheck);
  const result = await stmt.all<VocabularyEntry>();
  
  // 結果をMapに変換
  const wordMap = new Map<string, VocabularyEntry>();
  if (result.results) {
    for (const entry of result.results) {
      wordMap.set(entry.word, entry);
    }
  }
  
  // 各単語をチェック
  for (const word of wordsToCheck) {
    const entry = wordMap.get(word);
    
    if (!entry) {
      // 語彙データベースに存在しない = 高難度の可能性
      violations.push({
        word,
        expected_level: finalConfig.target_level,
        actual_level: 'C2', // 不明な単語は最高レベルと仮定
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
    },
  };
}

// ====================
// ヘルパー関数
// ====================

/**
 * 単語の基本形を取得（レマタイゼーション）
 */
export async function lemmatize(
  word: string,
  db: D1Database
): Promise<string> {
  const normalized = word.toLowerCase();
  
  const stmt = db.prepare(
    'SELECT word_lemma as base_form FROM eiken_vocabulary_lexicon WHERE word_lemma = ? LIMIT 1'
  ).bind(normalized);
  
  const result = await stmt.first<{ base_form: string }>();
  
  return result?.base_form || normalized;
}

/**
 * 語彙エントリーを検索
 */
export async function lookupWord(
  word: string,
  db: D1Database
): Promise<VocabularyEntry | null> {
  const normalized = word.toLowerCase();
  
  // Get all entries for this word
  const stmt = db.prepare(
    'SELECT * FROM eiken_vocabulary_lexicon WHERE word_lemma = ?'
  ).bind(normalized);
  
  const results = await stmt.all<VocabularyEntry>();
  
  if (!results.results || results.results.length === 0) {
    return null;
  }
  
  // Select the entry with the lowest CEFR level
  const levelOrder: Record<string, number> = {
    'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6
  };
  
  const sorted = results.results.sort((a, b) => {
    const orderA = levelOrder[a.cefr_level] || 999;
    const orderB = levelOrder[b.cefr_level] || 999;
    return orderA - orderB;
  });
  
  return sorted[0];
}

/**
 * 複数の単語を一括検索
 */
export async function lookupWords(
  words: string[],
  db: D1Database
): Promise<Map<string, VocabularyEntry>> {
  const normalized = words.map(w => w.toLowerCase());
  const unique = Array.from(new Set(normalized));
  
  if (unique.length === 0) {
    return new Map();
  }
  
  const placeholders = unique.map(() => '?').join(',');
  const query = `SELECT * FROM eiken_vocabulary_lexicon WHERE word_lemma IN (${placeholders})`;
  
  const stmt = db.prepare(query).bind(...unique);
  const result = await stmt.all<VocabularyEntry>();
  
  const map = new Map<string, VocabularyEntry>();
  if (result.results) {
    for (const entry of result.results) {
      map.set(entry.word_lemma, entry);
    }
  }
  
  return map;
}

/**
 * 指定レベルの語彙数を取得
 */
export async function getVocabularyCount(
  level: CEFRLevel,
  db: D1Database
): Promise<number> {
  const stmt = db.prepare(
    'SELECT COUNT(*) as count FROM eiken_vocabulary_lexicon WHERE cefr_level = ?'
  ).bind(level);
  
  const result = await stmt.first<{ count: number }>();
  
  return result?.count || 0;
}
