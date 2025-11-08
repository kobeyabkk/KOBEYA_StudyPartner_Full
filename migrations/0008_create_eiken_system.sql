-- ================================================================================
-- 英検対策システム - 初期スキーマ（V3版）
-- マイグレーション: 0008_create_eiken_system.sql
-- 作成日: 2025-11-08
-- 説明: 英検対策システムの基本テーブルを作成
-- ================================================================================

-- ====================
-- 1. セキュリティ・認証
-- ====================

-- 学生プロフィール
CREATE TABLE IF NOT EXISTS eiken_student_profiles (
    id TEXT PRIMARY KEY,                    -- UUID または Auth0 ID
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    target_grade TEXT NOT NULL,             -- 目標級: '5','4','3','pre2','2','pre1','1'
    registration_date TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT,
    account_status TEXT DEFAULT 'active',   -- 'active', 'suspended', 'deleted'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (account_status IN ('active', 'suspended', 'deleted')),
    CHECK (target_grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1'))
);

-- 監査ログ（セキュリティ・コンプライアンス）
CREATE TABLE IF NOT EXISTS eiken_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    action_type TEXT NOT NULL,              -- 'login', 'question_solved', 'data_export'
    resource_type TEXT,                     -- 'question', 'session', 'profile'
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,                          -- JSON: 追加情報
    FOREIGN KEY (student_id) REFERENCES eiken_student_profiles(id) ON DELETE CASCADE,
    CHECK (json_valid(metadata) OR metadata IS NULL)
);

-- ====================
-- 2. 問題分析（著作権安全版）
-- ====================

-- 過去問分析結果（問題文・選択肢は保存しない）
CREATE TABLE IF NOT EXISTS eiken_question_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_number INTEGER,
    question_type TEXT NOT NULL,            -- 'vocabulary', 'grammar', 'reading_comp', 'listening'
    
    -- 分析結果のみ
    grammar_patterns TEXT NOT NULL,         -- JSON array
    vocabulary_level TEXT NOT NULL,         -- 'CEFR-A2', 'CEFR-B1', 'CEFR-B2', etc.
    sentence_structure TEXT NOT NULL,       -- 'simple', 'compound', 'complex'
    difficulty_score REAL NOT NULL,
    distractor_patterns TEXT NOT NULL,      -- JSON object
    common_errors TEXT,                     -- JSON array
    
    source_year INTEGER,
    source_session TEXT,                    -- '1st', '2nd', '3rd'
    analysis_date TEXT DEFAULT CURRENT_TIMESTAMP,
    pattern_embedding_hash TEXT,            -- キャッシュ用
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (difficulty_score >= 0.0 AND difficulty_score <= 1.0),
    CHECK (json_valid(grammar_patterns)),
    CHECK (json_valid(distractor_patterns)),
    CHECK (json_valid(common_errors) OR common_errors IS NULL),
    CHECK (grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1'))
);

-- 一意制約: 同じ問題を重複分析しない
CREATE UNIQUE INDEX IF NOT EXISTS uq_eiken_analysis_place
    ON eiken_question_analysis(grade, section, question_number, source_year, source_session);

-- ====================
-- 3. 分析設定バージョン管理（V3新規追加）
-- ====================

-- 分析設定のバージョン管理
CREATE TABLE IF NOT EXISTS eiken_analysis_configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_version TEXT NOT NULL UNIQUE,    -- 'v1.0.0', 'v1.1.0'
    model_name TEXT NOT NULL,               -- 'gpt-4o', 'gpt-4-turbo'
    prompt_template_hash TEXT NOT NULL,     -- プロンプトのハッシュ
    is_active INTEGER DEFAULT 0,            -- 0: 非アクティブ, 1: アクティブ
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    activated_at TEXT,
    deactivated_at TEXT,
    CHECK (is_active IN (0, 1))
);

-- ====================
-- 4. AI生成問題（公開用）
-- ====================

-- AI生成問題（ユーザーに提供する唯一の問題）
CREATE TABLE IF NOT EXISTS eiken_generated_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id INTEGER,                    -- 基となった分析ID（nullable）
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_type TEXT NOT NULL,
    answer_type TEXT NOT NULL DEFAULT 'mcq', -- 'mcq', 'written', 'speaking'
    
    -- 問題データ（AI生成のみ）
    question_text TEXT NOT NULL,
    choices_json TEXT,                      -- MCQの場合のみ
    correct_answer_index INTEGER,           -- MCQの場合のみ
    correct_answer_text TEXT,               -- Written/Speakingの場合
    explanation TEXT,
    explanation_ja TEXT,
    audio_key TEXT,                         -- R2のキー（TTS生成）
    
    -- メタデータ
    difficulty_score REAL DEFAULT 0.5,
    vocab_band TEXT,
    
    -- AI生成情報
    model TEXT NOT NULL,                    -- 'gpt-4o', 'gpt-4-turbo'
    temperature REAL,
    prompt_hash TEXT,
    seed INTEGER,
    generation_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    
    -- 品質管理
    similarity_score REAL,                  -- 既存問題との類似度
    review_status TEXT DEFAULT 'pending',   -- 'pending', 'approved', 'rejected'
    reviewed_by TEXT,
    reviewed_at TEXT,
    quality_score REAL,                     -- 1-5
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    -- ✅ V3修正: json_array_length()を使わない静的上限チェック
    -- アプリケーション層で厳密に検証する
    CHECK (
        (answer_type = 'mcq' AND 
         choices_json IS NOT NULL AND 
         correct_answer_index IS NOT NULL AND 
         correct_answer_index >= 0 AND 
         correct_answer_index < 10)  -- 静的上限
        OR 
        (answer_type != 'mcq' AND 
         choices_json IS NULL AND 
         correct_answer_index IS NULL)
    ),
    CHECK (json_valid(choices_json) OR choices_json IS NULL),
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
    CHECK (difficulty_score >= 0.0 AND difficulty_score <= 1.0),
    CHECK (quality_score IS NULL OR (quality_score >= 1.0 AND quality_score <= 5.0)),
    CHECK (answer_type IN ('mcq', 'written', 'speaking')),
    CHECK (grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')),
    FOREIGN KEY (analysis_id) REFERENCES eiken_question_analysis(id) ON DELETE SET NULL
);

-- ====================
-- 5. タグ管理
-- ====================

CREATE TABLE IF NOT EXISTS eiken_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,                     -- 'grammar', 'vocabulary', 'topic'
    category TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (type IN ('grammar', 'vocabulary', 'topic'))
);

-- 生成問題とタグの関連（中間テーブル）
CREATE TABLE IF NOT EXISTS eiken_question_tags (
    question_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    relevance_score REAL DEFAULT 1.0,
    PRIMARY KEY (question_id, tag_id),
    CHECK (relevance_score >= 0.0 AND relevance_score <= 1.0),
    FOREIGN KEY (question_id) REFERENCES eiken_generated_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES eiken_tags(id) ON DELETE CASCADE
);

-- ====================
-- 6. Embeddingキャッシュ
-- ====================

-- Embeddingキャッシュ（パフォーマンス最適化）
CREATE TABLE IF NOT EXISTS eiken_embedding_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL UNIQUE,         -- SHA-256 hash
    model TEXT NOT NULL,                    -- 'text-embedding-3-small'
    embedding_json TEXT NOT NULL,           -- JSON array of floats
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
    use_count INTEGER DEFAULT 1,
    CHECK (json_valid(embedding_json))
);

-- ====================
-- 7. AI生成ログ
-- ====================

CREATE TABLE IF NOT EXISTS eiken_generation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    analysis_id INTEGER,
    model TEXT NOT NULL,
    temperature REAL,
    prompt_text TEXT,
    response_text TEXT,
    generation_time_ms INTEGER,
    tokens_used INTEGER,
    success INTEGER NOT NULL,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (success IN (0, 1)),
    FOREIGN KEY (analysis_id) REFERENCES eiken_question_analysis(id) ON DELETE SET NULL
);

-- ====================
-- 8. インデックス（パフォーマンス最適化）
-- ====================

-- 問題分析用
CREATE INDEX IF NOT EXISTS idx_eiken_analysis_grade_section 
    ON eiken_question_analysis(grade, section);
CREATE INDEX IF NOT EXISTS idx_eiken_analysis_type 
    ON eiken_question_analysis(question_type);

-- 生成問題用
CREATE INDEX IF NOT EXISTS idx_eiken_gen_questions_grade_section 
    ON eiken_generated_questions(grade, section);
CREATE INDEX IF NOT EXISTS idx_eiken_gen_questions_status 
    ON eiken_generated_questions(review_status);
CREATE INDEX IF NOT EXISTS idx_eiken_gen_questions_analysis 
    ON eiken_generated_questions(analysis_id);

-- タグ用
CREATE INDEX IF NOT EXISTS idx_eiken_question_tags_tag 
    ON eiken_question_tags(tag_id);

-- Embeddingキャッシュ用
CREATE INDEX IF NOT EXISTS idx_eiken_embedding_cache_hash 
    ON eiken_embedding_cache(text_hash);
CREATE INDEX IF NOT EXISTS idx_eiken_embedding_cache_last_used 
    ON eiken_embedding_cache(last_used_at);

-- 監査ログ用
CREATE INDEX IF NOT EXISTS idx_eiken_audit_student_time 
    ON eiken_audit_logs(student_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_eiken_audit_action 
    ON eiken_audit_logs(action_type);

-- ================================================================================
-- マイグレーション完了
-- ================================================================================
-- 注意: updated_atの自動更新はアプリケーション層で明示的に行います（V3修正）
-- 注意: PRAGMA foreign_keys = ON は各リクエストの開始時に実行します
-- ================================================================================
