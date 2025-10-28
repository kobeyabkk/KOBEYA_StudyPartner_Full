-- セッションデータの完全な永続化のための追加フィールド
-- 既存のテーブルに session_data フィールドを追加

ALTER TABLE essay_sessions ADD COLUMN session_data TEXT;

-- session_data には以下のJSON構造を保存:
-- {
--   "uploadedImages": [...],
--   "ocrResults": [...],
--   "feedbacks": [...],
--   "chatHistory": [...],
--   "vocabularyProgress": {...},
--   "lastActivity": "2024-10-28T12:00:00Z"
-- }

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_essay_sessions_updated ON essay_sessions(updated_at DESC);
