-- ============================================================
-- Migration 0021: Ensure Test User Exists and is Active
-- ============================================================
-- Purpose: Create/activate test user for development and demo
-- Date: 2024-11-25
-- ============================================================

-- Insert or update test user
INSERT INTO users (app_key, student_id, student_name, grade, is_active, created_at, last_login_at)
VALUES ('180418', 'JS2-04', 'テストユーザー', '中学2年', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(app_key, student_id) DO UPDATE SET
  is_active = 1,
  student_name = '続きユーザー',
  grade = '中学2年',
  last_login_at = CURRENT_TIMESTAMP;

-- Verify the user was created/updated
SELECT * FROM users WHERE app_key = '180418' AND student_id = 'JS2-04';

-- ============================================================
-- Migration 0021 Complete
-- ============================================================
