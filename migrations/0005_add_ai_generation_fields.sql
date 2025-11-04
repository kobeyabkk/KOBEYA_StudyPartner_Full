-- AI生成コンテンツ管理のための追加フィールド
-- 問題モード、カスタム入力、学習スタイル、生成されたコンテンツを保存

-- 問題モード (AI生成 or 手動入力)
ALTER TABLE essay_sessions ADD COLUMN problem_mode TEXT DEFAULT 'ai';

-- カスタム入力テーマ（手動入力モード用）
ALTER TABLE essay_sessions ADD COLUMN custom_input TEXT;

-- 学習スタイル（例文重視/解説重視/自動）
ALTER TABLE essay_sessions ADD COLUMN learning_style TEXT DEFAULT 'auto';

-- 最後に生成されたテーマコンテンツ（読み物）
ALTER TABLE essay_sessions ADD COLUMN last_theme_content TEXT;

-- 最後に生成されたテーマタイトル
ALTER TABLE essay_sessions ADD COLUMN last_theme_title TEXT;

-- インデックスを追加（カスタム入力での検索用）
CREATE INDEX IF NOT EXISTS idx_essay_sessions_custom_input ON essay_sessions(custom_input);
CREATE INDEX IF NOT EXISTS idx_essay_sessions_problem_mode ON essay_sessions(problem_mode);
