-- Essay Problem Library System
-- 小論文問題ライブラリシステム
-- Created: 2025-12-02

-- ========================================
-- Table 1: essay_problem_library
-- 問題ライブラリ（AI生成した問題を蓄積・再利用）
-- ========================================
CREATE TABLE IF NOT EXISTS essay_problem_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 問題内容
    theme TEXT NOT NULL,                    -- テーマ（例: 環境問題、AI技術、教育問題）
    problem_text TEXT NOT NULL,             -- 問題文本体
    target_level TEXT NOT NULL,             -- 対象レベル（high_school, vocational, university）
    target_word_count INTEGER,              -- 目安文字数（200, 300, 800等）
    
    -- 分類・タグ
    category TEXT,                          -- カテゴリ（社会問題、科学技術、文化、時事問題等）
    tags TEXT,                              -- JSON形式のタグ配列
    is_current_event BOOLEAN DEFAULT 0,     -- 時事問題フラグ（1=時事問題、毎年4月1日にチェック）
    
    -- 品質管理
    quality_score INTEGER DEFAULT 50,       -- 品質スコア（50から始まり、使用回数・評価で変動）
    usage_count INTEGER DEFAULT 0,          -- 使用回数
    avg_student_score REAL,                 -- この問題を使った生徒の平均点
    
    -- 重複排除
    content_hash TEXT UNIQUE,               -- 問題文のSHA256ハッシュ（重複防止）
    
    -- ライフサイクル管理
    is_active BOOLEAN DEFAULT 1,            -- 有効フラグ（0=論理削除）
    is_approved BOOLEAN DEFAULT 1,          -- 承認フラグ（自動承認=1）
    
    -- メタデータ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'ai',           -- 作成者（ai or 教師ID）
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMP,               -- 無効化日時
    notes TEXT                              -- 管理者用メモ
);

-- ========================================
-- Table 2: essay_problem_usage
-- 問題使用履歴（同じ生徒に同じ問題を出さないための記録）
-- ========================================
CREATE TABLE IF NOT EXISTS essay_problem_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    student_id TEXT NOT NULL,               -- 生徒ID
    problem_id INTEGER NOT NULL,            -- 問題ID
    session_id INTEGER NOT NULL,            -- セッションID
    
    student_score REAL,                     -- 生徒がこの問題で取った点数（後から更新）
    
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (problem_id) REFERENCES essay_problem_library(id),
    FOREIGN KEY (session_id) REFERENCES essay_sessions(id)
);

-- ========================================
-- Indexes
-- ========================================

-- 問題検索用の複合インデックス
CREATE INDEX IF NOT EXISTS idx_library_search 
ON essay_problem_library(theme, target_level, is_active, is_approved);

-- 品質スコア順検索用
CREATE INDEX IF NOT EXISTS idx_library_quality 
ON essay_problem_library(quality_score DESC, usage_count ASC);

-- 時事問題検索用
CREATE INDEX IF NOT EXISTS idx_library_current_event 
ON essay_problem_library(is_current_event, created_at DESC);

-- 使用履歴：生徒別検索用
CREATE INDEX IF NOT EXISTS idx_usage_student 
ON essay_problem_usage(student_id, problem_id);

-- 使用履歴：問題別検索用
CREATE INDEX IF NOT EXISTS idx_usage_problem 
ON essay_problem_usage(problem_id);

-- 重複防止：生徒×問題のユニーク制約
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_unique 
ON essay_problem_usage(student_id, problem_id);

-- ========================================
-- 初期データ（オプション）
-- ========================================

-- 品質スコアの説明:
-- 100: 最高品質（10回以上使用、平均80点以上）
-- 75-99: 高品質（5回以上使用、平均70点以上）
-- 50-74: 標準（デフォルト）
-- 25-49: 低品質（平均60点以下）
-- 0-24: 要改善（平均50点以下、非推奨）

-- ========================================
-- メンテナンスクエリ（コメントとして記録）
-- ========================================

-- 1. 毎年4月1日に時事問題を論理削除
-- UPDATE essay_problem_library 
-- SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP
-- WHERE is_current_event = 1 
--   AND created_at < date('now', '-1 year');

-- 2. 品質スコアの自動更新（使用回数と平均点から計算）
-- UPDATE essay_problem_library
-- SET quality_score = CASE
--     WHEN usage_count >= 10 AND avg_student_score >= 80 THEN 100
--     WHEN usage_count >= 5 AND avg_student_score >= 70 THEN 85
--     WHEN usage_count >= 3 AND avg_student_score >= 60 THEN 60
--     WHEN usage_count >= 1 AND avg_student_score < 50 THEN 20
--     ELSE 50
-- END;

-- 3. 使用されていない低品質問題の論理削除（オプション）
-- UPDATE essay_problem_library
-- SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP
-- WHERE usage_count = 0 
--   AND created_at < date('now', '-6 months')
--   AND quality_score < 40;
