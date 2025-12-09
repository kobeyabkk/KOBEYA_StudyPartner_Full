-- Phase 5C: Validation Logs Table for Dashboard
-- 問題生成時の検証ログを記録してダッシュボードで可視化

CREATE TABLE IF NOT EXISTS question_validation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 生成リクエスト情報
  student_id TEXT NOT NULL,
  grade TEXT NOT NULL,  -- 5, 4, 3, pre-2, 2, pre-1, 1
  format TEXT NOT NULL, -- grammar_fill, long_reading, essay, etc.
  topic_code TEXT,
  
  -- 検証結果
  attempt_number INTEGER NOT NULL DEFAULT 1, -- 何回目の試行か（1-5）
  validation_stage TEXT NOT NULL, -- duplicate, grammar, vocabulary, copyright, uniqueness
  validation_passed BOOLEAN NOT NULL,
  
  -- 詳細情報（JSON）
  validation_details TEXT, -- { score: 85, threshold: 90, violations: [...] }
  
  -- メタデータ
  model_used TEXT, -- gpt-4o, gpt-4o-mini, etc.
  generation_mode TEXT, -- production, practice
  
  -- タイムスタンプ
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- インデックス作成（ダッシュボードクエリ最適化）
CREATE INDEX IF NOT EXISTS idx_validation_logs_created_at 
  ON question_validation_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_validation_logs_format_stage 
  ON question_validation_logs(format, validation_stage);

CREATE INDEX IF NOT EXISTS idx_validation_logs_grade_passed 
  ON question_validation_logs(grade, validation_passed);

-- 問題生成セッションの統計テーブル
CREATE TABLE IF NOT EXISTS generation_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  session_id TEXT UNIQUE NOT NULL,
  student_id TEXT NOT NULL,
  grade TEXT NOT NULL,
  format TEXT NOT NULL,
  
  -- 統計
  total_attempts INTEGER NOT NULL DEFAULT 0,
  successful_generations INTEGER NOT NULL DEFAULT 0,
  failed_generations INTEGER NOT NULL DEFAULT 0,
  
  -- 失敗理由の内訳
  failed_vocabulary INTEGER NOT NULL DEFAULT 0,
  failed_copyright INTEGER NOT NULL DEFAULT 0,
  failed_grammar INTEGER NOT NULL DEFAULT 0,
  failed_uniqueness INTEGER NOT NULL DEFAULT 0,
  failed_duplicate INTEGER NOT NULL DEFAULT 0,
  
  -- 時間情報
  total_generation_time_ms INTEGER NOT NULL DEFAULT 0,
  average_generation_time_ms REAL,
  
  -- タイムスタンプ
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_generation_sessions_student_grade 
  ON generation_sessions(student_id, grade);

CREATE INDEX IF NOT EXISTS idx_generation_sessions_started_at 
  ON generation_sessions(started_at);
