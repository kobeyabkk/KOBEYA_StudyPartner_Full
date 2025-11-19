-- Migration: 0015_create_generated_questions.sql
-- Description: Phase 3 - 生成された問題を保存するテーブル
-- Created: 2025-11-19

-- ============================================================================
-- 生成された問題テーブル
-- ============================================================================

CREATE TABLE IF NOT EXISTS eiken_generated_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Blueprint情報
    blueprint_id TEXT NOT NULL,
    
    -- 生徒情報
    student_id TEXT NOT NULL,
    
    -- 問題メタデータ
    grade TEXT NOT NULL CHECK (grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')),
    format TEXT NOT NULL CHECK (format IN ('grammar_fill', 'opinion_speech', 'reading_aloud', 'long_reading', 'essay')),
    topic_code TEXT NOT NULL,
    
    -- 問題データ（JSON）
    question_data TEXT NOT NULL,  -- JSON形式で保存
    
    -- 生成メタデータ
    model_used TEXT NOT NULL,  -- 'gpt-4o' or 'gpt-4o-mini'
    generation_mode TEXT NOT NULL CHECK (generation_mode IN ('production', 'practice')),
    
    -- 検証結果
    validation_passed INTEGER NOT NULL DEFAULT 0 CHECK (validation_passed IN (0, 1)),
    vocabulary_score REAL,
    copyright_score REAL,
    
    -- タイムスタンプ
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- インデックス用
    session_id TEXT  -- オプション: セッションに紐付ける場合
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_generated_questions_student 
    ON eiken_generated_questions(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_questions_grade 
    ON eiken_generated_questions(grade, format);

CREATE INDEX IF NOT EXISTS idx_generated_questions_topic 
    ON eiken_generated_questions(topic_code);

CREATE INDEX IF NOT EXISTS idx_generated_questions_blueprint 
    ON eiken_generated_questions(blueprint_id);

-- ============================================================================
-- 検証ログテーブル（オプション: 詳細なデバッグ用）
-- ============================================================================

CREATE TABLE IF NOT EXISTS eiken_generation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    question_id INTEGER,  -- NULL可能（生成失敗時）
    student_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    format TEXT NOT NULL,
    
    -- 試行情報
    attempt_number INTEGER NOT NULL,
    model_used TEXT NOT NULL,
    generation_mode TEXT NOT NULL,
    
    -- 検証結果
    vocabulary_passed INTEGER CHECK (vocabulary_passed IN (0, 1)),
    vocabulary_score REAL,
    copyright_passed INTEGER CHECK (copyright_passed IN (0, 1)),
    copyright_score REAL,
    
    -- エラー情報
    error_message TEXT,
    
    -- タイムスタンプ
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (question_id) REFERENCES eiken_generated_questions(id)
);

CREATE INDEX IF NOT EXISTS idx_generation_logs_student 
    ON eiken_generation_logs(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_logs_success 
    ON eiken_generation_logs(vocabulary_passed, copyright_passed);
