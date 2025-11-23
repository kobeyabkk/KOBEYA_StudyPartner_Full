-- ================================================================================
-- Populate eiken_vocabulary_lexicon from vocabulary_master (CEFR-J data)
-- Migration: 0020_populate_lexicon_from_vocabulary_master.sql
-- Created: 2025-11-23
-- Description: Import 6,870 words from vocabulary_master into eiken_vocabulary_lexicon
-- ================================================================================

-- Insert vocabulary data with POS mapping
INSERT OR REPLACE INTO eiken_vocabulary_lexicon (
  word_lemma,
  pos,
  cefr_level,
  zipf_score,
  grade_level,
  sources,
  confidence,
  frequency_rank,
  manual_verified,
  notes
)
SELECT 
  word as word_lemma,
  -- Map POS values from vocabulary_master to eiken_vocabulary_lexicon format
  CASE 
    WHEN pos = 'verb' THEN 'verb'
    WHEN pos = 'be-verb' THEN 'verb'
    WHEN pos = 'do-verb' THEN 'verb'
    WHEN pos = 'have-verb' THEN 'verb'
    WHEN pos = 'modal auxiliary' THEN 'verb'
    WHEN pos = 'noun' THEN 'noun'
    WHEN pos = 'adjective' THEN 'adj'
    WHEN pos = 'adverb' THEN 'adv'
    WHEN pos = 'preposition' THEN 'prep'
    WHEN pos = 'conjunction' THEN 'conj'
    WHEN pos = 'pronoun' THEN 'pron'
    WHEN pos = 'determiner' THEN 'det'
    WHEN pos = 'infinitive-to' THEN 'other'
    WHEN pos = 'interjection' THEN 'other'
    WHEN pos = 'number' THEN 'other'
    ELSE 'other'
  END as pos,
  cefr_level,
  zipf_score,
  -- Map eiken_grade to grade_level (integer)
  CASE eiken_grade
    WHEN 'grade_5' THEN 5
    WHEN 'grade_4' THEN 4
    WHEN 'grade_3' THEN 3
    WHEN 'pre_2' THEN 21
    WHEN 'grade_pre2' THEN 21
    WHEN 'grade_2' THEN 2
    WHEN 'pre_1' THEN 11
    WHEN 'grade_pre1' THEN 11
    WHEN 'grade_1' THEN 1
    ELSE NULL
  END as grade_level,
  '["CEFR-J v1.6"]' as sources,
  1.0 as confidence,
  frequency_rank,
  0 as manual_verified,
  CASE 
    WHEN definition_en != '' THEN 'Definition: ' || definition_en
    ELSE NULL
  END as notes
FROM vocabulary_master
WHERE cefr_level IS NOT NULL;
