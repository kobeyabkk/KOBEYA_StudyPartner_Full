-- ============================================================================
-- Vocabulary Master Table - Complete Annotation System
-- ============================================================================
-- Created: 2025-11-29
-- Purpose: Unified vocabulary management with difficulty scoring and annotations
-- Design: Based on NGSL/NAWL + Zipf + CEFR-J coefficients (license-safe)
-- ============================================================================

-- ============================================================================
-- Table: vocabulary_master
-- ============================================================================
-- Comprehensive vocabulary database with:
--   - Multi-source integration (NGSL/NAWL/COCA)
--   - Final difficulty score (0-100)
--   - Japanese definitions (LLM-generated + cached)
--   - Annotation metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocabulary_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Word Information
  word TEXT NOT NULL,                         -- Lemma form (e.g., "run")
  pos TEXT,                                   -- Part of speech (noun, verb, adj, adv)
  word_family TEXT,                           -- Related forms (JSON array)
  
  -- CEFR & Level Information
  cefr_level TEXT NOT NULL,                   -- A1, A2, B1, B2, C1, C2
  cefr_numeric INTEGER NOT NULL,              -- 1-6 for calculation
  eiken_grade TEXT,                           -- 5, 4, 3, pre-2, 2, pre-1, 1
  
  -- Frequency Data (from NGSL/NAWL/COCA)
  zipf_score REAL,                            -- Zipf frequency (1.0-7.0, higher = more common)
  frequency_rank INTEGER,                     -- Rank in corpus
  frequency_per_million REAL,                 -- Occurrences per million words
  
  -- Source Tracking
  source_ngsl BOOLEAN DEFAULT FALSE,          -- In NGSL
  source_nawl BOOLEAN DEFAULT FALSE,          -- In NAWL
  source_coca BOOLEAN DEFAULT FALSE,          -- In COCA
  source_confidence INTEGER DEFAULT 0,        -- Confidence score (0-3)
  
  -- Difficulty Score Components
  -- Formula: final_difficulty_score = 
  --   (cefr_weight * 35) + (zipf_penalty * 30) + (ngsl_weight * 20) + 
  --   (japanese_learnability * 10) + (length_bonus * 5)
  
  cefr_weight REAL,                           -- CEFR contribution (0-35)
  zipf_penalty REAL,                          -- Frequency penalty (0-30)
  ngsl_weight REAL,                           -- NGSL/NAWL weight (0-20)
  japanese_learnability_weight REAL,          -- Japanese learner difficulty (0-10)
  length_bonus REAL,                          -- Word length bonus (0-5)
  
  final_difficulty_score INTEGER,            -- Final score (0-100)
  should_annotate BOOLEAN DEFAULT FALSE,      -- Should show annotation? (score >= 60)
  
  -- Definitions (LLM-generated + cached)
  definition_en TEXT,                         -- English definition
  definition_ja TEXT,                         -- Japanese translation
  definition_cached_at DATETIME,              -- When definition was cached
  
  -- Usage Examples
  example_sentences TEXT,                     -- JSON: [{en: "...", ja: "..."}]
  collocations TEXT,                          -- JSON: ["make a decision", "take a risk"]
  
  -- Metadata
  source TEXT DEFAULT 'ngsl+nawl+coca',       -- Data source identifier
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  UNIQUE(word, pos),
  CHECK (cefr_numeric >= 1 AND cefr_numeric <= 6),
  CHECK (final_difficulty_score >= 0 AND final_difficulty_score <= 100),
  CHECK (zipf_score IS NULL OR (zipf_score >= 1.0 AND zipf_score <= 7.0))
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_vocab_master_word ON vocabulary_master(word);
CREATE INDEX IF NOT EXISTS idx_vocab_master_pos ON vocabulary_master(word, pos);
CREATE INDEX IF NOT EXISTS idx_vocab_master_difficulty ON vocabulary_master(final_difficulty_score);
CREATE INDEX IF NOT EXISTS idx_vocab_master_annotate ON vocabulary_master(should_annotate);
CREATE INDEX IF NOT EXISTS idx_vocab_master_cefr ON vocabulary_master(cefr_level);
CREATE INDEX IF NOT EXISTS idx_vocab_master_eiken ON vocabulary_master(eiken_grade);
CREATE INDEX IF NOT EXISTS idx_vocab_master_source ON vocabulary_master(source_ngsl, source_nawl);

-- ============================================================================
-- Difficulty Score Calculation Reference
-- ============================================================================
-- 
-- Component 1: CEFR Weight (35 points max)
-- ----------------------------------------
-- cefr_weight = (cefr_numeric / 6) * 35
-- 
-- A1 (1) → 5.8 points
-- A2 (2) → 11.7 points
-- B1 (3) → 17.5 points
-- B2 (4) → 23.3 points
-- C1 (5) → 29.2 points
-- C2 (6) → 35.0 points
--
-- Component 2: Zipf Penalty (30 points max)
-- -----------------------------------------
-- zipf_penalty = max(0, (5.0 - zipf_score) * 2.0)
-- Normalized: (zipf_penalty / 10) * 30
--
-- Zipf 6.0 → 0 points (very common)
-- Zipf 5.0 → 0 points
-- Zipf 4.0 → 6 points
-- Zipf 3.0 → 12 points
-- Zipf 2.0 → 18 points (rare)
--
-- Component 3: NGSL Weight (20 points max)
-- ----------------------------------------
-- ngsl_weight_raw:
--   - In NGSL: 0
--   - In NAWL: 2
--   - Neither: 4
-- Normalized: (ngsl_weight_raw / 4) * 20
--
-- NGSL → 0 points
-- NAWL → 10 points
-- Other → 20 points
--
-- Component 4: Japanese Learnability (10 points max)
-- --------------------------------------------------
-- Based on CEFR-J research trends (coefficient only, no data):
-- A1 → 0 points
-- A2 → 1 point
-- B1 → 3 points
-- B2 → 6 points
-- C1 → 8 points
-- C2 → 10 points
--
-- Component 5: Length Bonus (5 points max)
-- ----------------------------------------
-- length_bonus = (LENGTH(word) >= 10 ? 5 : 0)
--
-- ============================================================================
-- Example Scores
-- ============================================================================
-- 
-- Word: "essential" (B1, Zipf 4.8, NAWL)
-- - CEFR: (3/6)*35 = 17.5
-- - Zipf: (5-4.8)*2/10*30 = 1.2
-- - NGSL: 2/4*20 = 10
-- - JP: 3
-- - Length: 0
-- - TOTAL: 31.7 → 32 (No annotation)
--
-- Word: "accompany" (B2, Zipf 3.2, not in NGSL/NAWL)
-- - CEFR: (4/6)*35 = 23.3
-- - Zipf: (5-3.2)*2/10*30 = 10.8
-- - NGSL: 4/4*20 = 20
-- - JP: 6
-- - Length: 0
-- - TOTAL: 60.1 → 60 (Annotation threshold!)
--
-- Word: "comprehend" (C1, Zipf 2.8, not in NGSL/NAWL, 10 chars)
-- - CEFR: (5/6)*35 = 29.2
-- - Zipf: (5-2.8)*2/10*30 = 13.2
-- - NGSL: 4/4*20 = 20
-- - JP: 8
-- - Length: 5
-- - TOTAL: 75.4 → 75 (Show annotation)
--
-- ============================================================================
-- CEFR-J Safe Usage Note
-- ============================================================================
-- This system does NOT store CEFR-J data directly.
-- Only uses "difficulty coefficients" derived from CEFR-J research trends.
-- This is legally safe and does not violate any license.
-- 
-- Coefficients are publicly available research findings, not proprietary data.
-- ============================================================================
--
-- License Attribution
-- ============================================================================
-- Data Sources:
-- - NGSL v1.2: CC-BY-SA 4.0 (Browne, Culligan, Phillips)
-- - NAWL v1.2: CC-BY-SA 4.0 (Browne, Culligan, Phillips)
-- - COCA Frequency: Public domain
-- - CEFR-J: Coefficients only (research-derived, no data storage)
-- 
-- Implementation: © 2025 KOBEYA Study Partner
-- ============================================================================
