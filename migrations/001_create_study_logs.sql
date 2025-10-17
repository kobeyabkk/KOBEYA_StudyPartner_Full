-- Study Partner ログテーブル作成
CREATE TABLE IF NOT EXISTS study_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'explain', 'practice', 'score', 'photo-analyze' etc
  topic TEXT,
  timestamp TEXT NOT NULL,
  response_data TEXT,  -- JSON形式のレスポンスデータ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_study_logs_student_id ON study_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_timestamp ON study_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_study_logs_action ON study_logs(action);