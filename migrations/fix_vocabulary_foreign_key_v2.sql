-- Migration: Fix vocabulary foreign key constraint (Version 2)
-- 
-- Problem: user_vocabulary_progress.word_id references vocabulary_master(id),
--          but we're using eiken_vocabulary_lexicon which doesn't have an explicit id column
-- 
-- Solution: Drop and recreate user_vocabulary_progress WITHOUT foreign key constraint
--           (Foreign keys can cause issues with ROWID references in Cloudflare D1)

-- Step 1: Drop existing table (safe because we only have test data)
DROP TABLE IF EXISTS user_vocabulary_progress;

-- Step 2: Create new table WITHOUT foreign key constraint
CREATE TABLE user_vocabulary_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  
  -- SM-2 Spaced Repetition Parameters
  easiness_factor REAL DEFAULT 2.5,          -- 1.3-2.5 (EF in SM-2)
  interval_days REAL DEFAULT 1.0,            -- Days until next review
  repetitions INTEGER DEFAULT 0,             -- Consecutive correct answers
  next_review_date DATE,                     -- Next scheduled review date
  
  -- Mastery Level (0-10 scale)
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
  -- NOTE: Foreign key removed to avoid ROWID reference issues
  --       word_id should correspond to eiken_vocabulary_lexicon.ROWID
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

-- Create index for faster lookups
CREATE INDEX idx_user_vocabulary_progress_user_id ON user_vocabulary_progress(user_id);
CREATE INDEX idx_user_vocabulary_progress_word_id ON user_vocabulary_progress(word_id);
CREATE INDEX idx_user_vocabulary_progress_next_review ON user_vocabulary_progress(next_review_date);
