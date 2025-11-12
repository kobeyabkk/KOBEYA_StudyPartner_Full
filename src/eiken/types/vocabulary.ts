/**
 * 語彙バリデーション関連の型定義
 */

// ====================
// 語彙データベース型
// ====================

export type PartOfSpeech = 'verb' | 'noun' | 'adjective' | 'adverb' | 'other';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type ExpansionType = 'regular' | 'irregular';

export interface VocabularyEntry {
  id: number;
  word: string;                    // 活用形（小文字正規化済み）
  base_form: string;               // 基本形/レンマ
  pos: PartOfSpeech;               // 品詞
  cefr_level: CEFRLevel;           // CEFRレベル
  eiken_grade: string;             // 英検級 ('5', '4', '3', 'pre-2', '2', 'pre-1', '1')
  zipf_score: number;              // 頻度スコア (0-7)
  is_base_form: boolean;           // 基本形かどうか (0/1 -> boolean)
  expansion_type: ExpansionType;   // 展開タイプ
  sources: string;                 // データソース（JSON文字列）
  confidence: number;              // 信頼度スコア (0-1)
  created_at: string;
  updated_at: string;
}

// ====================
// バリデーション結果型
// ====================

export type ViolationSeverity = 'error' | 'warning' | 'info';

export interface VocabularyViolation {
  word: string;                    // 問題のある単語
  expected_level: CEFRLevel;       // 期待されるレベル（例: A1）
  actual_level: CEFRLevel;         // 実際のレベル（例: B1）
  severity: ViolationSeverity;     // 違反の深刻度
  position?: number;               // テキスト内の位置（オプション）
  context?: string;                // 前後のコンテキスト（オプション）
}

export interface ValidationResult {
  valid: boolean;                  // 全体として有効かどうか
  total_words: number;             // 検証した単語数
  valid_words: number;             // 有効な単語数
  violations: VocabularyViolation[]; // 違反リスト
  violation_rate: number;          // 違反率 (0-1)
  message?: string;                // 追加メッセージ
  metadata?: {
    execution_time_ms: number;     // 実行時間
    cache_hits?: number;           // キャッシュヒット数
    cache_misses?: number;         // キャッシュミス数
  };
}

// ====================
// バリデーション設定
// ====================

export interface ValidationConfig {
  target_level: CEFRLevel;         // ターゲットレベル
  max_violation_rate: number;      // 許容違反率 (例: 0.05 = 5%)
  strict_mode: boolean;            // 厳格モード（警告も含める）
  ignore_words?: string[];         // 無視する単語リスト（固有名詞など）
  allow_next_level?: boolean;      // 次のレベル（A1→A2）を許可するか
}

// ====================
// 単語抽出結果
// ====================

export interface ExtractedWord {
  word: string;                    // 正規化された単語
  original: string;                // 元のテキスト
  position: number;                // 位置
  context?: string;                // 前後のコンテキスト
}

// ====================
// レマタイゼーション結果
// ====================

export interface LemmatizationResult {
  original: string;                // 元の単語
  lemma: string;                   // レンマ（基本形）
  pos?: PartOfSpeech;              // 品詞（検出できた場合）
  confidence: number;              // 信頼度 (0-1)
  method: 'exact' | 'irregular' | 'rule' | 'fallback'; // 方法
}

// ====================
// キャッシュエントリー
// ====================

export interface VocabularyCache {
  word: string;
  entry: VocabularyEntry | null;   // null = 語彙に存在しない
  timestamp: number;               // UNIX timestamp
  ttl: number;                     // Time to live (seconds)
}

// ====================
// バッチバリデーション
// ====================

export interface BatchValidationRequest {
  texts: string[];                 // 検証するテキストのリスト
  config: ValidationConfig;
}

export interface BatchValidationResponse {
  results: ValidationResult[];
  summary: {
    total_texts: number;
    valid_texts: number;
    total_violations: number;
    average_violation_rate: number;
  };
}

// ====================
// 統計情報
// ====================

export interface VocabularyStats {
  total_entries: number;
  by_level: Record<CEFRLevel, number>;
  by_pos: Record<PartOfSpeech, number>;
  by_expansion_type: Record<ExpansionType, number>;
  irregular_count: number;
}
