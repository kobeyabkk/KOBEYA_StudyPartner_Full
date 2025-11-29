-- ============================================================================
-- Phase 1: Eiken Vocabulary Level Management System
-- ============================================================================
-- Created: 2025-11-29
-- Purpose: Implement vocabulary level validation for Eiken question generation
--   - Multi-source vocabulary database (NGSL/NAWL primary + COCA frequency)
--   - CEFR level mapping to Eiken grades
--   - Zipf frequency scores for validation
--   - Lemma-based word family support
-- License: Based on NGSL/NAWL (CC-BY-SA 4.0) + COCA frequency data
-- ============================================================================

-- ============================================================================
-- Table: eiken_vocabulary_lexicon
-- ============================================================================
-- Core vocabulary database for Eiken level validation
-- ============================================================================

CREATE TABLE IF NOT EXISTS eiken_vocabulary_lexicon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Word Forms
  lemma TEXT NOT NULL UNIQUE,                 -- Base form (e.g., "run")
  word_family TEXT,                           -- Word family members (JSON array: ["run", "running", "ran", "runs"])
  
  -- CEFR & Eiken Level Mapping
  cefr_level TEXT NOT NULL,                   -- A1, A2, B1, B2, C1, C2
  cefr_numeric INTEGER NOT NULL,              -- 1-6 (A1=1, C2=6)
  eiken_grade TEXT,                           -- 5, 4, 3, pre-2, 2, pre-1, 1
  
  -- Frequency Information
  zipf_score REAL,                            -- Zipf frequency (1.0-7.0, higher = more common)
  frequency_rank INTEGER,                     -- Rank in corpus (lower number = higher frequency)
  frequency_per_million REAL,                 -- Occurrences per million words
  
  -- Data Source Tracking
  source_ngsl BOOLEAN DEFAULT FALSE,          -- Present in NGSL
  source_nawl BOOLEAN DEFAULT FALSE,          -- Present in NAWL
  source_coca BOOLEAN DEFAULT FALSE,          -- Present in COCA
  source_confidence INTEGER DEFAULT 0,        -- Confidence score (0-3, number of sources)
  
  -- Linguistic Information
  pos TEXT,                                   -- Part of speech (noun, verb, adj, adv, etc.)
  syllable_count INTEGER,                     -- Number of syllables
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CHECK (cefr_numeric >= 1 AND cefr_numeric <= 6),
  CHECK (zipf_score IS NULL OR (zipf_score >= 1.0 AND zipf_score <= 7.0)),
  CHECK (source_confidence >= 0 AND source_confidence <= 3)
);

-- Indexes for fast lookup and filtering
CREATE INDEX IF NOT EXISTS idx_eiken_lexicon_lemma ON eiken_vocabulary_lexicon(lemma);
CREATE INDEX IF NOT EXISTS idx_eiken_lexicon_cefr ON eiken_vocabulary_lexicon(cefr_level);
CREATE INDEX IF NOT EXISTS idx_eiken_lexicon_cefr_numeric ON eiken_vocabulary_lexicon(cefr_numeric);
CREATE INDEX IF NOT EXISTS idx_eiken_lexicon_eiken_grade ON eiken_vocabulary_lexicon(eiken_grade);
CREATE INDEX IF NOT EXISTS idx_eiken_lexicon_zipf ON eiken_vocabulary_lexicon(zipf_score);
CREATE INDEX IF NOT EXISTS idx_eiken_lexicon_confidence ON eiken_vocabulary_lexicon(source_confidence);

-- ============================================================================
-- CEFR to Eiken Grade Mapping Reference
-- ============================================================================
-- This mapping is used for validation during question generation:
--
-- | Eiken Grade | CEFR Level | Vocabulary Size | Zipf Threshold |
-- |-------------|------------|-----------------|----------------|
-- | 5           | A1         | 300-600         | >= 4.5         |
-- | 4           | A2         | 600-1,300       | >= 4.0         |
-- | 3           | A2-B1      | 1,300-2,100     | >= 3.7         |
-- | Pre-2       | B1         | 2,100-3,200     | >= 3.5         |
-- | 2           | B1-B2      | 3,200-5,000     | >= 3.3         |
-- | Pre-1       | B2         | 5,000-7,500     | >= 3.0         |
-- | 1           | C1         | 7,500-10,000+   | >= 2.5         |
--
-- Validation Rules:
-- 1. Out-of-Range Ratio: Words exceeding target CEFR level < 3%
-- 2. Zipf Violation Ratio: Words below Zipf threshold < 5%
-- ============================================================================

-- ============================================================================
-- Attribution & License Notice
-- ============================================================================
-- Data Sources:
-- 1. NGSL (New General Service List) v1.2 - CC-BY-SA 4.0
--    © Browne, C., Culligan, B., and Phillips, J.
--    https://www.newgeneralservicelist.org/
--
-- 2. NAWL (New Academic Word List) v1.2 - CC-BY-SA 4.0
--    © Browne, C., Culligan, B., and Phillips, J.
--    https://www.newgeneralservicelist.org/
--
-- 3. COCA (Corpus of Contemporary American English) Frequency Data
--    Public domain frequency information
--
-- Implementation:
-- © 2025 KOBEYA Study Partner
-- Licensed under CC-BY-SA 4.0 (inherits from NGSL/NAWL)
-- ============================================================================
