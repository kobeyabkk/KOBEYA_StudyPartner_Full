-- AIベースのタグ推論への移行に伴う教材マスターテーブルの削除
-- 教材データベース依存を排除し、システムを簡素化

-- 教材マスターテーブルとそのインデックスを削除
DROP INDEX IF EXISTS idx_materials_code_subject;
DROP INDEX IF EXISTS idx_materials_page_range;
DROP INDEX IF EXISTS idx_materials_version;
DROP TABLE IF EXISTS master_materials;

-- ログテーブルのtextbook_codeカラムを削除（任意の教材に対応するため）
-- SQLiteではカラム削除が直接できないため、テーブルを再作成

-- 新しいlogsテーブル構造（textbook_codeを削除）
CREATE TABLE IF NOT EXISTS logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  student_id TEXT NOT NULL,
  student_name TEXT,
  date TEXT NOT NULL, -- SQLite では DATE 型がないので TEXT で ISO 形式
  started_at TEXT, -- ISO datetime format
  ended_at TEXT,   -- ISO datetime format
  time_spent_min INTEGER,
  subject TEXT,
  page INTEGER, -- ページ番号は参考程度として保持
  problem_id TEXT,
  error_tags TEXT, -- JSON文字列として保存
  tasks_done INTEGER DEFAULT 0,
  problems_attempted INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  incorrect INTEGER DEFAULT 0,
  mini_quiz_score INTEGER DEFAULT 0,
  weak_tags TEXT, -- JSON文字列として保存（AIベースで生成）
  next_action TEXT,
  flag_teacher_review INTEGER DEFAULT 0 -- SQLite では BOOLEAN がないので INTEGER (0/1)
);

-- 既存データをコピー（textbook_codeを除く）
INSERT INTO logs_new (
  id, request_id, created_at, student_id, student_name, 
  date, started_at, ended_at, time_spent_min, subject, 
  page, problem_id, error_tags, tasks_done, problems_attempted, 
  correct, incorrect, mini_quiz_score, weak_tags, next_action, flag_teacher_review
)
SELECT 
  id, request_id, created_at, student_id, student_name, 
  date, started_at, ended_at, time_spent_min, subject, 
  page, problem_id, error_tags, tasks_done, problems_attempted, 
  correct, incorrect, mini_quiz_score, weak_tags, next_action, flag_teacher_review
FROM logs;

-- 古いテーブルを削除し、新しいテーブルをlogsにリネーム
DROP TABLE logs;
ALTER TABLE logs_new RENAME TO logs;

-- インデックスを再作成
CREATE INDEX IF NOT EXISTS idx_logs_student_date ON logs(student_id, date);
CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date);
CREATE INDEX IF NOT EXISTS idx_logs_request_id ON logs(request_id);

-- 変更完了のメッセージ
-- コメント: 教材データベース依存を完全に排除し、AIベースのタグ推論に移行完了