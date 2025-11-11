-- ================================================================================
-- 語彙辞書システム - Phase 1 PoC
-- マイグレーション: 0009_create_vocabulary_lexicon.sql
-- 作成日: 2025-11-11
-- 説明: 語彙レベル管理のための辞書テーブル
-- ================================================================================

-- ====================
-- 1. 語彙辞書テーブル
-- ====================

CREATE TABLE IF NOT EXISTS eiken_vocabulary_lexicon (
    word_lemma TEXT NOT NULL,              -- 見出し語（原型）例: "go", "run", "good"
    pos TEXT NOT NULL,                     -- 品詞 (verb/noun/adj/adv/prep/conj/pron)
    cefr_level TEXT NOT NULL,              -- CEFRレベル: 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'
    zipf_score REAL,                       -- 頻度スコア (1.0-7.0, wordfreqベース)
    grade_level INTEGER,                   -- 英検級 (5, 4, 3, 21=準2, 2, 11=準1, 1)
    
    -- 信頼性管理（複数ソース統合）
    sources TEXT NOT NULL,                 -- JSON: ["CEFR-J", "SVL", "NGSL"]
    confidence REAL NOT NULL DEFAULT 1.0,  -- 複数ソース一致度 (0.0-1.0)
    
    -- メタデータ
    frequency_rank INTEGER,                -- 頻度順位（オプション）
    manual_verified INTEGER DEFAULT 0,     -- 手動検証済みフラグ
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,                            -- メモ（オプション）
    
    PRIMARY KEY (word_lemma, pos),
    
    CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    CHECK (pos IN ('verb', 'noun', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'other')),
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
    CHECK (manual_verified IN (0, 1)),
    CHECK (zipf_score IS NULL OR (zipf_score >= 0.0 AND zipf_score <= 8.0)),
    CHECK (grade_level IS NULL OR grade_level IN (1, 2, 3, 4, 5, 11, 21)),
    CHECK (json_valid(sources))
);

-- ====================
-- 2. インデックス（検索最適化）
-- ====================

-- CEFRレベルでの検索
CREATE INDEX IF NOT EXISTS idx_vocab_cefr 
    ON eiken_vocabulary_lexicon(cefr_level);

-- 英検級でのフィルタリング
CREATE INDEX IF NOT EXISTS idx_vocab_grade 
    ON eiken_vocabulary_lexicon(grade_level);

-- 頻度スコアでのソート
CREATE INDEX IF NOT EXISTS idx_vocab_zipf 
    ON eiken_vocabulary_lexicon(zipf_score DESC);

-- 信頼度でのフィルタリング
CREATE INDEX IF NOT EXISTS idx_vocab_confidence 
    ON eiken_vocabulary_lexicon(confidence DESC);

-- 見出し語での高速検索（PRIMARY KEYで既にカバーされているが明示）
CREATE INDEX IF NOT EXISTS idx_vocab_lemma 
    ON eiken_vocabulary_lexicon(word_lemma);

-- ====================
-- 3. 語彙チェックキャッシュテーブル（パフォーマンス最適化）
-- ====================

-- 問題生成時の語彙チェック結果をキャッシュ
CREATE TABLE IF NOT EXISTS eiken_vocabulary_check_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL UNIQUE,        -- SHA-256ハッシュ
    target_grade TEXT NOT NULL,            -- '5', '4', '3', 'pre2', '2', 'pre1', '1'
    
    -- 検証結果
    is_valid INTEGER NOT NULL,             -- 0: NG, 1: OK
    total_words INTEGER NOT NULL,
    unique_words INTEGER NOT NULL,
    out_of_range_words TEXT,               -- JSON: ["word1", "word2"]
    out_of_range_ratio REAL NOT NULL,
    zipf_violations TEXT,                  -- JSON: ["lowfreq1", "lowfreq2"]
    
    -- メタデータ
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
    use_count INTEGER DEFAULT 1,
    
    CHECK (is_valid IN (0, 1)),
    CHECK (out_of_range_ratio >= 0.0 AND out_of_range_ratio <= 1.0),
    CHECK (target_grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')),
    CHECK (json_valid(out_of_range_words) OR out_of_range_words IS NULL),
    CHECK (json_valid(zipf_violations) OR zipf_violations IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_vocab_check_cache_hash 
    ON eiken_vocabulary_check_cache(text_hash);

CREATE INDEX IF NOT EXISTS idx_vocab_check_cache_last_used 
    ON eiken_vocabulary_check_cache(last_used_at DESC);

-- ====================
-- 4. 語彙統計テーブル（分析用）
-- ====================

-- 生成問題の語彙統計
CREATE TABLE IF NOT EXISTS eiken_vocabulary_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,          -- eiken_generated_questionsへの外部キー
    grade TEXT NOT NULL,
    
    -- 語彙分析結果
    total_words INTEGER NOT NULL,
    unique_words INTEGER NOT NULL,
    avg_zipf_score REAL,
    cefr_distribution TEXT NOT NULL,       -- JSON: {"A1": 10, "A2": 5, "B1": 2}
    out_of_range_count INTEGER DEFAULT 0,
    
    -- メタデータ
    analyzed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')),
    CHECK (json_valid(cefr_distribution)),
    CHECK (out_of_range_count >= 0),
    FOREIGN KEY (question_id) REFERENCES eiken_generated_questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vocab_stats_question 
    ON eiken_vocabulary_stats(question_id);

CREATE INDEX IF NOT EXISTS idx_vocab_stats_grade 
    ON eiken_vocabulary_stats(grade);

-- ================================================================================
-- マイグレーション完了
-- ================================================================================

-- 注意事項:
-- 1. このテーブルは大量のデータ（数千～数万行）を想定
-- 2. KVキャッシュとの併用を推奨（頻繁にアクセスされる語彙はKVに）
-- 3. zipf_score < 3.5 の語彙は「低頻度」として扱う
-- 4. confidence < 0.8 の語彙は慎重に扱う（複数ソースで不一致）
-- ================================================================================
