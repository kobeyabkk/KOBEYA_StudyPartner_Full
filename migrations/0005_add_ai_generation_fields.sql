-- AI生成コンテンツ管理のための追加フィールド
-- 問題モード、カスタム入力、学習スタイル、生成されたコンテンツを保存
--
-- NOTE: このマイグレーションはべき等（何度実行しても安全）です
-- Productionでは以下の列が既に存在しているため、インデックス作成のみ実行します:
-- - problem_mode
-- - custom_input
-- - learning_style
-- - last_theme_content
-- - last_theme_title

-- インデックスを追加（カスタム入力での検索用）
-- IF NOT EXISTSを使用しているため、既に存在する場合はスキップされる
CREATE INDEX IF NOT EXISTS idx_essay_sessions_custom_input ON essay_sessions(custom_input);
CREATE INDEX IF NOT EXISTS idx_essay_sessions_problem_mode ON essay_sessions(problem_mode);

-- マイグレーション成功をマーク
SELECT 'Migration 0005 completed: Indexes created or already exist' as status;
