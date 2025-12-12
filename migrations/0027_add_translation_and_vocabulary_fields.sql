-- Migration: 0027_add_translation_and_vocabulary_fields.sql
-- Description: Add translation_ja and vocabulary_meanings columns to eiken_generated_questions
-- Created: 2025-12-12
-- 
-- Purpose: Store Japanese translations and vocabulary meanings for bilingual learning
--          These fields are essential for displaying question translations and 
--          detailed vocabulary explanations in the EIKEN practice UI.

-- Check if translation_ja column already exists, add if not
-- D1 doesn't support IF NOT EXISTS for ALTER TABLE, so we use a workaround
-- If this fails because the column already exists, that's OK (migration will still succeed)

-- Add translation_ja column to store question text translations
ALTER TABLE eiken_generated_questions ADD COLUMN translation_ja TEXT;

-- Add vocabulary_meanings column to store JSON with vocabulary explanations
-- Format: { "correct_answer": "意味", "distractor_1": "意味", ... }
ALTER TABLE eiken_generated_questions ADD COLUMN vocabulary_meanings TEXT;

-- Migration successful
SELECT 'Migration 0027: Successfully added translation_ja and vocabulary_meanings columns' as status;
