-- ================================================================================
-- 英検語彙レベル管理システム - Phase 1
-- マイグレーション: 0009_create_vocabulary_lexicon.sql
-- 作成日: 2025-12-29
-- 説明: 語彙辞書テーブルを作成し、CEFR/頻度ベースの語彙管理を実現
-- ================================================================================

-- ====================
-- 1. 語彙辞書（Vocabulary Lexicon）
-- ====================

-- 語彙辞書マスターテーブル
-- 複数ソース（CEFR-J, SVL, NGSL等）を統合し、信頼性スコア付きで管理
CREATE TABLE IF NOT EXISTS eiken_vocabulary_lexicon (
    word_lemma TEXT NOT NULL,              -- 見出し語（原型）例: "run", "study"
    pos TEXT NOT NULL,                     -- 品詞 (noun/verb/adj/adv/prep/conj/det/pron)
    cefr_level TEXT NOT NULL,              -- CEFR レベル: 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'
    zipf_score REAL,                       -- Zipf頻度スコア (1.0-7.0, 高いほど頻出)
    grade_level INTEGER,                   -- 英検級 (5, 4, 3, 21, 2, 11, 1) ※21=準2級, 11=準1級
    
    -- 信頼性管理（複数ソース統合）
    sources TEXT NOT NULL,                 -- JSON配列: ["CEFR-J", "SVL", "NGSL", "manual"]
    confidence REAL NOT NULL DEFAULT 1.0,  -- 信頼度スコア (0.0-1.0)
    
    -- メタデータ
    frequency_rank INTEGER,                -- 頻度順位（低いほど頻出）
    manual_verified INTEGER DEFAULT 0,     -- 手動検証済みフラグ (0 or 1)
    notes TEXT,                            -- 備考・特記事項
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (word_lemma, pos),
    
    -- 制約条件
    CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
    CHECK (manual_verified IN (0, 1)),
    CHECK (json_valid(sources)),
    CHECK (grade_level IS NULL OR grade_level IN (5, 4, 3, 21, 2, 11, 1)),
    CHECK (zipf_score IS NULL OR (zipf_score >= 1.0 AND zipf_score <= 7.0))
);

-- ====================
-- 2. インデックス（高速検索）
-- ====================

-- CEFR レベル検索用
CREATE INDEX IF NOT EXISTS idx_vocab_cefr 
    ON eiken_vocabulary_lexicon(cefr_level);

-- 英検級検索用
CREATE INDEX IF NOT EXISTS idx_vocab_grade 
    ON eiken_vocabulary_lexicon(grade_level);

-- Zipf スコア検索用（頻度フィルタリング）
CREATE INDEX IF NOT EXISTS idx_vocab_zipf 
    ON eiken_vocabulary_lexicon(zipf_score);

-- 信頼度検索用（高信頼度データ優先）
CREATE INDEX IF NOT EXISTS idx_vocab_confidence 
    ON eiken_vocabulary_lexicon(confidence);

-- 品詞検索用
CREATE INDEX IF NOT EXISTS idx_vocab_pos 
    ON eiken_vocabulary_lexicon(pos);

-- 複合インデックス（CEFRレベル + 信頼度）
CREATE INDEX IF NOT EXISTS idx_vocab_cefr_confidence 
    ON eiken_vocabulary_lexicon(cefr_level, confidence DESC);

-- ====================
-- 3. 語彙使用統計（問題生成での使用状況追跡）
-- ====================

-- 生成問題で使用された語彙の統計
CREATE TABLE IF NOT EXISTS eiken_vocabulary_usage_stats (
    word_lemma TEXT NOT NULL,
    pos TEXT NOT NULL,
    grade TEXT NOT NULL,                   -- 問題の級 ('5', '4', '3', 'pre2', '2', 'pre1', '1')
    usage_count INTEGER DEFAULT 1,         -- 使用回数
    last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
    first_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (word_lemma, pos, grade),
    
    CHECK (grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')),
    FOREIGN KEY (word_lemma, pos) REFERENCES eiken_vocabulary_lexicon(word_lemma, pos) ON DELETE CASCADE
);

-- 使用頻度検索用インデックス
CREATE INDEX IF NOT EXISTS idx_vocab_usage_grade 
    ON eiken_vocabulary_usage_stats(grade, usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_usage_last_used 
    ON eiken_vocabulary_usage_stats(last_used_at DESC);

-- ====================
-- 4. 語彙検証ログ（問題生成時の語彙チェック記録）
-- ====================

-- 語彙レベル検証のログ
CREATE TABLE IF NOT EXISTS eiken_vocabulary_validation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER,                   -- 検証した問題ID（nullable: 生成前検証の場合）
    grade TEXT NOT NULL,
    validation_type TEXT NOT NULL,         -- 'pre_generation' or 'post_generation'
    
    -- 検証結果
    total_words INTEGER NOT NULL,
    unique_words INTEGER NOT NULL,
    out_of_range_words TEXT,               -- JSON配列: 範囲外の語彙
    out_of_range_ratio REAL NOT NULL,
    zipf_violations TEXT,                  -- JSON配列: 低頻度語
    is_valid INTEGER NOT NULL,             -- 0 or 1
    
    -- タイムスタンプ
    validated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (validation_type IN ('pre_generation', 'post_generation')),
    CHECK (is_valid IN (0, 1)),
    CHECK (json_valid(out_of_range_words) OR out_of_range_words IS NULL),
    CHECK (json_valid(zipf_violations) OR zipf_violations IS NULL),
    CHECK (grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')),
    CHECK (out_of_range_ratio >= 0.0 AND out_of_range_ratio <= 1.0),
    FOREIGN KEY (question_id) REFERENCES eiken_generated_questions(id) ON DELETE CASCADE
);

-- 検証ログ検索用インデックス
CREATE INDEX IF NOT EXISTS idx_vocab_validation_question 
    ON eiken_vocabulary_validation_logs(question_id);

CREATE INDEX IF NOT EXISTS idx_vocab_validation_grade_valid 
    ON eiken_vocabulary_validation_logs(grade, is_valid);

CREATE INDEX IF NOT EXISTS idx_vocab_validation_time 
    ON eiken_vocabulary_validation_logs(validated_at DESC);

-- ====================
-- 5. サンプルデータ投入（基本的な語彙のみ）
-- ====================

-- 超基本語彙（A1レベル）のサンプル
-- 実際のデータは別途インポートスクリプトで投入
INSERT OR IGNORE INTO eiken_vocabulary_lexicon 
    (word_lemma, pos, cefr_level, zipf_score, grade_level, sources, confidence, frequency_rank, manual_verified) 
VALUES 
    ('be', 'verb', 'A1', 7.0, 5, '["manual"]', 1.0, 1, 1),
    ('have', 'verb', 'A1', 6.8, 5, '["manual"]', 1.0, 2, 1),
    ('do', 'verb', 'A1', 6.5, 5, '["manual"]', 1.0, 3, 1),
    ('say', 'verb', 'A1', 6.2, 5, '["manual"]', 1.0, 4, 1),
    ('go', 'verb', 'A1', 6.0, 5, '["manual"]', 1.0, 5, 1),
    ('get', 'verb', 'A1', 5.9, 5, '["manual"]', 1.0, 6, 1),
    ('make', 'verb', 'A1', 5.8, 5, '["manual"]', 1.0, 7, 1),
    ('know', 'verb', 'A1', 5.7, 5, '["manual"]', 1.0, 8, 1),
    ('think', 'verb', 'A1', 5.6, 5, '["manual"]', 1.0, 9, 1),
    ('take', 'verb', 'A1', 5.5, 5, '["manual"]', 1.0, 10, 1),
    ('see', 'verb', 'A1', 5.4, 5, '["manual"]', 1.0, 11, 1),
    ('come', 'verb', 'A1', 5.3, 5, '["manual"]', 1.0, 12, 1),
    ('want', 'verb', 'A1', 5.2, 5, '["manual"]', 1.0, 13, 1),
    ('use', 'verb', 'A1', 5.1, 5, '["manual"]', 1.0, 14, 1),
    ('find', 'verb', 'A1', 5.0, 5, '["manual"]', 1.0, 15, 1),
    
    ('time', 'noun', 'A1', 6.0, 5, '["manual"]', 1.0, 20, 1),
    ('person', 'noun', 'A1', 5.8, 5, '["manual"]', 1.0, 21, 1),
    ('year', 'noun', 'A1', 5.7, 5, '["manual"]', 1.0, 22, 1),
    ('way', 'noun', 'A1', 5.6, 5, '["manual"]', 1.0, 23, 1),
    ('day', 'noun', 'A1', 5.5, 5, '["manual"]', 1.0, 24, 1),
    ('thing', 'noun', 'A1', 5.4, 5, '["manual"]', 1.0, 25, 1),
    ('man', 'noun', 'A1', 5.3, 5, '["manual"]', 1.0, 26, 1),
    ('world', 'noun', 'A1', 5.2, 5, '["manual"]', 1.0, 27, 1),
    ('life', 'noun', 'A1', 5.1, 5, '["manual"]', 1.0, 28, 1),
    ('hand', 'noun', 'A1', 5.0, 5, '["manual"]', 1.0, 29, 1),
    
    ('good', 'adj', 'A1', 5.8, 5, '["manual"]', 1.0, 30, 1),
    ('new', 'adj', 'A1', 5.7, 5, '["manual"]', 1.0, 31, 1),
    ('first', 'adj', 'A1', 5.6, 5, '["manual"]', 1.0, 32, 1),
    ('last', 'adj', 'A1', 5.5, 5, '["manual"]', 1.0, 33, 1),
    ('long', 'adj', 'A1', 5.4, 5, '["manual"]', 1.0, 34, 1),
    ('great', 'adj', 'A1', 5.3, 5, '["manual"]', 1.0, 35, 1),
    ('little', 'adj', 'A1', 5.2, 5, '["manual"]', 1.0, 36, 1),
    ('own', 'adj', 'A1', 5.1, 5, '["manual"]', 1.0, 37, 1),
    ('other', 'adj', 'A1', 5.0, 5, '["manual"]', 1.0, 38, 1),
    ('old', 'adj', 'A1', 4.9, 5, '["manual"]', 1.0, 39, 1);

-- ================================================================================
-- マイグレーション完了
-- ================================================================================
-- 次のステップ:
-- 1. 語彙データの本格投入（import-vocabulary-data スクリプト）
-- 2. Vocabulary Analyzer サービスの実装
-- 3. 問題生成フローへの統合
-- ================================================================================
