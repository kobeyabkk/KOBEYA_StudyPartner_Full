-- Migration: Fix vocabulary foreign key constraint
-- 
-- Problem: user_vocabulary_progress.word_id references vocabulary_master(id),
--          but we're actually using eiken_vocabulary_lexicon table which has data.
-- 
-- Solution: Recreate user_vocabulary_progress table with corrected foreign key

-- Step 1: Rename old table
ALTER TABLE user_vocabulary_progress RENAME TO user_vocabulary_progress_old;

-- Step 2: Create new table with correct foreign key
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
  -- FIXED: Now references eiken_vocabulary_lexicon ROWID instead of vocabulary_master
  FOREIGN KEY (word_id) REFERENCES eiken_vocabulary_lexicon(ROWID) ON DELETE CASCADE,
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

-- Step 3: Copy data from old table (if any exists)
INSERT INTO user_vocabulary_progress
SELECT * FROM user_vocabulary_progress_old;

-- Step 4: Drop old table
DROP TABLE user_vocabulary_progress_old;
