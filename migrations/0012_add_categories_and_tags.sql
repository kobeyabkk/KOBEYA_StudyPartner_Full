-- Migration: Add Categories and Tags System
-- Date: 2025-11-15
-- Description: Add category and tag management for flashcards

-- カテゴリテーブル
CREATE TABLE IF NOT EXISTS flashcard_categories (
    category_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#8b5cf6',
    icon TEXT DEFAULT '📚',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flashcard_categories_user ON flashcard_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_categories_name ON flashcard_categories(user_id, name);

-- タグテーブル
CREATE TABLE IF NOT EXISTS flashcard_tags (
    tag_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flashcard_tags_user ON flashcard_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_tags_name ON flashcard_tags(user_id, name);

-- カードとタグの中間テーブル（多対多リレーション）
CREATE TABLE IF NOT EXISTS flashcard_card_tags (
    card_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id, tag_id),
    FOREIGN KEY (card_id) REFERENCES flashcards(card_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES flashcard_tags(tag_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_flashcard_card_tags_card ON flashcard_card_tags(card_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_card_tags_tag ON flashcard_card_tags(tag_id);

-- flashcardsテーブルにcategory_idカラムを追加
-- Note: If column already exists, this will fail silently in production
-- For development, we check if column exists before adding
-- Default NULL means "未分類" (uncategorized)
