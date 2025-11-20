-- ============================================================
-- Migration 0014 FINAL: Migrate Existing Users from Sessions
-- ============================================================
-- Purpose: Extract unique users from existing data and link records
-- Date: 2024-11-18
-- 
-- This migration extracts users from:
-- ✅ essay_sessions (student_id)
-- ✅ flashcards (appkey, sid)
-- ✅ flashcard_decks (appkey, sid)
-- ⚠️ international_sessions (student_name only, no student_id)
-- ============================================================

-- ============================================================
-- PART 1: Extract users from essay_sessions
-- ============================================================
-- essay_sessions table structure:
-- - student_id TEXT NOT NULL
-- - created_at TEXT
-- - updated_at TEXT

INSERT OR IGNORE INTO users (app_key, student_id, student_name, created_at, last_login_at, is_active)
SELECT DISTINCT 
  '180418' as app_key,
  student_id,
  student_id as student_name,
  MIN(created_at) as created_at,
  MAX(updated_at) as last_login_at,
  1 as is_active
FROM essay_sessions
WHERE student_id IS NOT NULL
  AND student_id != ''
GROUP BY student_id;

-- Link essay_sessions to users
UPDATE essay_sessions
SET user_id = (
  SELECT id FROM users 
  WHERE users.app_key = '180418'
    AND users.student_id = essay_sessions.student_id
  LIMIT 1
)
WHERE student_id IS NOT NULL AND student_id != '';

-- ============================================================
-- PART 2: Extract users from flashcards
-- ============================================================
-- flashcards table structure:
-- - appkey TEXT NOT NULL
-- - sid TEXT NOT NULL
-- - created_at TEXT
-- - updated_at TEXT

INSERT OR IGNORE INTO users (app_key, student_id, student_name, created_at, last_login_at, is_active)
SELECT DISTINCT 
  appkey as app_key,
  sid as student_id,
  sid as student_name,
  MIN(created_at) as created_at,
  MAX(updated_at) as last_login_at,
  1 as is_active
FROM flashcards
WHERE appkey IS NOT NULL
  AND sid IS NOT NULL
  AND appkey != ''
  AND sid != ''
GROUP BY appkey, sid;

-- Link flashcards to users
UPDATE flashcards
SET user_id = (
  SELECT id FROM users 
  WHERE users.app_key = flashcards.appkey 
    AND users.student_id = flashcards.sid
  LIMIT 1
)
WHERE appkey IS NOT NULL AND sid IS NOT NULL;

-- ============================================================
-- PART 3: Extract users from flashcard_decks
-- ============================================================
-- flashcard_decks table structure:
-- - appkey TEXT NOT NULL
-- - sid TEXT NOT NULL
-- - created_at TEXT
-- - updated_at TEXT

INSERT OR IGNORE INTO users (app_key, student_id, student_name, created_at, last_login_at, is_active)
SELECT DISTINCT 
  appkey as app_key,
  sid as student_id,
  sid as student_name,
  MIN(created_at) as created_at,
  MAX(updated_at) as last_login_at,
  1 as is_active
FROM flashcard_decks
WHERE appkey IS NOT NULL
  AND sid IS NOT NULL
  AND appkey != ''
  AND sid != ''
GROUP BY appkey, sid;

-- Link flashcard_decks to users
UPDATE flashcard_decks
SET user_id = (
  SELECT id FROM users 
  WHERE users.app_key = flashcard_decks.appkey 
    AND users.student_id = flashcard_decks.sid
  LIMIT 1
)
WHERE appkey IS NOT NULL AND sid IS NOT NULL;

-- ============================================================
-- PART 4: Handle international_sessions (SPECIAL CASE)
-- ============================================================
-- international_sessions table structure:
-- - session_id TEXT PRIMARY KEY
-- - student_name TEXT
-- - created_at TEXT
-- - updated_at TEXT
-- 
-- NOTE: This table does NOT have student_id or appkey!
-- We cannot automatically link it to users.
-- Options:
--   1. Manually link later via admin UI
--   2. Try to match by student_name (risky)
--   3. Skip for now
--
-- For now, we'll skip automatic linking.
-- Admin can manually assign user_id later if needed.

-- ============================================================
-- PART 5: Link international_conversations via session
-- ============================================================
-- international_conversations is linked through international_sessions
-- We can link conversations to the same user as their session

UPDATE international_conversations
SET user_id = (
  SELECT user_id FROM international_sessions 
  WHERE international_sessions.session_id = international_conversations.session_id
  LIMIT 1
)
WHERE session_id IN (
  SELECT session_id FROM international_sessions WHERE user_id IS NOT NULL
);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these one by one in Cloudflare D1 Console to verify:

-- 1. Count total users created
SELECT COUNT(*) as total_users FROM users;

-- 2. Show sample users
SELECT * FROM users LIMIT 10;

-- 3. Count linked records by table
SELECT 
  'essay_sessions' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as linked_records,
  COUNT(*) - COUNT(user_id) as unlinked_records
FROM essay_sessions
UNION ALL
SELECT 
  'flashcards' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as linked_records,
  COUNT(*) - COUNT(user_id) as unlinked_records
FROM flashcards
UNION ALL
SELECT 
  'flashcard_decks' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as linked_records,
  COUNT(*) - COUNT(user_id) as unlinked_records
FROM flashcard_decks
UNION ALL
SELECT 
  'international_sessions' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as linked_records,
  COUNT(*) - COUNT(user_id) as unlinked_records
FROM international_sessions
UNION ALL
SELECT 
  'international_conversations' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as linked_records,
  COUNT(*) - COUNT(user_id) as unlinked_records
FROM international_conversations;

-- 4. Check for duplicate users (should return 0)
SELECT app_key, student_id, COUNT(*) as count
FROM users
GROUP BY app_key, student_id
HAVING COUNT(*) > 1;

-- 5. Show users with their linked record counts
SELECT 
  u.id,
  u.student_id,
  u.student_name,
  u.app_key,
  (SELECT COUNT(*) FROM essay_sessions WHERE user_id = u.id) as essays,
  (SELECT COUNT(*) FROM flashcards WHERE user_id = u.id) as flashcards,
  (SELECT COUNT(*) FROM flashcard_decks WHERE user_id = u.id) as decks,
  (SELECT COUNT(*) FROM international_sessions WHERE user_id = u.id) as intl_sessions,
  (SELECT COUNT(*) FROM international_conversations WHERE user_id = u.id) as intl_convs
FROM users u
LIMIT 20;

-- ============================================================
-- Migration 0014 Complete
-- ============================================================
-- Successfully:
-- ✅ Extracted users from essay_sessions
-- ✅ Linked essay_sessions records to users
-- ✅ Extracted users from flashcards
-- ✅ Linked flashcards records to users
-- ✅ Extracted users from flashcard_decks
-- ✅ Linked flashcard_decks records to users
-- ✅ Linked international_conversations through sessions
-- 
-- Notes:
-- ⚠️ international_sessions cannot be automatically linked
--    (no student_id field, only student_name)
--    → Manually link via admin UI if needed
-- 
-- Next Steps:
-- 1. Run verification queries above
-- 2. Deploy application with admin UI
-- 3. Test admin login at /admin/login (password: admin123)
-- 4. Add/manage students via admin dashboard
-- ============================================================
