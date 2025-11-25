-- Create table for eiken problem reports
CREATE TABLE IF NOT EXISTS eiken_problem_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_data TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  reported_at TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_eiken_problem_reports_reported_at 
  ON eiken_problem_reports(reported_at);

CREATE INDEX IF NOT EXISTS idx_eiken_problem_reports_question_index 
  ON eiken_problem_reports(question_index);
