-- Phase 5E: Validation Thresholds Configuration Table
-- 検証の閾値を管理画面から調整可能にする

CREATE TABLE IF NOT EXISTS validation_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 対象
  grade TEXT NOT NULL,          -- 5, 4, 3, pre-2, 2, pre-1, 1, または 'default'
  format TEXT NOT NULL,          -- grammar_fill, long_reading, など、または 'default'
  
  -- 語彙レベル閾値
  vocabulary_threshold REAL,     -- 70-100% の範囲
  vocabulary_enabled BOOLEAN DEFAULT 1,
  
  -- 著作権類似度閾値
  copyright_threshold REAL,      -- 0-100% の範囲（高いほど類似を許容）
  copyright_enabled BOOLEAN DEFAULT 1,
  
  -- 文法複雑さ検証
  grammar_enabled BOOLEAN DEFAULT 1,
  grammar_max_words_per_sentence INTEGER,
  grammar_max_clauses INTEGER,
  
  -- 複数正解チェック
  uniqueness_enabled BOOLEAN DEFAULT 1,
  
  -- 重複チェック
  duplicate_enabled BOOLEAN DEFAULT 1,
  
  -- メタデータ
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- ユニーク制約: 同じgrade+formatの組み合わせは1つだけ
  UNIQUE(grade, format)
);

-- デフォルト設定を挿入
INSERT OR IGNORE INTO validation_thresholds (grade, format, vocabulary_threshold, copyright_threshold, grammar_enabled, uniqueness_enabled, duplicate_enabled, description)
VALUES 
  ('default', 'default', 85.0, 85.0, 1, 1, 1, 'システム全体のデフォルト設定'),
  
  -- 5級のデフォルト（より厳しく）
  ('5', 'default', 90.0, 90.0, 1, 1, 1, '5級全体のデフォルト設定'),
  ('5', 'grammar_fill', 95.0, 90.0, 0, 1, 1, '5級の文法穴埋め問題（文法検証はスキップ）'),
  ('5', 'long_reading', 85.0, 90.0, 1, 1, 1, '5級の長文読解（少し緩和）'),
  
  -- 4級のデフォルト
  ('4', 'default', 88.0, 88.0, 1, 1, 1, '4級全体のデフォルト設定'),
  ('4', 'grammar_fill', 90.0, 88.0, 0, 1, 1, '4級の文法穴埋め問題'),
  
  -- 3級のデフォルト
  ('3', 'default', 85.0, 85.0, 1, 1, 1, '3級全体のデフォルト設定'),
  
  -- 準2級以上（より緩和）
  ('pre-2', 'default', 80.0, 80.0, 1, 1, 1, '準2級全体のデフォルト設定'),
  ('2', 'default', 75.0, 75.0, 1, 1, 1, '2級全体のデフォルト設定'),
  ('pre-1', 'default', 70.0, 70.0, 1, 1, 1, '準1級全体のデフォルト設定'),
  ('1', 'default', 70.0, 70.0, 1, 1, 1, '1級全体のデフォルト設定');

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_validation_thresholds_grade_format 
  ON validation_thresholds(grade, format);

-- 変更履歴テーブル
CREATE TABLE IF NOT EXISTS validation_threshold_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  threshold_id INTEGER NOT NULL,
  
  -- 変更内容
  changed_by TEXT,               -- 変更者のユーザーID
  change_type TEXT,              -- 'create', 'update', 'delete'
  old_values TEXT,               -- JSON形式で保存
  new_values TEXT,               -- JSON形式で保存
  
  -- タイムスタンプ
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (threshold_id) REFERENCES validation_thresholds(id)
);

CREATE INDEX IF NOT EXISTS idx_threshold_history_threshold_id 
  ON validation_threshold_history(threshold_id);

CREATE INDEX IF NOT EXISTS idx_threshold_history_created_at 
  ON validation_threshold_history(created_at);
