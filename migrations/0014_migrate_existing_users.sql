-- ============================================================
-- Migration 0014: Migrate Existing Users from Sessions
-- ============================================================
-- Purpose: Extract unique app_key + student_id combinations from
--          existing sessions and create user records
-- Author: System
-- Date: 2024-11-18
-- ============================================================

-- ============================================================
-- 1. Extract and insert unique users from study_partner_sessions
-- ============================================================
INSERT OR IGNORE INTO users (app_key, student_id, student_name, created_at, last_login_at, is_active)
SELECT DISTINCT 
  appkey as app_key,
  sid as student_id,
  sid as student_name, -- Use student_id as temporary name
  MIN(created_at) as created_at,
  MAX(updated_at) as last_login_at,
  1 as is_active
FROM study_partner_sessions
WHERE appkey IS NOT NULL AND sid IS NOT NULL
GROUP BY appkey, sid;

-- ============================================================
-- 2. Update study_partner_sessions with user_id
-- ============================================================
UPDATE study_partner_sessions
SET user_id = (
  SELECT id FROM users 
  WHERE users.app_key = study_partner_sessions.appkey 
    AND users.student_id = study_partner_sessions.sid
)
WHERE appkey IS NOT NULL AND sid IS NOT NULL;

-- ============================================================
-- 3. Extract and insert unique users from essay_coaching_sessions
-- ============================================================
INSERT OR IGNORE INTO users (app_key, student_id, student_name, created_at, last_login_at, is_active)
SELECT DISTINCT 
  '180418' as app_key, -- Default APP_KEY
  student_id,
  student_id as student_name, -- Use student_id as temporary name
  MIN(created_at) as created_at,
  MAX(updated_at) as last_login_at,
  1 as is_active
FROM essay_coaching_sessions
WHERE student_id IS NOT NULL
  AND student_id != ''
GROUP BY student_id;

-- ============================================================
-- 4. Update essay_coaching_sessions with user_id
-- ============================================================
UPDATE essay_coaching_sessions
SET user_id = (
  SELECT id FROM users 
  WHERE users.app_key = '180418'
    AND users.student_id = essay_coaching_sessions.student_id
)
WHERE student_id IS NOT NULL AND student_id != '';

-- ============================================================
-- 5. Update flashcard tables with user_id
-- ============================================================
-- Note: Flashcards currently use user_identifier which is "appkey:sid" format
-- We'll try to parse and match existing users

-- For flashcard_cards
UPDATE flashcard_cards
SET user_id = (
  SELECT id FROM users 
  WHERE users.app_key || ':' || users.student_id = flashcard_cards.user_identifier
  LIMIT 1
)
WHERE user_identifier IS NOT NULL;

-- For flashcard_categories
UPDATE flashcard_categories
SET user_id = (
  SELECT id FROM users 
  WHERE users.app_key || ':' || users.student_id = flashcard_categories.user_identifier
  LIMIT 1
)
WHERE user_identifier IS NOT NULL;

-- For flashcard_tags
UPDATE flashcard_tags
SET user_id = (
  SELECT id FROM users 
  WHERE users.app_key || ':' || users.student_id = flashcard_tags.user_identifier
  LIMIT 1
)
WHERE user_identifier IS NOT NULL;

-- ============================================================
-- 6. Verification queries (comment out for actual migration)
-- ============================================================
-- SELECT COUNT(*) as total_users FROM users;
-- SELECT COUNT(*) as sessions_with_user FROM study_partner_sessions WHERE user_id IS NOT NULL;
-- SELECT COUNT(*) as essays_with_user FROM essay_coaching_sessions WHERE user_id IS NOT NULL;
-- SELECT COUNT(*) as cards_with_user FROM flashcard_cards WHERE user_id IS NOT NULL;

-- ============================================================
-- Migration Complete
-- ============================================================
