-- ============================================================================
-- Phase 4A: Vocabulary Notes System - Database Schema
-- ============================================================================
-- Created: 2025-01-XX
-- Purpose: Implement comprehensive vocabulary learning system with:
--   - Multi-dimensional difficulty scoring (CEFR + Eiken + JP learner + Polysemy)
--   - SM-2 spaced repetition algorithm
--   - User progress tracking
--   - Review scheduling
-- ============================================================================

-- ============================================================================
-- Table 1: vocabulary_master
-- ============================================================================
-- Master vocabulary database with comprehensive difficulty scoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocabulary_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,
  
  -- Basic Information
  pos TEXT NOT NULL,                          -- Part of speech (noun, verb, adj, adv, etc.)
  definition_en TEXT NOT NULL,                -- English definition
  definition_ja TEXT NOT NULL,                -- Japanese translation
  
  -- Difficulty Scoring Components (30% + 30% + 25% + 15%)
  -- Component 1: CEFR Level (30%)
  cefr_level TEXT,                            -- A1, A2, B1, B2, C1, C2
  cefr_score INTEGER,                         -- 1-6 (A1=1, C2=6)
  
  -- Component 2: Frequency (converted to Eiken equivalent 30%)
  frequency_rank INTEGER,                     -- BNC/COCA rank (lower = more common)
  zipf_score REAL,                            -- 1.0-7.0 (higher = more common)
  
  -- Component 3: Eiken Specificity (30%)
  eiken_frequency INTEGER DEFAULT 0,          -- Appearance count in past Eiken exams
  eiken_grade TEXT,                           -- Primary grade: 5, 4, 3, pre-2, 2, pre-1, 1
  eiken_importance INTEGER DEFAULT 0,         -- Importance score 0-100
  
  -- Component 4: Japanese Learner Difficulty (25%)
  japanese_learner_difficulty REAL DEFAULT 50.0,  -- 0-100 (higher = harder)
  
  -- Component 5: Polysemy/Context Dependency (15%)
  polysemy_count INTEGER DEFAULT 1,           -- Number of distinct meanings
  context_dependency TEXT DEFAULT 'low',      -- low, medium, high
  
  -- Final Computed Score (weighted average)
  final_difficulty_score REAL,               -- 0-100 (computed from above)
  should_annotate BOOLEAN DEFAULT TRUE,      -- Should this word be annotated?
  
  -- Japanese Learner Specific Flags
  is_katakana_word BOOLEAN DEFAULT FALSE,    -- Is this a katakana loanword?
  is_false_cognate BOOLEAN DEFAULT FALSE,    -- False friend / 和製英語
  false_cognate_note TEXT,                   -- Explanation of false cognate
  l1_interference_risk BOOLEAN DEFAULT FALSE, -- Mother tongue interference risk
  l1_interference_note TEXT,                 -- Explanation of interference
  
  -- Pronunciation & Audio
  ipa_pronunciation TEXT,                    -- IPA phonetic notation
  katakana_pronunciation TEXT,               -- Katakana pronunciation (auxiliary)
  audio_url TEXT,                            -- Audio file URL (TTS or recorded)
  
  -- Examples & Collocations (JSON arrays)
  example_sentences TEXT,                    -- JSON: [{en: "...", ja: "..."}]
  collocations TEXT,                         -- JSON: ["make a decision", "take a risk"]
  
  -- Etymology & Related Words
  etymology TEXT,                            -- Word origin
  related_words TEXT,                        -- JSON: ["environment" -> ["environmental", "environmentalist"]]
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CHECK (cefr_score >= 1 AND cefr_score <= 6),
  CHECK (final_difficulty_score >= 0 AND final_difficulty_score <= 100),
  CHECK (japanese_learner_difficulty >= 0 AND japanese_learner_difficulty <= 100),
  CHECK (polysemy_count >= 1)
);

-- Indexes for vocabulary_master
CREATE INDEX IF NOT EXISTS idx_vocabulary_word ON vocabulary_master(word);
CREATE INDEX IF NOT EXISTS idx_vocabulary_difficulty ON vocabulary_master(final_difficulty_score);
CREATE INDEX IF NOT EXISTS idx_vocabulary_eiken_grade ON vocabulary_master(eiken_grade);
CREATE INDEX IF NOT EXISTS idx_vocabulary_cefr ON vocabulary_master(cefr_level);
CREATE INDEX IF NOT EXISTS idx_vocabulary_annotate ON vocabulary_master(should_annotate);
CREATE INDEX IF NOT EXISTS idx_vocabulary_katakana ON vocabulary_master(is_katakana_word);
CREATE INDEX IF NOT EXISTS idx_vocabulary_false_cognate ON vocabulary_master(is_false_cognate);

-- ============================================================================
-- Table 2: user_vocabulary_progress
-- ============================================================================
-- Tracks individual user's learning progress for each vocabulary word
-- Implements SM-2 spaced repetition algorithm
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_vocabulary_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  
  -- SM-2 Spaced Repetition Parameters
  easiness_factor REAL DEFAULT 2.5,          -- 1.3-2.5 (EF in SM-2)
  interval_days REAL DEFAULT 1.0,            -- Days until next review
  repetitions INTEGER DEFAULT 0,             -- Consecutive correct answers
  next_review_date DATE,                     -- Next scheduled review date
  
  -- Mastery Level (0-10 scale, replaces old 0-5 scale)
  mastery_level INTEGER DEFAULT 0,           -- 0=Unknown, 10=Native-like
  
  -- Multi-dimensional Performance Scores (0-100)
  recognition_score INTEGER DEFAULT 0,       -- Can recognize and understand
  recall_score INTEGER DEFAULT 0,            -- Can recall from memory
  production_score INTEGER DEFAULT 0,        -- Can use in sentences
  
  -- Learning History
  first_encountered_at DATETIME,             -- First time user saw this word
  last_reviewed_at DATETIME,                 -- Most recent review
  total_reviews INTEGER DEFAULT 0,           -- Total number of reviews
  correct_reviews INTEGER DEFAULT 0,         -- Number of correct reviews
  
  -- Performance Metrics
  avg_response_time_ms INTEGER,              -- Average response time in milliseconds
  fastest_response_time_ms INTEGER,          -- Fastest correct response
  slowest_response_time_ms INTEGER,          -- Slowest response
  
  -- Long-term Retention Tracking
  retention_7days REAL,                      -- Retention rate after 7 days (0-1)
  retention_30days REAL,                     -- Retention rate after 30 days (0-1)
  retention_60days REAL,                     -- Retention rate after 60 days (0-1)
  
  -- Learning Context (episodic memory)
  source_context TEXT,                       -- JSON: {passage_id, sentence, question_id}
  source_type TEXT,                          -- 'reading', 'listening', 'writing', etc.
  
  -- User Notes
  user_note TEXT,                            -- User's personal notes
  mnemonic TEXT,                             -- User's mnemonic device
  
  -- Status
  status TEXT DEFAULT 'learning',            -- learning, mastered, archived
  archived_at DATETIME,                      -- When word was archived
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (word_id) REFERENCES vocabulary_master(id) ON DELETE CASCADE,
  UNIQUE(user_id, word_id),
  CHECK (easiness_factor >= 1.3 AND easiness_factor <= 2.5),
  CHECK (interval_days >= 0),
  CHECK (repetitions >= 0),
  CHECK (mastery_level >= 0 AND mastery_level <= 10),
  CHECK (recognition_score >= 0 AND recognition_score <= 100),
  CHECK (recall_score >= 0 AND recall_score <= 100),
  CHECK (production_score >= 0 AND production_score <= 100),
  CHECK (status IN ('learning', 'mastered', 'archived'))
);

-- Indexes for user_vocabulary_progress
CREATE INDEX IF NOT EXISTS idx_user_vocab_user ON user_vocabulary_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vocab_word ON user_vocabulary_progress(word_id);
CREATE INDEX IF NOT EXISTS idx_user_vocab_user_word ON user_vocabulary_progress(user_id, word_id);
CREATE INDEX IF NOT EXISTS idx_user_vocab_next_review ON user_vocabulary_progress(user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_user_vocab_mastery ON user_vocabulary_progress(user_id, mastery_level);
CREATE INDEX IF NOT EXISTS idx_user_vocab_status ON user_vocabulary_progress(user_id, status);

-- ============================================================================
-- Table 3: review_schedule
-- ============================================================================
-- Daily review schedule for each user
-- Optimized for "Today's Review" queries
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  scheduled_date DATE NOT NULL,
  
  -- Review Type
  review_type TEXT NOT NULL,                 -- 'new', 'due', 'early'
  priority INTEGER DEFAULT 5,                -- 0-10 (higher = more important)
  
  -- Status
  status TEXT DEFAULT 'pending',             -- 'pending', 'completed', 'skipped'
  completed_at DATETIME,
  
  -- Review Results (filled after completion)
  response_quality INTEGER,                  -- 0-5 (again, hard, good, easy, perfect)
  response_time_ms INTEGER,                  -- Response time in milliseconds
  was_correct BOOLEAN,
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (word_id) REFERENCES vocabulary_master(id) ON DELETE CASCADE,
  CHECK (review_type IN ('new', 'due', 'early')),
  CHECK (priority >= 0 AND priority <= 10),
  CHECK (status IN ('pending', 'completed', 'skipped')),
  CHECK (response_quality IS NULL OR (response_quality >= 0 AND response_quality <= 5))
);

-- Indexes for review_schedule
CREATE INDEX IF NOT EXISTS idx_review_user_date ON review_schedule(user_id, scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_review_user_status ON review_schedule(user_id, status);
CREATE INDEX IF NOT EXISTS idx_review_type ON review_schedule(user_id, review_type);
CREATE INDEX IF NOT EXISTS idx_review_priority ON review_schedule(user_id, priority DESC);

-- ============================================================================
-- Table 4: vocabulary_annotations
-- ============================================================================
-- Pre-computed vocabulary annotations for passages (performance optimization)
-- Cached annotations to avoid real-time computation
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocabulary_annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  passage_id TEXT NOT NULL,                  -- Reference to passage/question
  word_id INTEGER NOT NULL,
  
  -- Context Information
  word_in_context TEXT NOT NULL,             -- The actual word as it appears
  sentence TEXT NOT NULL,                    -- The sentence containing the word
  sentence_index INTEGER,                    -- Sentence position in passage
  word_index INTEGER,                        -- Word position in sentence
  
  -- Annotation Decision
  contextual_meaning TEXT,                   -- Meaning in this specific context
  should_annotate BOOLEAN DEFAULT TRUE,      -- Should this occurrence be annotated?
  annotation_reason TEXT,                    -- Why annotate/not annotate?
  
  -- Pre-computed Display Data (for performance)
  display_data TEXT,                         -- JSON: pre-rendered annotation data
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (word_id) REFERENCES vocabulary_master(id) ON DELETE CASCADE
);

-- Indexes for vocabulary_annotations
CREATE INDEX IF NOT EXISTS idx_annotation_passage ON vocabulary_annotations(passage_id);
CREATE INDEX IF NOT EXISTS idx_annotation_word ON vocabulary_annotations(word_id);

-- ============================================================================
-- Table 5: vocabulary_learning_stats
-- ============================================================================
-- Aggregated learning statistics per user (for dashboards and analytics)
-- Updated periodically or on-demand
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocabulary_learning_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  
  -- Overall Progress
  total_words_encountered INTEGER DEFAULT 0,
  total_words_learning INTEGER DEFAULT 0,
  total_words_mastered INTEGER DEFAULT 0,
  
  -- Mastery Level Distribution
  level_0_count INTEGER DEFAULT 0,           -- Unknown
  level_1_3_count INTEGER DEFAULT 0,         -- Beginner
  level_4_6_count INTEGER DEFAULT 0,         -- Intermediate
  level_7_9_count INTEGER DEFAULT 0,         -- Advanced
  level_10_count INTEGER DEFAULT 0,          -- Native-like
  
  -- Review Statistics
  total_reviews_completed INTEGER DEFAULT 0,
  avg_reviews_per_word REAL,
  total_study_time_minutes INTEGER DEFAULT 0,
  
  -- Performance Metrics
  overall_accuracy REAL DEFAULT 0.0,         -- 0-1
  avg_response_time_ms INTEGER,
  
  -- Streaks & Consistency
  current_study_streak_days INTEGER DEFAULT 0,
  longest_study_streak_days INTEGER DEFAULT 0,
  last_study_date DATE,
  
  -- CEFR Level Progress
  cefr_a1_mastered INTEGER DEFAULT 0,
  cefr_a2_mastered INTEGER DEFAULT 0,
  cefr_b1_mastered INTEGER DEFAULT 0,
  cefr_b2_mastered INTEGER DEFAULT 0,
  cefr_c1_mastered INTEGER DEFAULT 0,
  cefr_c2_mastered INTEGER DEFAULT 0,
  
  -- Eiken Grade Progress
  eiken_5_mastered INTEGER DEFAULT 0,
  eiken_4_mastered INTEGER DEFAULT 0,
  eiken_3_mastered INTEGER DEFAULT 0,
  eiken_pre2_mastered INTEGER DEFAULT 0,
  eiken_2_mastered INTEGER DEFAULT 0,
  eiken_pre1_mastered INTEGER DEFAULT 0,
  eiken_1_mastered INTEGER DEFAULT 0,
  
  -- Metadata
  last_calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for vocabulary_learning_stats
CREATE INDEX IF NOT EXISTS idx_stats_user ON vocabulary_learning_stats(user_id);

-- ============================================================================
-- Triggers for automatic timestamp updates
-- ============================================================================

-- Trigger for vocabulary_master
CREATE TRIGGER IF NOT EXISTS update_vocabulary_master_timestamp
AFTER UPDATE ON vocabulary_master
FOR EACH ROW
BEGIN
  UPDATE vocabulary_master SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger for user_vocabulary_progress
CREATE TRIGGER IF NOT EXISTS update_user_vocab_progress_timestamp
AFTER UPDATE ON user_vocabulary_progress
FOR EACH ROW
BEGIN
  UPDATE user_vocabulary_progress SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger for vocabulary_learning_stats
CREATE TRIGGER IF NOT EXISTS update_vocab_stats_timestamp
AFTER UPDATE ON vocabulary_learning_stats
FOR EACH ROW
BEGIN
  UPDATE vocabulary_learning_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- Initial Data: Japanese Learner Pitfall Words (False Cognates)
-- ============================================================================

-- Insert common false cognates that Japanese learners struggle with
INSERT OR IGNORE INTO vocabulary_master (
  word, pos, definition_en, definition_ja,
  cefr_level, cefr_score,
  japanese_learner_difficulty,
  is_false_cognate, false_cognate_note,
  final_difficulty_score, should_annotate
) VALUES
  -- False Cognates
  ('mansion', 'noun', 'A large, impressive house', '大邸宅', 'B1', 3, 85.0, TRUE, 
   '日本語の「マンション」は apartment/condominium です。mansion は「大邸宅」の意味。', 75.0, TRUE),
  
  ('claim', 'verb', 'To state or assert that something is true', '主張する、要求する', 'B1', 3, 80.0, TRUE,
   '日本語の「クレーム」（苦情）は complaint です。claim は「主張する」の意味。', 70.0, TRUE),
  
  ('smart', 'adjective', 'Intelligent or well-dressed', '賢い、スマートな', 'A2', 2, 75.0, TRUE,
   '日本語の「スマート」（痩せている）は slim/slender です。smart は「賢い」が主な意味。', 65.0, TRUE),
  
  ('mansion', 'noun', 'A large, impressive house', '大邸宅', 'B1', 3, 85.0, TRUE,
   '日本語の「マンション」は apartment です。', 75.0, TRUE);

-- ============================================================================
-- Success Message
-- ============================================================================

SELECT 'Phase 4A Vocabulary System schema created successfully!' AS message;
