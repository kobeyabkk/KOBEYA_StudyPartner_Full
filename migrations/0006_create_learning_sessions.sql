-- Study Partner Learning Sessions Table
-- Cloudflare D1 SQLite

CREATE TABLE IF NOT EXISTS learning_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  appkey TEXT NOT NULL,
  sid TEXT NOT NULL,
  problem_type TEXT,
  analysis TEXT,
  steps TEXT, -- JSON string
  confirmation_problem TEXT, -- JSON string
  similar_problems TEXT, -- JSON string
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'learning',
  original_image_data TEXT,
  original_user_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_learning_sessions_session_id ON learning_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_sid ON learning_sessions(sid, created_at);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_status ON learning_sessions(status);
