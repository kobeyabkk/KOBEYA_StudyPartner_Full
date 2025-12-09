-- Migration: 0018_add_grammar_rules.sql
-- Description: Add grammar rules (鉄則) for teacher-style explanations
-- Created: 2025-12-09
-- 
-- Purpose: Add specific grammar rules with Japanese explanations

-- Update existing grammar terms with rule_jp (鉄則) field
-- Note: We'll use explanation_template field to store the rule

-- H3-019: if節の鉄則
UPDATE grammar_terms 
SET explanation_template = '＜鉄則！＞ 時・条件の副詞節（if / when など）では、未来のことでも現在形を使います。'
WHERE term_code = 'H3-019' OR (term_name_ja LIKE '%if%' AND eiken_grade = '3');

-- Create a more comprehensive rule if it doesn't exist
INSERT OR IGNORE INTO grammar_terms (
  term_code, term_name_ja, grade_level, eiken_grade, 
  pattern_en, pattern_ja, explanation_template, 
  example_sentences, created_at, updated_at
)
VALUES (
  'H3-019',
  'if節では未来でも現在形',
  '中学3年',
  '3',
  'if + present tense (for future)',
  'if節 + 現在形',
  '＜鉄則！＞ 時・条件の副詞節（if / when など）では、未来のことでも現在形を使います。主語が3人称単数（he, she, it）なら、動詞にsをつけます。',
  '[{"en":"If it rains tomorrow, I will stay home.","ja":"もし明日雨が降ったら、私は家にいます。"}]',
  datetime('now'),
  datetime('now')
);

-- Add 3単現のs rule
INSERT OR IGNORE INTO grammar_terms (
  term_code, term_name_ja, grade_level, eiken_grade,
  pattern_en, pattern_ja, explanation_template,
  example_sentences, created_at, updated_at
)
VALUES (
  'JHS1-003-S',
  '3単現のs',
  '中学1年',
  '4',
  'he/she/it + verb + s/es',
  '3単現のs',
  '＜鉄則！＞ 主語が he / she / it のとき、動詞に s または es をつけます。これを「3単現のs」と言います。',
  '[{"en":"He plays tennis.","ja":"彼はテニスをします。"},{"en":"She goes to school.","ja":"彼女は学校に行きます。"}]',
  datetime('now'),
  datetime('now')
);

-- Add past tense rule
INSERT OR IGNORE INTO grammar_terms (
  term_code, term_name_ja, grade_level, eiken_grade,
  pattern_en, pattern_ja, explanation_template,
  example_sentences, created_at, updated_at
)
VALUES (
  'JHS1-006-PAST',
  '過去形の使い方',
  '中学1年',
  '4',
  'verb + ed (past tense)',
  '過去形',
  '＜鉄則！＞ 過去の出来事には過去形を使います。yesterday, last week, ago などが目印です。',
  '[{"en":"I played soccer yesterday.","ja":"私は昨日サッカーをしました。"}]',
  datetime('now'),
  datetime('now')
);

-- Add future will rule
INSERT OR IGNORE INTO grammar_terms (
  term_code, term_name_ja, grade_level, eiken_grade,
  pattern_en, pattern_ja, explanation_template,
  example_sentences, created_at, updated_at
)
VALUES (
  'JHS1-010-WILL',
  '未来形（will）',
  '中学1年',
  '4',
  'will + verb (base form)',
  'will + 動詞の原形',
  '＜鉄則！＞ 未来のことを表すには will を使います。will の後ろは必ず動詞の原形です。',
  '[{"en":"I will study English tomorrow.","ja":"私は明日英語を勉強します。"}]',
  datetime('now'),
  datetime('now')
);

-- Add present continuous rule
INSERT OR IGNORE INTO grammar_terms (
  term_code, term_name_ja, grade_level, eiken_grade,
  pattern_en, pattern_ja, explanation_template,
  example_sentences, created_at, updated_at
)
VALUES (
  'JHS1-004-CONT',
  '現在進行形',
  '中学1年',
  '4',
  'am/is/are + verb-ing',
  'be動詞 + 動詞のing形',
  '＜Point！＞ 現在進行形は「今〜しています」という意味です。be動詞 + 動詞のing形 で作ります。',
  '[{"en":"I am playing soccer now.","ja":"私は今サッカーをしています。"}]',
  datetime('now'),
  datetime('now')
);

SELECT 'Migration 0018: Successfully added grammar rules (鉄則)' as status;
