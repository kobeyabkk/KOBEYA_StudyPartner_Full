-- Phase 4A: Vocabulary Notebook System
-- 語彙ノートシステム - 間隔反復学習（SRS）
-- Created: 2025-12-02

-- ========================================
-- Table 1: vocabulary_master (拡張版)
-- 語彙マスタテーブル - 既存vocabulary_wordsの拡張
-- ========================================

-- 既存テーブルに新しいカラムを追加
ALTER TABLE vocabulary_words ADD COLUMN cefr_score INTEGER DEFAULT 3;
ALTER TABLE vocabulary_words ADD COLUMN frequency_rank INTEGER;
ALTER TABLE vocabulary_words ADD COLUMN zipf_score REAL;
ALTER TABLE vocabulary_words ADD COLUMN eiken_frequency INTEGER DEFAULT 0;
ALTER TABLE vocabulary_words ADD COLUMN eiken_grade TEXT;
ALTER TABLE vocabulary_words ADD COLUMN japanese_learner_difficulty REAL DEFAULT 50.0;
ALTER TABLE vocabulary_words ADD COLUMN polysemy_count INTEGER DEFAULT 1;
ALTER TABLE vocabulary_words ADD COLUMN final_difficulty_score REAL DEFAULT 50.0;
ALTER TABLE vocabulary_words ADD COLUMN is_katakana_word BOOLEAN DEFAULT 0;
ALTER TABLE vocabulary_words ADD COLUMN is_false_cognate BOOLEAN DEFAULT 0;
ALTER TABLE vocabulary_words ADD COLUMN l1_interference_risk BOOLEAN DEFAULT 0;
ALTER TABLE vocabulary_words ADD COLUMN ipa_pronunciation TEXT;
ALTER TABLE vocabulary_words ADD COLUMN katakana_pronunciation TEXT;
ALTER TABLE vocabulary_words ADD COLUMN audio_url TEXT;
ALTER TABLE vocabulary_words ADD COLUMN example_sentences TEXT;
ALTER TABLE vocabulary_words ADD COLUMN collocations TEXT;

-- 新しいインデックス
CREATE INDEX IF NOT EXISTS idx_vocab_difficulty ON vocabulary_words(final_difficulty_score);
CREATE INDEX IF NOT EXISTS idx_vocab_eiken_grade ON vocabulary_words(eiken_grade);
CREATE INDEX IF NOT EXISTS idx_vocab_cefr_score ON vocabulary_words(cefr_score);

-- ========================================
-- Table 2: user_vocabulary_progress
-- ユーザー語彙進捗テーブル - SM-2アルゴリズム用
-- ========================================
CREATE TABLE IF NOT EXISTS user_vocabulary_progress (
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
  first_encountered_at TIMESTAMP,
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
  
  -- メタデータ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (word_id) REFERENCES vocabulary_words(id),
  UNIQUE(user_id, word_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_vocab_user_word ON user_vocabulary_progress(user_id, word_id);
CREATE INDEX IF NOT EXISTS idx_user_vocab_next_review ON user_vocabulary_progress(user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_user_vocab_mastery ON user_vocabulary_progress(user_id, mastery_level);
CREATE INDEX IF NOT EXISTS idx_user_vocab_updated ON user_vocabulary_progress(updated_at);

-- ========================================
-- Table 3: review_schedule
-- 復習スケジュールテーブル
-- ========================================
CREATE TABLE IF NOT EXISTS review_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  scheduled_date DATE NOT NULL,
  
  -- 復習タイプ
  review_type TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  
  -- ステータス
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMP,
  
  -- 復習結果
  response_quality INTEGER,
  response_time_ms INTEGER,
  was_correct BOOLEAN,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (word_id) REFERENCES vocabulary_words(id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_review_user_scheduled ON review_schedule(user_id, scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_review_type ON review_schedule(user_id, review_type);
CREATE INDEX IF NOT EXISTS idx_review_word ON review_schedule(word_id);

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
-- 初期データ準備用ビュー
-- ========================================

-- 今日復習すべき単語のビュー
CREATE VIEW IF NOT EXISTS due_reviews_today AS
SELECT 
  uvp.*,
  vw.word,
  vw.definition_ja,
  vw.cefr_level,
  vw.final_difficulty_score
FROM user_vocabulary_progress uvp
JOIN vocabulary_words vw ON uvp.word_id = vw.id
WHERE uvp.next_review_date <= date('now')
  AND uvp.mastery_level < 10
ORDER BY uvp.next_review_date ASC, uvp.mastery_level ASC;

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
FROM user_vocabulary_progress
GROUP BY user_id;
