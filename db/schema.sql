-- ============================================================================
-- EIKEN Vocabulary Lexicon Schema
-- ============================================================================
-- Purpose: Store expanded vocabulary with all inflected forms for fast lookup
-- Database: Cloudflare D1 (SQLite)
-- Created: 2025-11-11
-- ============================================================================

-- Drop existing table if exists (for clean reinstall)
DROP TABLE IF EXISTS eiken_vocabulary_lexicon;
DROP INDEX IF EXISTS idx_word;
DROP INDEX IF EXISTS idx_base_form;
DROP INDEX IF EXISTS idx_cefr_level;
DROP INDEX IF EXISTS idx_pos;
DROP INDEX IF EXISTS idx_eiken_grade;

-- ============================================================================
-- Main Vocabulary Table
-- ============================================================================
CREATE TABLE eiken_vocabulary_lexicon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Word forms
  word TEXT NOT NULL,                    -- Inflected form (lowercase normalized)
  base_form TEXT NOT NULL,               -- Base/lemma form
  
  -- Part of speech
  pos TEXT NOT NULL,                     -- verb, noun, adjective, adverb, other
  
  -- Level classification
  cefr_level TEXT NOT NULL,              -- A1, A2, B1, B2, C1, C2
  eiken_grade TEXT NOT NULL,             -- 5, 4, 3, pre-2, 2, pre-1, 1
  
  -- Frequency/importance
  zipf_score REAL DEFAULT 0,             -- Log frequency score (0-7)
  
  -- Form metadata
  is_base_form INTEGER DEFAULT 0,        -- 1 if this is the base form, 0 if inflected
  expansion_type TEXT,                   -- 'regular' or 'irregular'
  
  -- Additional metadata
  sources TEXT,                          -- JSON array of sources
  confidence REAL DEFAULT 1.0,           -- Confidence score (0-1)
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Indexes for Fast Lookup
-- ============================================================================

-- Primary lookup: by word (most common query)
CREATE INDEX idx_word ON eiken_vocabulary_lexicon(word);

-- Reverse lookup: inflected form -> base form
CREATE INDEX idx_base_form ON eiken_vocabulary_lexicon(base_form);

-- Filter by CEFR level (for validation)
CREATE INDEX idx_cefr_level ON eiken_vocabulary_lexicon(cefr_level);

-- Filter by part of speech
CREATE INDEX idx_pos ON eiken_vocabulary_lexicon(pos);

-- Filter by Eiken grade
CREATE INDEX idx_eiken_grade ON eiken_vocabulary_lexicon(eiken_grade);

-- Compound index for common queries
CREATE INDEX idx_word_cefr ON eiken_vocabulary_lexicon(word, cefr_level);
CREATE INDEX idx_cefr_pos ON eiken_vocabulary_lexicon(cefr_level, pos);

-- ============================================================================
-- Validation Constraints
-- ============================================================================

-- Ensure no exact duplicates (all fields must be different)
-- Note: Same word can appear with different base_form or pos
-- CREATE UNIQUE INDEX idx_unique_entry 
--   ON eiken_vocabulary_lexicon(word, base_form, pos, cefr_level);

-- ============================================================================
-- Sample Queries (for reference)
-- ============================================================================

-- Check if a word is in A1 vocabulary:
-- SELECT 1 FROM eiken_vocabulary_lexicon WHERE word = 'going' AND cefr_level = 'A1' LIMIT 1;

-- Get base form of an inflected word:
-- SELECT base_form FROM eiken_vocabulary_lexicon WHERE word = 'went' LIMIT 1;

-- Count vocabulary by level:
-- SELECT cefr_level, COUNT(*) as count FROM eiken_vocabulary_lexicon GROUP BY cefr_level;

-- Get all irregular verbs at A1:
-- SELECT DISTINCT base_form FROM eiken_vocabulary_lexicon 
-- WHERE cefr_level = 'A1' AND pos = 'verb' AND expansion_type = 'irregular';

-- Find words at wrong level:
-- SELECT word, cefr_level FROM eiken_vocabulary_lexicon 
-- WHERE word IN ('delighted', 'promotion', 'confused');

-- ============================================================================
-- Performance Notes
-- ============================================================================
-- Expected table size for A1 only: ~2,500 rows
-- Expected table size for all levels (A1-B2): ~100,000 rows
-- Index overhead: ~20-30% of data size
-- Query performance: 
--   - Single word lookup: <1ms
--   - Batch lookup (100 words): <5ms
--   - Full table scan: <50ms (A1 only)
-- ============================================================================
