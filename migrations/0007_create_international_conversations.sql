-- International Student Conversation History
-- Cloudflare D1 SQLite

CREATE TABLE IF NOT EXISTS international_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  has_image INTEGER DEFAULT 0, -- 1 if message includes image
  image_data TEXT, -- Base64 image data (optional)
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (session_id) REFERENCES international_sessions(session_id)
);

CREATE TABLE IF NOT EXISTS international_sessions (
  session_id TEXT PRIMARY KEY,
  student_name TEXT,
  current_topic TEXT, -- Current learning topic
  last_question TEXT, -- Last question asked for context
  last_problem TEXT, -- Last practice problem generated
  status TEXT DEFAULT 'active', -- 'active', 'completed'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_international_conversations_session 
  ON international_conversations(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_international_sessions_status 
  ON international_sessions(status, updated_at);
