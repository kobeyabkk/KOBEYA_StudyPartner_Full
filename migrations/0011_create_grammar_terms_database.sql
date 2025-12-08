-- ========================================
-- 学校文法用語データベース
-- 目的: 日本の学校で使われる文法用語と解説スタイル
-- ========================================

-- 文法用語マスター
CREATE TABLE IF NOT EXISTS grammar_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_code TEXT NOT NULL UNIQUE,      -- 例: 'infinitive_noun', 'passive_voice'
  term_name_ja TEXT NOT NULL,          -- 例: '不定詞（名詞的用法）', '受動態'
  grade_level TEXT NOT NULL,           -- 小学校 / 中1 / 中2 / 中3 / 高校
  eiken_grade TEXT,                    -- 対応英検級（5, 4, 3, pre2, 2, pre1, 1）
  
  -- 文法パターン
  pattern_en TEXT NOT NULL,            -- 例: 'to + 動詞', 'be + 過去分詞'
  pattern_ja TEXT NOT NULL,            -- 例: '〜すること', '〜される'
  
  -- 解説テンプレート
  explanation_template TEXT,           -- 解説の定型文
  
  -- 例文
  example_sentences TEXT,              -- JSON配列: [{"en": "...", "ja": "..."}]
  
  -- 関連用語
  related_terms TEXT,                  -- JSON配列: ["infinitive_adj", "gerund"]
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 文法パターン検出ルール
CREATE TABLE IF NOT EXISTS grammar_pattern_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_code TEXT NOT NULL,
  
  -- 検出条件（正規表現）
  detection_regex TEXT,                -- 英文パターン検出用
  keyword_markers TEXT,                -- JSON配列: キーワード（to, be, have など）
  
  -- 品詞パターン
  pos_pattern TEXT,                    -- 品詞配列: ["VB", "TO", "VB"] など
  
  -- 優先度（複数マッチ時の優先順位）
  priority INTEGER DEFAULT 50,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (term_code) REFERENCES grammar_terms(term_code)
);

-- 学年別表現パターン
CREATE TABLE IF NOT EXISTS grade_expressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expression_id TEXT NOT NULL UNIQUE,  -- 例: 'J0-001', 'J1-045'
  grade_level TEXT NOT NULL,
  eiken_grade TEXT,
  
  -- 表現パターン
  english_pattern TEXT NOT NULL,       -- 例: 'I am + 名詞 / 形容詞'
  meaning_ja TEXT NOT NULL,
  
  -- 例文
  example_en TEXT NOT NULL,
  example_jp TEXT NOT NULL,
  
  -- カテゴリー
  category TEXT,                       -- 基本文 / 助動詞 / 疑問文 など
  tags TEXT,                           -- JSON配列
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_grammar_terms_grade ON grammar_terms(grade_level);
CREATE INDEX IF NOT EXISTS idx_grammar_terms_eiken ON grammar_terms(eiken_grade);
CREATE INDEX IF NOT EXISTS idx_pattern_rules_term ON grammar_pattern_rules(term_code);
CREATE INDEX IF NOT EXISTS idx_expressions_grade ON grade_expressions(grade_level);
CREATE INDEX IF NOT EXISTS idx_expressions_eiken ON grade_expressions(eiken_grade);
