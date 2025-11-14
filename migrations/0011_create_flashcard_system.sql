-- Flashcard System Tables
-- Cloudflare D1 SQLite

-- Flashcard Decks (グループ/フォルダ)
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id TEXT UNIQUE NOT NULL,
  appkey TEXT NOT NULL,
  sid TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  description TEXT,
  card_count INTEGER DEFAULT 0,
  study_count INTEGER DEFAULT 0, -- 学習回数
  last_studied_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Flashcards (単語カード)
CREATE TABLE IF NOT EXISTS flashcards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT UNIQUE NOT NULL,
  deck_id TEXT, -- NULL = 未分類
  appkey TEXT NOT NULL,
  sid TEXT NOT NULL,
  front_text TEXT NOT NULL, -- 表面（問題・単語）
  back_text TEXT NOT NULL, -- 裏面（解答・意味）
  front_image_data TEXT, -- 表面の画像（Base64 data URL）
  back_image_data TEXT, -- 裏面の画像（Base64 data URL）
  created_from TEXT DEFAULT 'manual', -- 'manual' | 'photo' | 'voice' | 'ai'
  source_image_data TEXT, -- 元画像（写真から作成した場合）
  ai_confidence REAL, -- AI生成時の信頼度スコア
  tags TEXT, -- JSON array of tags: ["英単語", "数学", "歴史"]
  difficulty INTEGER DEFAULT 0, -- 0=未設定, 1=簡単, 2=普通, 3=難しい
  mastery_level INTEGER DEFAULT 0, -- 習熟度 0-5
  review_count INTEGER DEFAULT 0, -- 復習回数
  correct_count INTEGER DEFAULT 0, -- 正解回数
  last_reviewed_at TEXT,
  next_review_at TEXT, -- 次回復習日（間隔反復学習用）
  is_favorite INTEGER DEFAULT 0, -- お気に入り
  notes TEXT, -- メモ
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deck_id) REFERENCES flashcard_decks(deck_id) ON DELETE SET NULL
);

-- Flashcard Study History (学習履歴)
CREATE TABLE IF NOT EXISTS flashcard_study_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  history_id TEXT UNIQUE NOT NULL,
  card_id TEXT NOT NULL,
  appkey TEXT NOT NULL,
  sid TEXT NOT NULL,
  is_correct INTEGER NOT NULL, -- 1=正解, 0=不正解
  response_time_ms INTEGER, -- 回答時間（ミリ秒）
  difficulty_rating INTEGER, -- ユーザーが評価した難易度 1-5
  study_mode TEXT DEFAULT 'normal', -- 'normal' | 'quick' | 'test'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (card_id) REFERENCES flashcards(card_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_sid ON flashcard_decks(sid, created_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_appkey ON flashcard_decks(appkey, created_at);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck_id ON flashcards(deck_id, created_at);
CREATE INDEX IF NOT EXISTS idx_flashcards_sid ON flashcards(sid, created_at);
CREATE INDEX IF NOT EXISTS idx_flashcards_appkey ON flashcards(appkey, created_at);
CREATE INDEX IF NOT EXISTS idx_flashcards_next_review ON flashcards(sid, next_review_at);
CREATE INDEX IF NOT EXISTS idx_flashcards_mastery ON flashcards(sid, mastery_level);
CREATE INDEX IF NOT EXISTS idx_flashcards_favorite ON flashcards(sid, is_favorite);

CREATE INDEX IF NOT EXISTS idx_flashcard_history_card ON flashcard_study_history(card_id, created_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_history_sid ON flashcard_study_history(sid, created_at);
