-- 小論文指導システム データベーススキーマ
-- D1 SQLite 対応版

-- 小論文学習セッションテーブル
CREATE TABLE IF NOT EXISTS essay_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  student_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  -- 授業設定
  target_level TEXT NOT NULL, -- 'high_school', 'vocational', 'university'
  lesson_format TEXT NOT NULL, -- 'full_55min', 'vocabulary_focus', 'short_essay_focus'
  
  -- 進捗状況
  current_step INTEGER DEFAULT 1, -- 1-6 (導入/語彙/短文/本練習/チャレンジ/まとめ)
  step_status TEXT, -- JSON: {"1":"completed","2":"in_progress",...}
  
  -- 今日のテーマ
  theme TEXT,
  reading_material TEXT, -- 導入用読み物
  
  -- 完了フラグ
  is_completed INTEGER DEFAULT 0,
  completion_time TEXT
);

-- 小論文提出物テーブル（手書き原稿）
CREATE TABLE IF NOT EXISTS essay_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  submission_type TEXT NOT NULL, -- 'short_practice', 'main_practice', 'challenge'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  -- 原稿データ
  image_data TEXT, -- Base64画像データ（大きい場合は別ストレージ検討）
  ocr_text TEXT NOT NULL, -- OCR読み取りテキスト
  student_confirmed_text TEXT, -- 生徒確認後の修正済みテキスト
  readability_score TEXT, -- 'A', 'B', 'C', 'D'
  readability_comment TEXT,
  
  -- 評価情報
  word_count INTEGER,
  feedback_good TEXT, -- 良かった点
  feedback_improve TEXT, -- 改善点
  feedback_example TEXT, -- 模範例
  feedback_next TEXT, -- 次回への課題
  score INTEGER, -- 0-100
  
  FOREIGN KEY (session_id) REFERENCES essay_sessions(session_id)
);

-- 学習記録カードテーブル
CREATE TABLE IF NOT EXISTS essay_learning_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  -- 学習内容
  learned_vocabulary TEXT, -- JSON配列: ["語彙1", "語彙2", ...]
  improvement_points TEXT, -- JSON配列: ["改善点1", "改善点2", "改善点3"]
  next_focus TEXT, -- JSON配列: ["次回重点1", "次回重点2"]
  
  -- 評価
  total_score INTEGER,
  overall_comment TEXT,
  
  -- 宿題
  homework_theme TEXT,
  homework_submitted INTEGER DEFAULT 0,
  
  FOREIGN KEY (session_id) REFERENCES essay_sessions(session_id)
);

-- 語彙学習履歴テーブル
CREATE TABLE IF NOT EXISTS essay_vocabulary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  -- 語彙変換
  colloquial_expression TEXT NOT NULL, -- 口語表現
  essay_expression TEXT NOT NULL, -- 小論文風表現
  student_answer TEXT, -- 生徒の回答
  is_correct INTEGER, -- 正誤 (0/1)
  
  FOREIGN KEY (session_id) REFERENCES essay_sessions(session_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_essay_sessions_student ON essay_sessions(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_essay_sessions_session_id ON essay_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_essay_submissions_session ON essay_submissions(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_essay_cards_session ON essay_learning_cards(session_id);
CREATE INDEX IF NOT EXISTS idx_essay_vocab_session ON essay_vocabulary(session_id);
