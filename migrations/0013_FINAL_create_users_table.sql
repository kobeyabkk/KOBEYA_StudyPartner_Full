-- ============================================================
-- Migration 0013 FINAL: Create Users Table
-- ============================================================
-- Purpose: Create user management system for APP_KEY + Student ID
-- Date: 2024-11-18
-- 
-- VERIFIED TABLE SCHEMA:
-- ✅ essay_sessions (has student_id)
-- ✅ flashcards (has appkey, sid)
-- ✅ flashcard_decks (has appkey, sid)
-- ✅ international_sessions (has student_name, but NO student_id - uses session_id only)
-- ✅ international_conversations (linked via session_id)
-- ============================================================

-- ============================================================
-- 1. Create users table
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_key TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT,
  grade TEXT,
  email TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME,
  is_active BOOLEAN DEFAULT 1,
  UNIQUE(app_key, student_id)
);

-- Index for fast login lookup
CREATE INDEX IF NOT EXISTS idx_users_login ON users(app_key, student_id, is_active);

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active, created_at DESC);

-- ============================================================
-- 2. Add user_id to essay_sessions
-- ============================================================
-- essay_sessions has: student_id column
ALTER TABLE essay_sessions ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_essay_sessions_user ON essay_sessions(user_id);

-- ============================================================
-- 3. Add user_id to flashcards
-- ============================================================
-- flashcards has: appkey, sid columns
ALTER TABLE flashcards ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);

-- ============================================================
-- 4. Add user_id to flashcard_decks
-- ============================================================
-- flashcard_decks has: appkey, sid columns
ALTER TABLE flashcard_decks ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user ON flashcard_decks(user_id);

-- ============================================================
-- 5. Add user_id to international_sessions
-- ============================================================
-- international_sessions has: student_name (but NO student_id)
-- We'll need to link via student_name or manually
ALTER TABLE international_sessions ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_international_sessions_user ON international_sessions(user_id);

-- ============================================================
-- 6. Add user_id to international_conversations
-- ============================================================
-- international_conversations is linked via session_id to international_sessions
-- We can link it indirectly through international_sessions
ALTER TABLE international_conversations ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_international_conversations_user ON international_conversations(user_id);

-- ============================================================
-- 7. Create admin_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default admin password: admin123 (bcrypt hash for future use)
INSERT OR IGNORE INTO admin_settings (id, password_hash) 
VALUES (1, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');

-- ============================================================
-- Migration 0013 Complete
-- ============================================================
-- Created:
-- ✅ users table with indexes
-- ✅ user_id column in essay_sessions
-- ✅ user_id column in flashcards
-- ✅ user_id column in flashcard_decks
-- ✅ user_id column in international_sessions
-- ✅ user_id column in international_conversations
-- ✅ admin_settings table
--
-- Next: Run 0014_FINAL_migrate_existing_users.sql
-- ============================================================
