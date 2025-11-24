-- Migration: add_vocabulary_definitions.sql
-- Phase 1: Add essential columns for vocabulary annotation system
-- Safe for Cloudflare D1

-- Step 1: Add new columns
ALTER TABLE eiken_vocabulary_lexicon ADD COLUMN definition_ja TEXT;
ALTER TABLE eiken_vocabulary_lexicon ADD COLUMN definition_en TEXT;
ALTER TABLE eiken_vocabulary_lexicon ADD COLUMN cefr_level_numeric INTEGER;
ALTER TABLE eiken_vocabulary_lexicon ADD COLUMN final_difficulty_score INTEGER;
ALTER TABLE eiken_vocabulary_lexicon ADD COLUMN definition_source TEXT DEFAULT 'pending';
ALTER TABLE eiken_vocabulary_lexicon ADD COLUMN last_definition_update TEXT;

-- Step 2: Populate cefr_level_numeric from existing cefr_level
UPDATE eiken_vocabulary_lexicon 
SET cefr_level_numeric = CASE cefr_level
  WHEN 'A1' THEN 10
  WHEN 'A2' THEN 20
  WHEN 'B1' THEN 30
  WHEN 'B2' THEN 40
  WHEN 'C1' THEN 50
  WHEN 'C2' THEN 60
  ELSE 0
END;

-- Step 3: Calculate preliminary difficulty scores
-- Formula: (cefr_numeric) + (frequency penalty) + (length bonus)
UPDATE eiken_vocabulary_lexicon
SET final_difficulty_score = 
  COALESCE(cefr_level_numeric, 0) + 
  CASE 
    WHEN zipf_score IS NULL THEN 20
    WHEN zipf_score < 3.0 THEN 30
    WHEN zipf_score < 4.0 THEN 20
    WHEN zipf_score < 5.0 THEN 10
    ELSE 0
  END +
  CASE 
    WHEN LENGTH(word_lemma) > 12 THEN 15
    WHEN LENGTH(word_lemma) > 9 THEN 10
    WHEN LENGTH(word_lemma) > 6 THEN 5
    ELSE 0
  END;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_difficulty_score ON eiken_vocabulary_lexicon(final_difficulty_score);
CREATE INDEX IF NOT EXISTS idx_cefr_numeric ON eiken_vocabulary_lexicon(cefr_level_numeric);
CREATE INDEX IF NOT EXISTS idx_definition_source ON eiken_vocabulary_lexicon(definition_source);
