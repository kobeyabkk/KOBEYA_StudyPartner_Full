-- Extract top 200 A1 vocabulary by frequency (zipf_score)
SELECT 
  word,
  base_form,
  pos,
  zipf_score,
  is_base_form,
  expansion_type
FROM eiken_vocabulary_lexicon
WHERE cefr_level = 'A1'
  AND is_base_form = 1  -- Base forms only for prompt
ORDER BY zipf_score DESC
LIMIT 200;
