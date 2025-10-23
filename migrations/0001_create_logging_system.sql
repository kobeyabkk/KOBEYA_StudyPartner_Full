-- KOBEYA 学習ログシステム データベーススキーマ
-- D1 SQLite 対応版

-- 学習ログテーブル
CREATE TABLE IF NOT EXISTS logs (
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
  textbook_code TEXT,
  page INTEGER,
  problem_id TEXT,
  error_tags TEXT, -- JSON文字列として保存
  tasks_done INTEGER DEFAULT 0,
  problems_attempted INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  incorrect INTEGER DEFAULT 0,
  mini_quiz_score INTEGER DEFAULT 0,
  weak_tags TEXT, -- JSON文字列として保存
  next_action TEXT,
  flag_teacher_review INTEGER DEFAULT 0 -- SQLite では BOOLEAN がないので INTEGER (0/1)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_logs_student_date ON logs(student_id, date);
CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date);
CREATE INDEX IF NOT EXISTS idx_logs_request_id ON logs(request_id);

-- 生徒マスターテーブル
CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY,
  student_name TEXT,
  active INTEGER DEFAULT 1, -- SQLite用 BOOLEAN (0/1)
  guardian_email TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 教材マスターテーブル
CREATE TABLE IF NOT EXISTS master_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  active INTEGER DEFAULT 1, -- SQLite用 BOOLEAN (0/1)
  grade TEXT,
  subject TEXT,
  material_code TEXT,
  page_from INTEGER,
  page_to INTEGER,
  skill_tag_primary TEXT,
  skill_tag_secondary TEXT,
  topic_tags_csv TEXT,
  difficulty TEXT,
  est_minutes INTEGER,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_materials_code_subject ON master_materials(material_code, subject);
CREATE INDEX IF NOT EXISTS idx_materials_page_range ON master_materials(page_from, page_to);
CREATE INDEX IF NOT EXISTS idx_materials_version ON master_materials(version);

-- 初期テストデータの挿入
-- 生徒データ
INSERT OR REPLACE INTO students (student_id, student_name, guardian_email) VALUES 
('JS2-04', '田中太郎', 'parent.tanaka@example.com'),
('test123', 'テスト生徒', 'test.parent@example.com');

-- 教材マスターデータ（サンプル）
INSERT OR REPLACE INTO master_materials (
  grade, subject, material_code, page_from, page_to, 
  skill_tag_primary, skill_tag_secondary, topic_tags_csv, 
  difficulty, est_minutes, version
) VALUES 
('中学2年', '数学', 'MATH2A', 1, 50, '二次方程式', '因数分解', '代数,方程式,計算', '標準', 15, 1),
('中学2年', '数学', 'MATH2A', 51, 100, '一次関数', 'グラフ', '関数,座標,直線', '標準', 20, 1),
('中学2年', '英語', 'ENG2A', 1, 30, '現在完了', '継続用法', '文法,時制,完了形', '標準', 10, 1),
('中学2年', '英語', 'ENG2A', 31, 60, '受動態', '過去分詞', '文法,態,変換', '標準', 12, 1);