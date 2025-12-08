-- Phase 4A: Vocabulary Notebook System (v2 - Fixed)
-- 語彙ノートシステム - 間隔反復学習（SRS）
-- Created: 2025-12-08
-- Fixed: Use vocabulary_master instead of vocabulary_words

-- ========================================
-- Table 1: Extend vocabulary_master
-- 語彙マスタテーブル拡張 - SM-2用の追加フィールド
-- ========================================

-- Add SM-2 related fields to vocabulary_master if not exists
ALTER TABLE vocabulary_master ADD COLUMN japanese_learner_difficulty REAL DEFAULT 50.0;
ALTER TABLE vocabulary_master ADD COLUMN polysemy_count INTEGER DEFAULT 1;
ALTER TABLE vocabulary_master ADD COLUMN is_katakana_word BOOLEAN DEFAULT 0;
ALTER TABLE vocabulary_master ADD COLUMN is_false_cognate BOOLEAN DEFAULT 0;
ALTER TABLE vocabulary_master ADD COLUMN l1_interference_risk BOOLEAN DEFAULT 0;
ALTER TABLE vocabulary_master ADD COLUMN ipa_pronunciation TEXT;
ALTER TABLE vocabulary_master ADD COLUMN katakana_pronunciation TEXT;
ALTER TABLE vocabulary_master ADD COLUMN audio_url TEXT;

-- ========================================
-- Table 2: vocabulary_notebook_entries
-- 語彙ノートエントリテーブル - ユーザーが追加した語彙
-- ========================================
CREATE TABLE IF NOT EXISTS vocabulary_notebook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  
  -- SM-2パラメータ
  easiness_factor REAL DEFAULT 2.5,
  interval_days REAL DEFAULT 1.0,
  repetitions INTEGER DEFAULT 0,
  next_review_date DATE,
  
  -- 習熟度評価
  mastery_level INTEGER DEFAULT 0,
  recognition_score INTEGER DEFAULT 0,
  recall_score INTEGER DEFAULT 0,
  production_score INTEGER DEFAULT 0,
  
  -- 学習履歴
  first_encountered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_reviewed_at TIMESTAMP,
  total_reviews INTEGER DEFAULT 0,
  correct_reviews INTEGER DEFAULT 0,
  
  -- パフォーマンス測定
  avg_response_time_ms INTEGER,
  retention_30days REAL,
  retention_60days REAL,
  
  -- 学習文脈（エピソード記憶）
  source_context TEXT,
  source_passage_id TEXT,
  source_question_id TEXT,
  
  -- メタデータ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (word_id) REFERENCES vocabulary_master(id),
  UNIQUE(user_id, word_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_notebook_user_word ON vocabulary_notebook_entries(user_id, word_id);
CREATE INDEX IF NOT EXISTS idx_notebook_next_review ON vocabulary_notebook_entries(user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_notebook_mastery ON vocabulary_notebook_entries(user_id, mastery_level);
CREATE INDEX IF NOT EXISTS idx_notebook_updated ON vocabulary_notebook_entries(updated_at);

-- ========================================
-- Table 3: vocabulary_review_history
-- 語彙復習履歴テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS vocabulary_review_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  notebook_entry_id INTEGER NOT NULL,
  
  -- 復習タイプ
  review_type TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  
  -- 復習結果
  response_quality INTEGER NOT NULL,
  response_time_ms INTEGER,
  was_correct BOOLEAN NOT NULL,
  
  -- SM-2更新前の状態
  easiness_factor_before REAL,
  interval_days_before REAL,
  repetitions_before INTEGER,
  
  -- SM-2更新後の状態
  easiness_factor_after REAL,
  interval_days_after REAL,
  repetitions_after INTEGER,
  mastery_level_after INTEGER,
  
  -- メタデータ
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (word_id) REFERENCES vocabulary_master(id),
  FOREIGN KEY (notebook_entry_id) REFERENCES vocabulary_notebook_entries(id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_review_history_user ON vocabulary_review_history(user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_history_word ON vocabulary_review_history(word_id);
CREATE INDEX IF NOT EXISTS idx_review_history_entry ON vocabulary_review_history(notebook_entry_id);

-- ========================================
-- Table 4: vocabulary_learning_sessions
-- 語彙学習セッションテーブル
-- ========================================
CREATE TABLE IF NOT EXISTS vocabulary_learning_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  user_id TEXT NOT NULL,
  session_type TEXT NOT NULL,
  
  -- セッション情報
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- 学習統計
  words_reviewed INTEGER DEFAULT 0,
  words_correct INTEGER DEFAULT 0,
  words_incorrect INTEGER DEFAULT 0,
  new_words_learned INTEGER DEFAULT 0,
  
  -- パフォーマンス
  avg_response_time_ms INTEGER,
  total_score INTEGER DEFAULT 0,
  
  -- メタデータ
  source_activity TEXT,
  notes TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user ON vocabulary_learning_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_type ON vocabulary_learning_sessions(session_type);

-- ========================================
-- Useful Views
-- ========================================

-- 今日復習すべき単語のビュー
CREATE VIEW IF NOT EXISTS due_reviews_today AS
SELECT 
  vne.*,
  vm.word,
  vm.definition_ja,
  vm.cefr_level,
  vm.final_difficulty_score
FROM vocabulary_notebook_entries vne
JOIN vocabulary_master vm ON vne.word_id = vm.id
WHERE vne.next_review_date <= date('now')
  AND vne.mastery_level < 10
ORDER BY vne.next_review_date ASC, vne.mastery_level ASC;

-- ユーザーの語彙統計ビュー
CREATE VIEW IF NOT EXISTS user_vocabulary_stats AS
SELECT 
  user_id,
  COUNT(*) as total_words,
  SUM(CASE WHEN mastery_level >= 7 THEN 1 ELSE 0 END) as mastered_words,
  SUM(CASE WHEN mastery_level >= 5 AND mastery_level < 7 THEN 1 ELSE 0 END) as learning_words,
  SUM(CASE WHEN mastery_level < 5 THEN 1 ELSE 0 END) as new_words,
  AVG(mastery_level) as avg_mastery_level,
  SUM(total_reviews) as total_reviews,
  ROUND(AVG(CAST(correct_reviews AS REAL) / NULLIF(total_reviews, 0) * 100), 2) as avg_accuracy
FROM vocabulary_notebook_entries
GROUP BY user_id;

-- 習熟度別語彙数ビュー
CREATE VIEW IF NOT EXISTS mastery_distribution AS
SELECT 
  user_id,
  mastery_level,
  COUNT(*) as word_count,
  ROUND(AVG(retention_30days), 2) as avg_retention
FROM vocabulary_notebook_entries
GROUP BY user_id, mastery_level
ORDER BY user_id, mastery_level;
