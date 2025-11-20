-- セッションデータの完全な永続化のための追加フィールド
-- 既存のテーブルに session_data フィールドを追加
-- 
-- NOTE: このマイグレーションはべき等（何度実行しても安全）です
-- Productionでは session_data 列が既に存在しているため、このマイグレーションは
-- インデックス作成のみを実行します。

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
-- IF NOT EXISTSを使用しているため、既に存在する場合はスキップされる
CREATE INDEX IF NOT EXISTS idx_essay_sessions_updated ON essay_sessions(updated_at DESC);

-- マイグレーション成功をマーク
-- session_data列は既に存在するため、何もしない
SELECT 'Migration 0004 completed: Index created or already exists' as status;
