-- ============================================================
-- Migration 0013: Create Users Table and Link to Learning History
-- ============================================================
-- Purpose: Create user management system for APP_KEY + Student ID
-- Author: System
-- Date: 2024-11-18
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
-- 2. Add user_id to existing tables for learning history linkage
-- ============================================================

-- Study Partner Sessions
ALTER TABLE study_partner_sessions ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON study_partner_sessions(user_id);

-- Essay Coaching Sessions
ALTER TABLE essay_coaching_sessions ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_essay_sessions_user ON essay_coaching_sessions(user_id);

-- Flashcard Cards
ALTER TABLE flashcard_cards ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_flashcard_cards_user ON flashcard_cards(user_id);

-- Flashcard Categories
ALTER TABLE flashcard_categories ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_flashcard_categories_user ON flashcard_categories(user_id);

-- Flashcard Tags
ALTER TABLE flashcard_tags ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_flashcard_tags_user ON flashcard_tags(user_id);

-- ============================================================
-- 3. Create admin_settings table (for admin password)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensure only one row
  password_hash TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. Insert default admin password (bcrypt hash of "admin123")
-- ============================================================
-- Note: This should be changed immediately after first login
-- Default password: admin123
-- Hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
INSERT OR IGNORE INTO admin_settings (id, password_hash) 
VALUES (1, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');

-- ============================================================
-- 5. Migration Complete
-- ============================================================
-- Next steps:
-- 1. Run this migration on D1 database
-- 2. Create admin UI at /admin/users
-- 3. Update login logic to use users table
-- 4. Link new sessions to user_id
-- ============================================================
