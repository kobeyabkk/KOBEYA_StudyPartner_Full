-- Unified AI Chat System
-- All AI chat features (Eiken, International, Essay, Flashcard, etc.) use this table
-- Cloudflare D1 SQLite

CREATE TABLE IF NOT EXISTS ai_chat_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  has_image INTEGER DEFAULT 0, -- 1 if message includes image
  image_data TEXT, -- Base64 image data (optional) - for display purposes only
  context_type TEXT DEFAULT 'general', -- 'eiken', 'international', 'essay', 'flashcard', 'general'
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  session_id TEXT PRIMARY KEY,
  context_type TEXT NOT NULL, -- 'eiken', 'international', 'essay', 'flashcard', 'general'
  student_name TEXT,
  current_topic TEXT, -- Current learning topic (optional)
  metadata TEXT, -- JSON metadata for context-specific data
  status TEXT DEFAULT 'active', -- 'active', 'completed'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_chat_conversations_session 
  ON ai_chat_conversations(session_id, timestamp);
  
CREATE INDEX IF NOT EXISTS idx_ai_chat_conversations_context 
  ON ai_chat_conversations(context_type, timestamp);
  
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_context 
  ON ai_chat_sessions(context_type, status, updated_at);
  
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_student 
  ON ai_chat_sessions(student_name, created_at);

-- Note: This table replaces international_conversations for new implementations
-- Old international_conversations table is kept for backward compatibility
