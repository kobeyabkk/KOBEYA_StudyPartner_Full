-- Migration: 0016_add_translation_fields.sql
-- Description: Add translation_ja and vocabulary_meanings columns
-- Created: 2025-12-09
-- 
-- Purpose: Store Japanese translations and vocabulary meanings for bilingual learning

-- Add translation_ja column to store question text translations
ALTER TABLE eiken_generated_questions ADD COLUMN translation_ja TEXT;

-- Add vocabulary_meanings column to store idioms and phrase explanations
ALTER TABLE eiken_generated_questions ADD COLUMN vocabulary_meanings TEXT;

-- Migration successful
SELECT 'Migration 0016: Successfully added translation_ja and vocabulary_meanings columns' as status;
