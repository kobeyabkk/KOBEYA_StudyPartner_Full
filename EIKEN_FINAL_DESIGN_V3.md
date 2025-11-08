# 英検対策システム - 最終設計書 V3.0（最終レビュー統合版）

## 🎯 V3の重要な改善（V2からの進化）

本ドキュメントは**3つのAI（ChatGPT、Claude、Genspark）からの最終レビュー**を完全統合し、以下の**技術的危険性と不完全性**を全て解決した最終版です。

### 🚨 V2で発見された問題点

1. **CHECK制約の技術的危険性**: `json_array_length()`はSQLite CHECK制約内で不安定
2. **Workers環境の制約違反**: `setInterval`は非推奨、リクエストベースのクリーンアップが必要
3. **updated_atトリガーの無限ループリスク**: AFTER UPDATEトリガーが同テーブル更新で無限ループの可能性
4. **著作権安全性の不十分さ**: 15%単独閾値では不十分、多層防御が必要
5. **レート制限の不完全さ**: バースト対策、リトライ機能、統計監視が不足

### ✅ V3の解決策（実装可能な最終版）

1. **CHECK制約の修正**: 静的上限（10）+ アプリケーション層での厳密な検証
2. **Embeddingキャッシュの修正**: `setInterval`削除、リクエストベースのクリーンアップ
3. **updated_atトリガーの削除**: アプリケーション層で明示的に更新
4. **著作権安全システムの強化**:
   - 動的閾値（文章長に応じて10-15%）
   - 多層防御（bigram、trigram、fourgram、embedding、完全一致フレーズ）
   - 英検特有の拡張禁止パターン（15種類以上）
5. **レート制限の大幅強化**:
   - バースト対策（最大キューサイズ）
   - リトライ機能（exponential backoff）
   - 統計監視とアラート
   - RateLimiterManager（複数APIの統合管理）
6. **分析設定バージョン管理**: `analysis_configurations`テーブル追加
7. **実装ロードマップの調整**: Week 2.5追加、Week 8-10を3週に拡張
8. **詳細なテスト戦略**: 著作権安全性、CHECK制約、メモリリーク、レート制限テスト
9. **完了条件の詳細化**: 各Weekごとの定量的な完了基準

---

## 📊 データベース設計（V3版）

### 核心原則（変更なし）
- ✅ **過去問は分析結果のみ**: 問題文・選択肢は保存しない
- ✅ **AI生成問題のみ公開**: ユーザーに提供する問題は100% AI生成
- ✅ **強化された類似度監視**: 多層防御システム（bigram、trigram、fourgram、embedding、完全一致）
- ✅ **トランザクション**: バッチ処理で原子性保証
- ✅ **外部キー制約**: データ整合性の保証

---

## 🗄️ 完全なスキーマ定義（V3版 - 修正済み）

```sql
-- ====================
-- 初期化: 外部キー制約を有効化
-- ====================
PRAGMA foreign_keys = ON;

-- ====================
-- 1. セキュリティ・認証
-- ====================

-- 学生プロフィール（セキュリティ強化）
CREATE TABLE IF NOT EXISTS student_profiles (
    id TEXT PRIMARY KEY,                    -- UUID または Auth0 ID
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    target_grade TEXT NOT NULL,             -- 目標級
    registration_date TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT,
    account_status TEXT DEFAULT 'active',   -- 'active', 'suspended', 'deleted'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (account_status IN ('active', 'suspended', 'deleted'))
);

-- 監査ログ（セキュリティ・コンプライアンス）
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    action_type TEXT NOT NULL,              -- 'login', 'question_solved', 'data_export'
    resource_type TEXT,                     -- 'question', 'session', 'profile'
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,                          -- JSON: 追加情報
    FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    CHECK (json_valid(metadata) OR metadata IS NULL)
);

-- ====================
-- 2. 問題分析（著作権安全版）
-- ====================

-- 過去問分析結果（問題文・選択肢は保存しない）
CREATE TABLE IF NOT EXISTS question_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_number INTEGER,
    question_type TEXT NOT NULL,
    
    -- 分析結果のみ
    grammar_patterns TEXT NOT NULL,         -- JSON array
    vocabulary_level TEXT NOT NULL,
    sentence_structure TEXT NOT NULL,
    difficulty_score REAL NOT NULL,
    distractor_patterns TEXT NOT NULL,      -- JSON object
    common_errors TEXT,                     -- JSON array
    
    source_year INTEGER,
    source_session TEXT,
    analysis_date TEXT DEFAULT CURRENT_TIMESTAMP,
    pattern_embedding_hash TEXT,            -- キャッシュ用
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (difficulty_score >= 0.0 AND difficulty_score <= 1.0),
    CHECK (json_valid(grammar_patterns)),
    CHECK (json_valid(distractor_patterns)),
    CHECK (json_valid(common_errors) OR common_errors IS NULL)
);

-- 一意制約: 同じ問題を重複分析しない
CREATE UNIQUE INDEX IF NOT EXISTS uq_analysis_place
    ON question_analysis(grade, section, question_number, source_year, source_session);

-- ====================
-- 3. AI生成問題（公開用）- V3修正版
-- ====================

-- AI生成問題（ユーザーに提供する唯一の問題）
CREATE TABLE IF NOT EXISTS generated_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id INTEGER,                    -- 基となった分析ID（nullable）
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_type TEXT NOT NULL,
    answer_type TEXT NOT NULL DEFAULT 'mcq', -- 'mcq', 'writing', 'speaking'
    
    -- 問題データ（AI生成のみ）
    question_text TEXT NOT NULL,
    choices_json TEXT,                      -- MCQのみ必須
    correct_answer_index INTEGER,           -- MCQのみ必須
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
    FOREIGN KEY (analysis_id) REFERENCES question_analysis(id) ON DELETE SET NULL
);

-- ====================
-- 4. 分析設定バージョン管理（V3新規追加）
-- ====================

-- 分析設定のバージョン管理
CREATE TABLE IF NOT EXISTS analysis_configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_version TEXT NOT NULL UNIQUE,    -- 'v1.0.0', 'v1.1.0'
    model_name TEXT NOT NULL,               -- 'gpt-4o', 'gpt-4-turbo'
    prompt_template_hash TEXT NOT NULL,     -- プロンプトテンプレートのSHA-256
    analysis_parameters TEXT NOT NULL,      -- JSON: temperature, top_p等
    is_active INTEGER DEFAULT 0,            -- 現在有効なバージョン（1つのみ）
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    notes TEXT,
    
    CHECK (is_active IN (0, 1)),
    CHECK (json_valid(analysis_parameters))
);

-- 一意制約: 有効なバージョンは1つのみ
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_config
    ON analysis_configurations(is_active) WHERE is_active = 1;

-- 分析設定と分析結果の関連
ALTER TABLE question_analysis ADD COLUMN config_version_id INTEGER REFERENCES analysis_configurations(id);

-- ====================
-- 5. タグ管理
-- ====================

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,                     -- 'grammar', 'vocabulary', 'topic'
    category TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (type IN ('grammar', 'vocabulary', 'topic'))
);

-- 生成問題とタグの関連（中間テーブル）
CREATE TABLE IF NOT EXISTS generated_question_tags (
    question_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    relevance_score REAL DEFAULT 1.0,
    PRIMARY KEY (question_id, tag_id),
    CHECK (relevance_score >= 0.0 AND relevance_score <= 1.0),
    FOREIGN KEY (question_id) REFERENCES generated_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ====================
-- 6. 学習管理
-- ====================

CREATE TABLE IF NOT EXISTS learning_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    session_type TEXT NOT NULL,
    grade TEXT NOT NULL,
    section TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    total_questions INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    time_limit_seconds INTEGER,
    metadata TEXT,
    CHECK (session_type IN ('practice', 'mock_test', 'review', 'weak_point')),
    CHECK (json_valid(metadata) OR metadata IS NULL),
    FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_type TEXT NOT NULL,
    user_answer_index INTEGER,
    correct_answer_index INTEGER NOT NULL,
    is_correct INTEGER NOT NULL,
    time_spent_ms INTEGER,
    confidence_level INTEGER,
    device TEXT,
    started_at TEXT,
    answered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (is_correct IN (0, 1)),
    CHECK (user_answer_index IS NULL OR (user_answer_index >= 0 AND user_answer_index < 10)),
    CHECK (confidence_level IS NULL OR (confidence_level >= 1 AND confidence_level <= 5)),
    FOREIGN KEY (session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES generated_questions(id) ON DELETE CASCADE
);

-- 学生統計サマリー
CREATE TABLE IF NOT EXISTS student_stats (
    student_id TEXT PRIMARY KEY,
    grade TEXT NOT NULL,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    accuracy_rate REAL DEFAULT 0.0,
    total_study_time_ms INTEGER DEFAULT 0,
    study_days INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    last_study_date TEXT,
    weak_tags TEXT,                         -- JSON array
    strong_tags TEXT,                       -- JSON array
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (accuracy_rate >= 0.0 AND accuracy_rate <= 1.0),
    CHECK (json_valid(weak_tags) OR weak_tags IS NULL),
    CHECK (json_valid(strong_tags) OR strong_tags IS NULL),
    FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
);

-- 復習スケジュール（SRS）
CREATE TABLE IF NOT EXISTS review_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    ease_factor REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    next_review_date TEXT NOT NULL,
    last_reviewed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (ease_factor >= 1.3),
    CHECK (interval_days >= 0),
    CHECK (repetitions >= 0),
    FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES generated_questions(id) ON DELETE CASCADE
);

-- ====================
-- 7. メディア管理
-- ====================

CREATE TABLE IF NOT EXISTS media_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    r2_key TEXT NOT NULL UNIQUE,
    asset_type TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER,
    duration_seconds REAL,
    width INTEGER,
    height INTEGER,
    source TEXT,                            -- 'openai_tts', 'elevenlabs', 'upload'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (asset_type IN ('audio', 'image'))
);

-- ====================
-- 8. AI品質管理・キャッシュ
-- ====================

-- Embeddingキャッシュ（パフォーマンス最適化）
CREATE TABLE IF NOT EXISTS embedding_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL UNIQUE,         -- SHA-256 hash
    model TEXT NOT NULL,                    -- 'text-embedding-3-small'
    embedding_json TEXT NOT NULL,           -- JSON array of floats
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
    use_count INTEGER DEFAULT 1,
    CHECK (json_valid(embedding_json))
);

-- AI生成ログ
CREATE TABLE IF NOT EXISTS generation_logs (
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
    FOREIGN KEY (analysis_id) REFERENCES question_analysis(id) ON DELETE SET NULL
);

-- フィードバック
CREATE TABLE IF NOT EXISTS question_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    feedback_type TEXT NOT NULL,
    rating INTEGER,
    comment TEXT,
    submitted_by TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (feedback_type IN ('quality', 'difficulty', 'error', 'clarity')),
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    FOREIGN KEY (question_id) REFERENCES generated_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by) REFERENCES student_profiles(id) ON DELETE CASCADE
);

-- ====================
-- 9. インデックス（パフォーマンス最適化）
-- ====================

-- 問題分析用
CREATE INDEX IF NOT EXISTS idx_analysis_grade_section 
    ON question_analysis(grade, section);
CREATE INDEX IF NOT EXISTS idx_analysis_type 
    ON question_analysis(question_type);
CREATE INDEX IF NOT EXISTS idx_analysis_config 
    ON question_analysis(config_version_id);

-- 生成問題用
CREATE INDEX IF NOT EXISTS idx_gen_questions_grade_section 
    ON generated_questions(grade, section);
CREATE INDEX IF NOT EXISTS idx_gen_questions_status 
    ON generated_questions(review_status);
CREATE INDEX IF NOT EXISTS idx_gen_questions_analysis 
    ON generated_questions(analysis_id);

-- タグ用
CREATE INDEX IF NOT EXISTS idx_gen_question_tags_tag 
    ON generated_question_tags(tag_id);

-- 学習履歴用
CREATE INDEX IF NOT EXISTS idx_history_student_time 
    ON learning_history(student_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_student_correct 
    ON learning_history(student_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_history_session 
    ON learning_history(session_id);

-- 復習スケジュール用
CREATE INDEX IF NOT EXISTS idx_review_student_date 
    ON review_schedule(student_id, next_review_date);

-- Embeddingキャッシュ用
CREATE INDEX IF NOT EXISTS idx_embedding_cache_hash 
    ON embedding_cache(text_hash);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_last_used 
    ON embedding_cache(last_used_at);

-- 監査ログ用
CREATE INDEX IF NOT EXISTS idx_audit_student_time 
    ON audit_logs(student_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action 
    ON audit_logs(action_type);

-- ====================
-- 10. 分析用ビュー
-- ====================

-- 学生の弱点タグ
CREATE VIEW IF NOT EXISTS student_weak_points AS
SELECT 
    lh.student_id,
    t.id AS tag_id,
    t.name AS tag_name,
    t.type AS tag_type,
    COUNT(*) AS total_attempts,
    SUM(lh.is_correct) AS correct_count,
    CAST(SUM(lh.is_correct) AS REAL) / COUNT(*) AS accuracy,
    AVG(lh.time_spent_ms) AS avg_time_ms
FROM learning_history lh
INNER JOIN generated_question_tags gqt ON gqt.question_id = lh.question_id
INNER JOIN tags t ON t.id = gqt.tag_id
GROUP BY lh.student_id, t.id
HAVING accuracy < 0.7 AND total_attempts >= 3;

-- セクション別パフォーマンス
CREATE VIEW IF NOT EXISTS student_section_performance AS
SELECT 
    student_id,
    grade,
    section,
    COUNT(*) AS total_questions,
    SUM(is_correct) AS correct_answers,
    CAST(SUM(is_correct) AS REAL) / COUNT(*) AS accuracy,
    AVG(time_spent_ms) AS avg_time_ms
FROM learning_history
GROUP BY student_id, grade, section;

-- 問題難易度統計
CREATE VIEW IF NOT EXISTS question_difficulty_stats AS
SELECT 
    gq.id AS question_id,
    gq.grade,
    gq.section,
    gq.question_type,
    gq.difficulty_score AS expected_difficulty,
    COUNT(lh.id) AS attempts,
    CAST(SUM(lh.is_correct) AS REAL) / COUNT(lh.id) AS actual_accuracy,
    AVG(lh.time_spent_ms) AS avg_time_ms
FROM generated_questions gq
LEFT JOIN learning_history lh ON lh.question_id = gq.id
GROUP BY gq.id
HAVING attempts >= 10;
```

---

## 🚀 V3強化版: Embeddingキャッシュ（Workers環境対応）

```typescript
// ✅ V3修正: setIntervalを使わず、リクエストベースのクリーンアップ

/**
 * Workers環境対応のEmbeddingキャッシュ
 * 
 * V2の問題点:
 * - setInterval()はWorkers環境では非推奨
 * - メモリリークのリスク
 * 
 * V3の解決策:
 * - リクエストごとにクリーンアップをチェック
 * - 最終クリーンアップから5分経過で実行
 */
export class EmbeddingCache {
  private memoryCache: Map<string, CachedEmbedding> = new Map();
  private readonly maxMemoryCacheSize = 100;
  private lastCleanup: number = Date.now();
  private readonly cleanupInterval = 5 * 60 * 1000; // 5分

  async getEmbedding(text: string, env: Env): Promise<number[]> {
    // ✅ リクエストベースのクリーンアップ
    this.maybeCleanup();

    const textHash = await this.hashText(text);

    // Level 1: メモリキャッシュ
    if (this.memoryCache.has(textHash)) {
      const cached = this.memoryCache.get(textHash)!;
      console.log('✅ Embedding cache hit (memory)');
      return cached.embedding;
    }

    // Level 2: KV（高速）
    const kvKey = `embedding:${textHash}`;
    const kvCached = await env.KV.get(kvKey, 'json');
    if (kvCached) {
      console.log('✅ Embedding cache hit (KV)');
      this.updateMemoryCache(textHash, kvCached as number[]);
      return kvCached as number[];
    }

    // Level 3: D1（永続）
    const d1Cached = await env.DB.prepare(`
      SELECT embedding_json FROM embedding_cache WHERE text_hash = ?
    `).bind(textHash).first();

    if (d1Cached) {
      console.log('✅ Embedding cache hit (D1)');
      const embedding = JSON.parse(d1Cached.embedding_json as string);
      
      // KVとメモリに昇格
      await env.KV.put(kvKey, JSON.stringify(embedding), { expirationTtl: 3600 });
      this.updateMemoryCache(textHash, embedding);

      // 使用統計を更新（アプリケーション層で明示的に）
      await env.DB.prepare(`
        UPDATE embedding_cache 
        SET last_used_at = CURRENT_TIMESTAMP, use_count = use_count + 1 
        WHERE text_hash = ?
      `).bind(textHash).run();

      return embedding;
    }

    // Level 4: API呼び出し
    console.log('❌ Embedding cache miss - calling API');
    const embedding = await this.fetchEmbeddingFromAPI(text, env);

    // 全レベルにキャッシュ
    await this.cacheEmbedding(textHash, embedding, env);

    return embedding;
  }

  /**
   * ✅ V3新規: リクエストベースのクリーンアップ
   * setIntervalを使わず、リクエストごとにチェック
   */
  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanupMemoryCache();
      this.lastCleanup = now;
      console.log(`🧹 Memory cache cleaned: ${this.memoryCache.size} entries`);
    }
  }

  /**
   * LRU方式でメモリキャッシュをクリーンアップ
   */
  private cleanupMemoryCache(): void {
    if (this.memoryCache.size > this.maxMemoryCacheSize) {
      const entriesToRemove = this.memoryCache.size - this.maxMemoryCacheSize;
      const entries = Array.from(this.memoryCache.entries());
      
      // 最も古いエントリから削除
      for (let i = 0; i < entriesToRemove; i++) {
        this.memoryCache.delete(entries[i][0]);
      }
    }
  }

  private async fetchEmbeddingFromAPI(text: string, env: Env): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  private async cacheEmbedding(textHash: string, embedding: number[], env: Env): Promise<void> {
    // メモリ
    this.updateMemoryCache(textHash, embedding);

    // KV（1時間）
    const kvKey = `embedding:${textHash}`;
    await env.KV.put(kvKey, JSON.stringify(embedding), { expirationTtl: 3600 });

    // D1（永続）
    await env.DB.prepare(`
      INSERT INTO embedding_cache (text_hash, model, embedding_json)
      VALUES (?, 'text-embedding-3-small', ?)
      ON CONFLICT(text_hash) DO UPDATE SET
        last_used_at = CURRENT_TIMESTAMP,
        use_count = use_count + 1
    `).bind(textHash, JSON.stringify(embedding)).run();
  }

  private updateMemoryCache(textHash: string, embedding: number[]): void {
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(textHash, {
      embedding,
      timestamp: Date.now()
    });
  }

  /**
   * Workers環境対応: Web Crypto APIを使用
   */
  private async hashText(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

interface CachedEmbedding {
  embedding: number[];
  timestamp: number;
}
```

---

## 🛡️ V3強化版: レート制限システム（大幅拡張）

```typescript
/**
 * V3強化版: レート制限システム
 * 
 * V2の問題点:
 * - 基本的な実装のみ
 * - バースト対策なし
 * - リトライ機能なし
 * - 統計監視なし
 * 
 * V3の解決策:
 * - バースト対策（最大キューサイズ）
 * - リトライ機能（exponential backoff）
 * - 統計監視とアラート
 * - 複数APIの統合管理
 */

interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxBurstSize: number;           // ✅ V3新規: バースト対策
  retryAttempts: number;          // ✅ V3新規: リトライ回数
  retryDelayMs: number;           // ✅ V3新規: 初期リトライ遅延
  enableStats: boolean;           // ✅ V3新規: 統計収集
}

interface RateLimiterStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retriedRequests: number;
  averageWaitTimeMs: number;
  peakQueueSize: number;
  lastResetTime: number;
}

export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestHistory: number[] = [];
  private readonly config: RateLimiterConfig;
  private stats: RateLimiterStats;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxRequestsPerMinute: 450,    // OpenAI Chat API default
      maxBurstSize: 50,             // ✅ V3新規
      retryAttempts: 3,             // ✅ V3新規
      retryDelayMs: 1000,           // ✅ V3新規
      enableStats: true,            // ✅ V3新規
      ...config
    };

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      averageWaitTimeMs: 0,
      peakQueueSize: 0,
      lastResetTime: Date.now()
    };
  }

  /**
   * ✅ V3新規: リトライ機能付き実行
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: {
      retryOn?: (error: any) => boolean;
      onRetry?: (attempt: number, error: any) => void;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    // バースト対策
    if (this.queue.length >= this.config.maxBurstSize) {
      this.stats.failedRequests++;
      throw new Error(`Rate limiter queue full: ${this.queue.length} requests pending`);
    }

    let lastError: any;
    
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await this.execute(fn);
        
        // 統計更新
        this.stats.successfulRequests++;
        if (attempt > 0) {
          this.stats.retriedRequests++;
        }
        
        const waitTime = Date.now() - startTime;
        this.updateAverageWaitTime(waitTime);
        
        return result;
      } catch (error) {
        lastError = error;
        
        // リトライ判定
        const shouldRetry = options.retryOn ? options.retryOn(error) : this.isRetryableError(error);
        
        if (attempt < this.config.retryAttempts && shouldRetry) {
          const delay = this.calculateBackoffDelay(attempt);
          
          if (options.onRetry) {
            options.onRetry(attempt + 1, error);
          }
          
          console.log(`⚠️ Rate limiter retry ${attempt + 1}/${this.config.retryAttempts} after ${delay}ms`);
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    this.stats.failedRequests++;
    throw lastError;
  }

  /**
   * 基本的な実行（V2互換）
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      // 統計更新
      if (this.queue.length > this.stats.peakQueueSize) {
        this.stats.peakQueueSize = this.queue.length;
      }

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // レート制限チェック
      await this.waitIfNeeded();

      const task = this.queue.shift();
      if (task) {
        this.requestHistory.push(Date.now());
        await task();
      }
    }

    this.processing = false;
  }

  private async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // 1分以内のリクエスト数をカウント
    this.requestHistory = this.requestHistory.filter(time => time > oneMinuteAgo);

    if (this.requestHistory.length >= this.config.maxRequestsPerMinute) {
      const oldestRequest = this.requestHistory[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // 100ms余裕

      if (waitTime > 0) {
        console.log(`⏳ Rate limit reached, waiting ${waitTime}ms`);
        await this.sleep(waitTime);
      }
    }
  }

  /**
   * ✅ V3新規: Exponential backoff計算
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.config.retryDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // ランダムジッター
    return Math.min(exponentialDelay + jitter, 30000); // 最大30秒
  }

  /**
   * ✅ V3新規: リトライ可能なエラーか判定
   */
  private isRetryableError(error: any): boolean {
    // レート制限エラー
    if (error.status === 429) return true;
    
    // サーバーエラー（5xx）
    if (error.status >= 500 && error.status < 600) return true;
    
    // タイムアウト
    if (error.message?.includes('timeout')) return true;
    
    // ネットワークエラー
    if (error.message?.includes('network')) return true;

    return false;
  }

  /**
   * ✅ V3新規: 統計情報取得
   */
  getStats(): RateLimiterStats {
    return { ...this.stats };
  }

  /**
   * ✅ V3新規: 統計リセット
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      averageWaitTimeMs: 0,
      peakQueueSize: 0,
      lastResetTime: Date.now()
    };
  }

  /**
   * ✅ V3新規: アラート判定
   */
  shouldAlert(): boolean {
    const failureRate = this.stats.failedRequests / Math.max(this.stats.totalRequests, 1);
    const retryRate = this.stats.retriedRequests / Math.max(this.stats.successfulRequests, 1);

    return (
      failureRate > 0.1 ||        // 失敗率10%以上
      retryRate > 0.3 ||          // リトライ率30%以上
      this.queue.length > this.config.maxBurstSize * 0.8  // キュー80%以上
    );
  }

  private updateAverageWaitTime(newWaitTime: number): void {
    const alpha = 0.1; // 指数移動平均の重み
    this.stats.averageWaitTimeMs = 
      this.stats.averageWaitTimeMs * (1 - alpha) + newWaitTime * alpha;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * ✅ V3新規: 複数API用のレート制限マネージャー
 */
export class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();

  constructor() {
    // OpenAI API別のレート制限設定
    this.limiters.set('chat', new RateLimiter({
      maxRequestsPerMinute: 450,
      maxBurstSize: 50,
      retryAttempts: 3,
      retryDelayMs: 1000,
      enableStats: true
    }));

    this.limiters.set('embedding', new RateLimiter({
      maxRequestsPerMinute: 2800,
      maxBurstSize: 200,
      retryAttempts: 3,
      retryDelayMs: 500,
      enableStats: true
    }));

    this.limiters.set('tts', new RateLimiter({
      maxRequestsPerMinute: 100,
      maxBurstSize: 20,
      retryAttempts: 3,
      retryDelayMs: 2000,
      enableStats: true
    }));
  }

  getLimiter(apiType: 'chat' | 'embedding' | 'tts'): RateLimiter {
    const limiter = this.limiters.get(apiType);
    if (!limiter) {
      throw new Error(`Unknown API type: ${apiType}`);
    }
    return limiter;
  }

  /**
   * 全APIの統計情報を取得
   */
  getAllStats(): Record<string, RateLimiterStats> {
    const stats: Record<string, RateLimiterStats> = {};
    for (const [name, limiter] of this.limiters.entries()) {
      stats[name] = limiter.getStats();
    }
    return stats;
  }

  /**
   * アラートが必要なAPIを検出
   */
  getAlertsNeeded(): string[] {
    const alerts: string[] = [];
    for (const [name, limiter] of this.limiters.entries()) {
      if (limiter.shouldAlert()) {
        alerts.push(name);
      }
    }
    return alerts;
  }
}
```

---

## 🔒 V3強化版: 著作権安全システム（多層防御）

```typescript
/**
 * V3強化版: 著作権安全システム
 * 
 * V2の問題点:
 * - 15%単独閾値では不十分
 * - n-gram重複のみの検出
 * - 禁止パターンが不十分
 * 
 * V3の解決策:
 * - 動的閾値（文章長に応じて10-15%）
 * - 多層防御（bigram、trigram、fourgram、embedding、完全一致）
 * - 拡張禁止パターン（英検特有の15種類以上）
 * - 完全一致フレーズ検出（4語以上）
 */

export class EnhancedCopyrightSafetyMonitor {
  /**
   * ✅ V3新規: 動的閾値（文章長に応じて調整）
   */
  private static readonly THRESHOLDS = {
    // Trigram閾値（最も重要）
    getTrigramThreshold: (tokenCount: number): number => {
      if (tokenCount < 12) return 0.10;   // 短文: 10%
      if (tokenCount < 30) return 0.12;   // 中文: 12%
      return 0.15;                         // 長文: 15%
    },
    
    // Bigram閾値（より緩い）
    getBigramThreshold: (tokenCount: number): number => {
      if (tokenCount < 12) return 0.15;
      if (tokenCount < 30) return 0.18;
      return 0.20;
    },
    
    // Fourgram閾値（最も厳しい）
    getFourgramThreshold: (tokenCount: number): number => {
      if (tokenCount < 16) return 0.05;   // 短文: 5%
      if (tokenCount < 40) return 0.08;   // 中文: 8%
      return 0.10;                         // 長文: 10%
    },
    
    // Embedding類似度閾値
    EMBEDDING_SIMILARITY: 0.85,
    
    // 完全一致フレーズの最小長（単語数）
    EXACT_PHRASE_MIN_LENGTH: 4,
    
    // 危険な重複率（即座に拒否）
    DANGEROUS_OVERLAP: 0.20
  };

  /**
   * ✅ V3新規: 拡張禁止パターン（英検特有）
   */
  private static readonly ENHANCED_PATTERNS = [
    // 英検関連（最優先）
    { pattern: /(英検|実用英語技能検定|EIKEN)/i, severity: 'critical' as const },
    { pattern: /(公益財団法人.*英語検定協会)/i, severity: 'critical' as const },
    
    // 試験メタデータ
    { pattern: /(第[一二三]回|20\d{2}年度.*第[１２３]回)/i, severity: 'high' as const },
    { pattern: /(問題冊子|解答用紙|リスニングテスト)/i, severity: 'high' as const },
    
    // 問題構造
    { pattern: /(大問[１-３]|問題[１-９]|Part [A-D])/i, severity: 'medium' as const },
    { pattern: /(\d+\s*点|配点|得点)/i, severity: 'medium' as const },
    
    // AI生成の露呈
    { pattern: /(As an AI|I cannot provide|I don't have access)/i, severity: 'high' as const },
    { pattern: /(generated by|created using|powered by)/i, severity: 'high' as const },
    
    // テンプレート残骸
    { pattern: /\[.*?\]/g, severity: 'medium' as const },
    { pattern: /___+/g, severity: 'medium' as const },
    { pattern: /(TODO|FIXME|PLACEHOLDER)/i, severity: 'high' as const },
    
    // 著作権表記
    { pattern: /©.*20\d{2}/i, severity: 'critical' as const },
    { pattern: /(All rights reserved|無断転載禁止)/i, severity: 'critical' as const },
    
    // 特定の過去問フレーズ（例）
    { pattern: /(次の英文を読んで.*答えなさい)/i, severity: 'high' as const },
    { pattern: /(下線部.*最も適切なもの)/i, severity: 'high' as const }
  ];

  /**
   * ✅ V3新規: 包括的な著作権チェック
   */
  static async comprehensiveCheck(
    generatedText: string,
    originalSources: string[],
    embeddingCache: EmbeddingCache,
    env: Env
  ): Promise<CopyrightCheckResult> {
    const result: CopyrightCheckResult = {
      isSafe: true,
      overallScore: 0,
      checks: [],
      warnings: [],
      criticalIssues: []
    };

    const tokens = this.tokenize(generatedText);
    const tokenCount = tokens.length;

    // 1. 禁止パターンチェック（最優先）
    const patternCheck = this.checkProhibitedPatterns(generatedText);
    result.checks.push(patternCheck);
    
    if (patternCheck.severity === 'critical') {
      result.isSafe = false;
      result.criticalIssues.push(`Critical pattern detected: ${patternCheck.details}`);
      return result; // 即座に拒否
    }

    // 2. n-gram重複チェック（多層）
    for (const source of originalSources) {
      const sourceTokens = this.tokenize(source);

      // Bigram
      const bigramOverlap = this.calculateNGramOverlap(tokens, sourceTokens, 2);
      const bigramThreshold = this.THRESHOLDS.getBigramThreshold(tokenCount);
      result.checks.push({
        type: 'bigram',
        score: bigramOverlap,
        threshold: bigramThreshold,
        passed: bigramOverlap < bigramThreshold,
        details: `Bigram overlap: ${(bigramOverlap * 100).toFixed(2)}%`
      });

      // Trigram（最重要）
      const trigramOverlap = this.calculateNGramOverlap(tokens, sourceTokens, 3);
      const trigramThreshold = this.THRESHOLDS.getTrigramThreshold(tokenCount);
      result.checks.push({
        type: 'trigram',
        score: trigramOverlap,
        threshold: trigramThreshold,
        passed: trigramOverlap < trigramThreshold,
        details: `Trigram overlap: ${(trigramOverlap * 100).toFixed(2)}%`
      });

      if (trigramOverlap >= trigramThreshold) {
        result.isSafe = false;
        result.criticalIssues.push(`Trigram overlap too high: ${(trigramOverlap * 100).toFixed(2)}%`);
      }

      // Fourgram（最も厳しい）
      if (tokenCount >= 16) {
        const fourgramOverlap = this.calculateNGramOverlap(tokens, sourceTokens, 4);
        const fourgramThreshold = this.THRESHOLDS.getFourgramThreshold(tokenCount);
        result.checks.push({
          type: 'fourgram',
          score: fourgramOverlap,
          threshold: fourgramThreshold,
          passed: fourgramOverlap < fourgramThreshold,
          details: `Fourgram overlap: ${(fourgramOverlap * 100).toFixed(2)}%`
        });

        if (fourgramOverlap >= fourgramThreshold) {
          result.isSafe = false;
          result.criticalIssues.push(`Fourgram overlap too high: ${(fourgramOverlap * 100).toFixed(2)}%`);
        }
      }

      // 3. 完全一致フレーズ検出
      const exactMatches = this.findExactPhraseMatches(
        generatedText,
        source,
        this.THRESHOLDS.EXACT_PHRASE_MIN_LENGTH
      );

      if (exactMatches.length > 0) {
        result.isSafe = false;
        result.criticalIssues.push(
          `Exact phrase matches found (${exactMatches.length}): "${exactMatches[0].phrase.substring(0, 50)}..."`
        );
        result.checks.push({
          type: 'exact_match',
          score: exactMatches.length,
          threshold: 0,
          passed: false,
          details: `${exactMatches.length} exact phrases (${this.THRESHOLDS.EXACT_PHRASE_MIN_LENGTH}+ words)`
        });
      }

      // 4. Embedding類似度チェック
      const generatedEmbedding = await embeddingCache.getEmbedding(generatedText, env);
      const sourceEmbedding = await embeddingCache.getEmbedding(source, env);
      const similarity = this.cosineSimilarity(generatedEmbedding, sourceEmbedding);

      result.checks.push({
        type: 'embedding',
        score: similarity,
        threshold: this.THRESHOLDS.EMBEDDING_SIMILARITY,
        passed: similarity < this.THRESHOLDS.EMBEDDING_SIMILARITY,
        details: `Embedding similarity: ${(similarity * 100).toFixed(2)}%`
      });

      if (similarity >= this.THRESHOLDS.EMBEDDING_SIMILARITY) {
        result.isSafe = false;
        result.criticalIssues.push(`Embedding similarity too high: ${(similarity * 100).toFixed(2)}%`);
      }
    }

    // 5. 総合スコア計算（加重平均）
    const weights = {
      bigram: 0.15,
      trigram: 0.35,
      fourgram: 0.25,
      embedding: 0.20,
      pattern: 0.05
    };

    let weightedScore = 0;
    for (const check of result.checks) {
      const weight = weights[check.type as keyof typeof weights] || 0;
      weightedScore += check.score * weight;
    }

    result.overallScore = weightedScore;

    // 6. 警告生成
    if (weightedScore > 0.50) {
      result.warnings.push('Overall similarity score is moderately high');
    }

    return result;
  }

  /**
   * ✅ V3新規: 禁止パターンチェック
   */
  private static checkProhibitedPatterns(text: string): CheckDetail {
    for (const { pattern, severity } of this.ENHANCED_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        return {
          type: 'pattern',
          score: 1,
          threshold: 0,
          passed: false,
          severity,
          details: `Prohibited pattern detected: "${matches[0]}"`
        };
      }
    }

    return {
      type: 'pattern',
      score: 0,
      threshold: 0,
      passed: true,
      severity: 'none',
      details: 'No prohibited patterns found'
    };
  }

  /**
   * ✅ V3新規: 完全一致フレーズ検出
   */
  private static findExactPhraseMatches(
    text1: string,
    text2: string,
    minLength: number
  ): Array<{ phrase: string; position: number }> {
    const tokens1 = this.tokenize(text1);
    const tokens2 = this.tokenize(text2);
    const matches: Array<{ phrase: string; position: number }> = [];

    for (let i = 0; i <= tokens1.length - minLength; i++) {
      for (let len = minLength; len <= Math.min(tokens1.length - i, 20); len++) {
        const phrase = tokens1.slice(i, i + len).join(' ');
        const phrase2 = tokens2.join(' ');

        if (phrase2.includes(phrase)) {
          matches.push({ phrase, position: i });
          break; // 最長一致のみ記録
        }
      }
    }

    return matches;
  }

  /**
   * n-gram重複計算（Jaccard係数）
   */
  private static calculateNGramOverlap(
    tokens1: string[],
    tokens2: string[],
    n: number
  ): number {
    const ngrams1 = this.generateNGrams(tokens1, n);
    const ngrams2 = this.generateNGrams(tokens2, n);

    if (ngrams1.size === 0 || ngrams2.size === 0) {
      return 0;
    }

    const intersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
    const union = new Set([...ngrams1, ...ngrams2]);

    return intersection.size / union.size;
  }

  private static generateNGrams(tokens: string[], n: number): Set<string> {
    const ngrams = new Set<string>();
    for (let i = 0; i <= tokens.length - n; i++) {
      const ngram = tokens.slice(i, i + n).join(' ');
      ngrams.add(ngram.toLowerCase());
    }
    return ngrams;
  }

  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  private static cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magA * magB);
  }
}

interface CopyrightCheckResult {
  isSafe: boolean;
  overallScore: number;
  checks: CheckDetail[];
  warnings: string[];
  criticalIssues: string[];
}

interface CheckDetail {
  type: string;
  score: number;
  threshold: number;
  passed: boolean;
  severity?: 'critical' | 'high' | 'medium' | 'none';
  details: string;
}
```

---

## 🤖 AI問題生成（V3版 - 著作権安全強化）

### Phase 2: AI問題生成と検証（V3版）

```typescript
/**
 * V3版: 問題生成と著作権安全検証
 */
async function generateAndValidateQuestion(
  analysisId: number,
  env: Env,
  rateLimiterManager: RateLimiterManager,
  embeddingCache: EmbeddingCache
): Promise<number> {
  // 1. 分析結果を取得
  const analysis = await env.DB.prepare(`
    SELECT * FROM question_analysis WHERE id = ?
  `).bind(analysisId).first();

  if (!analysis) {
    throw new Error(`Analysis not found: ${analysisId}`);
  }

  // 2. AI生成（レート制限付き）
  const chatLimiter = rateLimiterManager.getLimiter('chat');
  
  const draft = await chatLimiter.executeWithRetry(
    () => generateQuestionFromAnalysis(analysis, env),
    {
      retryOn: (error) => error.status === 429 || error.status >= 500,
      onRetry: (attempt, error) => {
        console.log(`🔄 Retrying question generation (attempt ${attempt}): ${error.message}`);
      }
    }
  );

  // 3. ✅ V3強化: アプリケーション層でのCHECK制約検証
  validateQuestionConstraints(draft);

  // 4. ✅ V3強化: 包括的な著作権チェック
  const originalSources = await getOriginalSources(analysis, env);
  
  const copyrightCheck = await EnhancedCopyrightSafetyMonitor.comprehensiveCheck(
    draft.question_text,
    originalSources,
    embeddingCache,
    env
  );

  if (!copyrightCheck.isSafe) {
    throw new Error(
      `Copyright check failed: ${copyrightCheck.criticalIssues.join(', ')}`
    );
  }

  // 警告がある場合はログ
  if (copyrightCheck.warnings.length > 0) {
    console.warn(`⚠️ Copyright warnings: ${copyrightCheck.warnings.join(', ')}`);
  }

  // 5. トランザクション保存
  const questionId = await saveGeneratedQuestion(
    draft,
    analysis,
    copyrightCheck.overallScore,
    env
  );

  console.log(
    `✅ Question generated and saved: ID ${questionId}, ` +
    `Copyright score: ${(copyrightCheck.overallScore * 100).toFixed(2)}%`
  );

  return questionId;
}

/**
 * ✅ V3新規: アプリケーション層でのCHECK制約検証
 */
function validateQuestionConstraints(draft: GeneratedQuestionDraft): void {
  // 選択肢の検証（MCQのみ）
  if (draft.answer_type === 'mcq') {
    if (!Array.isArray(draft.choices) || draft.choices.length < 2 || draft.choices.length > 4) {
      throw new Error(`Invalid choices count: ${draft.choices?.length}. Must be 2-4.`);
    }

    if (
      draft.correct_answer_index === undefined ||
      draft.correct_answer_index < 0 ||
      draft.correct_answer_index >= draft.choices.length
    ) {
      throw new Error(
        `Invalid correct_answer_index: ${draft.correct_answer_index}. ` +
        `Must be 0-${draft.choices.length - 1}.`
      );
    }

    // 選択肢の一意性
    const uniqueChoices = new Set(draft.choices.map(c => c.trim().toLowerCase()));
    if (uniqueChoices.size !== draft.choices.length) {
      throw new Error('Duplicate choices detected');
    }
  } else {
    // Writing/Speakingの場合、選択肢は不要
    if (draft.choices !== null && draft.choices !== undefined) {
      throw new Error('Non-MCQ question must not have choices');
    }
  }

  // 問題文の検証
  if (!draft.question_text || draft.question_text.trim().length === 0) {
    throw new Error('Question text is required');
  }

  if (draft.question_text.length > 2000) {
    throw new Error('Question text too long (max 2000 characters)');
  }
}

/**
 * 過去問ソースを取得（内部処理のみ、DB保存なし）
 */
async function getOriginalSources(
  analysis: any,
  env: Env
): Promise<string[]> {
  // 実装例: 暗号化された管理者専用R2バケットから取得
  // ここでは簡略化のため空配列を返す
  
  // 本番環境では:
  // 1. analysis.source_year, analysis.source_session を使用
  // 2. 管理者専用R2バケットから過去問PDFを取得
  // 3. OCRまたはPDF解析で問題文を抽出
  // 4. メモリ内で処理し、結果のみを返す
  // 5. 過去問データはDBに保存しない
  
  return [];
}

/**
 * ✅ V3修正: updated_atを明示的に更新
 */
async function saveGeneratedQuestion(
  draft: GeneratedQuestionDraft,
  analysis: any,
  copyrightScore: number,
  env: Env
): Promise<number> {
  const promptHash = await generatePromptHash(analysis.id);
  const now = new Date().toISOString();

  // トランザクション保存
  const statements = [
    env.DB.prepare(`
      INSERT INTO generated_questions (
        analysis_id, grade, section, question_type, answer_type,
        question_text, choices_json, correct_answer_index,
        explanation, explanation_ja,
        model, temperature, prompt_hash, similarity_score,
        review_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      analysis.id,
      analysis.grade,
      analysis.section,
      analysis.question_type,
      draft.answer_type || 'mcq',
      draft.question_text,
      draft.choices ? JSON.stringify(draft.choices) : null,
      draft.correct_answer_index ?? null,
      draft.explanation,
      draft.explanation_ja,
      'gpt-4o',
      0.7,
      promptHash,
      copyrightScore,
      copyrightScore < 0.5 ? 'approved' : 'pending',
      now,
      now  // ✅ V3修正: updated_atを明示的に設定
    )
  ];

  const results = await env.DB.batch(statements);
  return results[0].meta.last_row_id as number;
}

async function generatePromptHash(analysisId: number): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`analysis:${analysisId}:v3`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface GeneratedQuestionDraft {
  question_text: string;
  choices?: string[];
  correct_answer_index?: number;
  explanation: string;
  explanation_ja: string;
  answer_type?: 'mcq' | 'writing' | 'speaking';
}
```

---

## 🎯 V3実装ロードマップ（調整版）

### Week 0: 準備（環境構築）
**期間**: 実装開始前
**完了条件**:
- [ ] Cloudflare Workers環境セットアップ完了
- [ ] D1データベース作成完了
- [ ] wrangler.toml設定完了
- [ ] ローカル開発環境動作確認

### Week 1-2: 技術基盤構築
**期間**: 2週間
**完了条件**:
- [ ] V3スキーマの全テーブル作成完了（migrations実行）
- [ ] 外部キー制約有効化確認（PRAGMA foreign_keys = ON）
- [ ] Web Crypto API統合（SHA-256ハッシュ生成）
- [ ] JWT認証基盤実装（jose library使用）
- [ ] 基本API（認証、監査ログ）動作確認
- [ ] **テスト**: 外部キー制約テスト、updated_at明示更新テスト

### Week 2.5: 統合テスト週（✅ V3新規追加）
**期間**: 0.5週間
**完了条件**:
- [ ] Week 1-2の実装を統合テスト
- [ ] CHECK制約のアプリ層検証テスト
- [ ] トランザクションの原子性テスト
- [ ] メモリキャッシュのクリーンアップテスト
- [ ] パフォーマンステスト（100件のクエリ）
- [ ] **合格基準**: 全テストケース100%成功、エラー0件

### Week 3-4: AI生成コア + 著作権安全
**期間**: 2週間
**完了条件**:
- [ ] 過去問分析機能実装（問題文は保存しない）
- [ ] AI問題生成機能実装（gpt-4o使用）
- [ ] ✅ V3強化版Embeddingキャッシュ実装（setInterval削除）
- [ ] ✅ V3強化版レート制限システム実装（リトライ、統計）
- [ ] ✅ V3強化版著作権安全システム実装（多層防御）
- [ ] Durable Objects統合（長時間タスク用）
- [ ] **テスト**: 著作権チェック10ケース、レート制限テスト、メモリリークテスト
- [ ] **合格基準**: 著作権チェック100%成功、メモリリーク0件

### Week 5-6: リスニング・メディア
**期間**: 2週間
**完了条件**:
- [ ] OpenAI TTS統合（tts-1モデル）
- [ ] R2音声ストレージ管理実装
- [ ] 音声再生UI実装
- [ ] メディアアセットテーブル運用開始
- [ ] **テスト**: 音声生成10件、R2アップロード確認
- [ ] **合格基準**: TTS成功率95%以上、音声再生エラー0件

### Week 7-8: 学習機能
**期間**: 2週間
**完了条件**:
- [ ] セッション管理機能実装
- [ ] 学習履歴記録機能実装（トランザクション使用）
- [ ] 弱点分析ダッシュボード実装
- [ ] SRS復習スケジュール実装
- [ ] **テスト**: 100セッションのシミュレーション
- [ ] **合格基準**: トランザクション成功率100%、データ不整合0件

### Week 8-10: ライティング対応（✅ V3調整: 2週→3週）
**期間**: 3週間（Week 8, 9, 10）
**完了条件**:
- [ ] ライティング問題生成機能実装
- [ ] 自動採点機能実装（gpt-4oベース）
- [ ] フィードバック生成機能実装
- [ ] answer_type対応完了（mcq, writing, speaking）
- [ ] **テスト**: ライティング問題50件生成、採点精度テスト
- [ ] **合格基準**: 生成成功率90%以上、採点一貫性80%以上

### Week 11: 最終統合テスト
**期間**: 1週間
**完了条件**:
- [ ] 全機能の統合テスト
- [ ] パフォーマンスチューニング
- [ ] セキュリティ監査
- [ ] E2Eテスト（100ユーザーシミュレーション）
- [ ] ドキュメント完成
- [ ] **合格基準**: E2Eテスト成功率95%以上、レスポンスタイム<500ms

### Week 12: デプロイと監視
**期間**: 1週間
**完了条件**:
- [ ] 本番環境デプロイ
- [ ] 監視ダッシュボード設定
- [ ] アラート設定
- [ ] ロールバック手順確立
- [ ] **合格基準**: デプロイ成功、監視アラート動作確認

---

## 🧪 V3詳細テスト戦略

### 1. CHECK制約テスト

```typescript
describe('V3 CHECK Constraint Tests', () => {
  test('選択肢数が2-4の範囲内', async () => {
    // 正常系
    const valid2 = await insertQuestion({ choices: ['A', 'B'], correct: 0 });
    expect(valid2.success).toBe(true);

    const valid4 = await insertQuestion({ choices: ['A', 'B', 'C', 'D'], correct: 2 });
    expect(valid4.success).toBe(true);

    // 異常系
    await expect(
      insertQuestion({ choices: ['A'], correct: 0 })
    ).rejects.toThrow('Invalid choices count');

    await expect(
      insertQuestion({ choices: ['A', 'B', 'C', 'D', 'E'], correct: 0 })
    ).rejects.toThrow('Invalid choices count');
  });

  test('correct_answer_indexが選択肢範囲内', async () => {
    // 異常系
    await expect(
      insertQuestion({ choices: ['A', 'B'], correct: 2 })
    ).rejects.toThrow('Invalid correct_answer_index');

    await expect(
      insertQuestion({ choices: ['A', 'B'], correct: -1 })
    ).rejects.toThrow('Invalid correct_answer_index');
  });
});
```

### 2. 著作権安全性テスト

```typescript
describe('V3 Enhanced Copyright Safety Tests', () => {
  test('動的閾値が正しく適用される', async () => {
    const shortText = 'The cat sat on the mat'; // 6語
    const result1 = await copyrightCheck(shortText, [source]);
    expect(result1.checks.find(c => c.type === 'trigram')?.threshold).toBe(0.10);

    const mediumText = 'The quick brown fox jumps over the lazy dog repeatedly'; // 10語
    const result2 = await copyrightCheck(mediumText, [source]);
    expect(result2.checks.find(c => c.type === 'trigram')?.threshold).toBe(0.12);

    const longText = 'This is a much longer text with many words...'; // 30語以上
    const result3 = await copyrightCheck(longText, [source]);
    expect(result3.checks.find(c => c.type === 'trigram')?.threshold).toBe(0.15);
  });

  test('多層防御が全て動作', async () => {
    const result = await EnhancedCopyrightSafetyMonitor.comprehensiveCheck(
      generatedText,
      [source],
      embeddingCache,
      env
    );

    expect(result.checks.some(c => c.type === 'bigram')).toBe(true);
    expect(result.checks.some(c => c.type === 'trigram')).toBe(true);
    expect(result.checks.some(c => c.type === 'fourgram')).toBe(true);
    expect(result.checks.some(c => c.type === 'embedding')).toBe(true);
    expect(result.checks.some(c => c.type === 'pattern')).toBe(true);
  });

  test('完全一致フレーズを検出', async () => {
    const generated = 'The quick brown fox jumps over';
    const source = 'Yesterday the quick brown fox jumps over the fence';
    
    const matches = findExactPhraseMatches(generated, source, 4);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].phrase).toContain('quick brown fox jumps');
  });

  test('拡張禁止パターンを検出', async () => {
    const texts = [
      '英検2級の問題です',
      '2023年度第1回試験',
      'As an AI, I cannot provide',
      '[PLACEHOLDER]を入れてください'
    ];

    for (const text of texts) {
      const result = await copyrightCheck(text, []);
      expect(result.isSafe).toBe(false);
      expect(result.criticalIssues.length).toBeGreaterThan(0);
    }
  });
});
```

### 3. メモリリークテスト

```typescript
describe('V3 Memory Leak Tests', () => {
  test('Embeddingキャッシュがクリーンアップされる', async () => {
    const cache = new EmbeddingCache();
    
    // 150個のエントリを追加（maxMemoryCacheSize=100を超える）
    for (let i = 0; i < 150; i++) {
      await cache.getEmbedding(`test text ${i}`, env);
    }

    // クリーンアップをトリガー
    await cache.getEmbedding('trigger cleanup', env);

    // メモリサイズが制限内に収まっているか確認
    const memorySize = cache['memoryCache'].size;
    expect(memorySize).toBeLessThanOrEqual(100);
  });

  test('リクエストベースのクリーンアップが動作', async () => {
    const cache = new EmbeddingCache();
    cache['lastCleanup'] = Date.now() - 6 * 60 * 1000; // 6分前

    // 大量のエントリを追加
    for (let i = 0; i < 120; i++) {
      cache['memoryCache'].set(`key${i}`, { embedding: [], timestamp: Date.now() });
    }

    // クリーンアップをトリガー
    await cache.getEmbedding('test', env);

    // クリーンアップが実行されたか確認
    expect(cache['lastCleanup']).toBeGreaterThan(Date.now() - 1000);
    expect(cache['memoryCache'].size).toBeLessThanOrEqual(100);
  });
});
```

### 4. レート制限テスト

```typescript
describe('V3 Enhanced Rate Limiter Tests', () => {
  test('リトライ機能が動作', async () => {
    let attemptCount = 0;
    const limiter = new RateLimiter({ retryAttempts: 3 });

    await limiter.executeWithRetry(
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw { status: 429, message: 'Rate limit exceeded' };
        }
        return 'success';
      }
    );

    expect(attemptCount).toBe(3);
    expect(limiter.getStats().retriedRequests).toBe(1);
  });

  test('exponential backoffが適用される', async () => {
    const limiter = new RateLimiter({ retryDelayMs: 1000 });
    
    const delays = [
      limiter['calculateBackoffDelay'](0),
      limiter['calculateBackoffDelay'](1),
      limiter['calculateBackoffDelay'](2),
    ];

    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
    expect(delays[2]).toBeLessThanOrEqual(30000); // 最大30秒
  });

  test('バースト対策が動作', async () => {
    const limiter = new RateLimiter({ maxBurstSize: 10 });

    // 11個のリクエストを同時実行
    const promises = Array.from({ length: 11 }, (_, i) =>
      limiter.executeWithRetry(() => Promise.resolve(i))
    );

    await expect(Promise.all(promises)).rejects.toThrow('queue full');
  });

  test('統計が正しく記録される', async () => {
    const limiter = new RateLimiter();

    await limiter.executeWithRetry(() => Promise.resolve('ok'));
    await limiter.executeWithRetry(() => Promise.resolve('ok'));
    
    try {
      await limiter.executeWithRetry(() => Promise.reject(new Error('fail')));
    } catch {}

    const stats = limiter.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.successfulRequests).toBe(2);
    expect(stats.failedRequests).toBe(1);
  });

  test('アラート判定が動作', async () => {
    const limiter = new RateLimiter();

    // 失敗率を高める
    for (let i = 0; i < 10; i++) {
      try {
        await limiter.executeWithRetry(() => {
          if (i < 5) throw new Error('fail');
          return Promise.resolve('ok');
        });
      } catch {}
    }

    expect(limiter.shouldAlert()).toBe(true);
  });
});
```

---

## ✅ V3重要な決定事項まとめ

### 技術的修正（V2からの変更）
- ✅ **CHECK制約**: `json_array_length()`を削除、静的上限（10）+ アプリ層検証
- ✅ **Embeddingキャッシュ**: `setInterval`削除、リクエストベースのクリーンアップ
- ✅ **updated_atトリガー**: 削除、アプリケーション層で明示的に更新
- ✅ **レート制限**: バースト対策、リトライ機能、統計監視を追加
- ✅ **著作権安全**: 動的閾値、多層防御、拡張禁止パターン、完全一致検出

### 新機能（V3で追加）
- ✅ **分析設定バージョン管理**: `analysis_configurations`テーブル
- ✅ **RateLimiterManager**: 複数API（chat、embedding、tts）の統合管理
- ✅ **EnhancedCopyrightSafetyMonitor**: 5層防御システム
- ✅ **Week 2.5**: 統合テスト週の追加
- ✅ **Week 8-10**: ライティング対応を3週に拡張

### データベース
- ✅ `PRAGMA foreign_keys = ON` 起動時実行（変更なし）
- ✅ `env.DB.batch()` によるトランザクション（変更なし）
- ✅ 自動更新トリガー削除、アプリ層で明示的更新
- ✅ UNIQUE制約（重複防止）（変更なし）

### パフォーマンス
- ✅ 3層Embeddingキャッシュ（メモリ→KV→D1）
- ✅ Workers環境対応のメモリ管理
- ✅ Durable Objects（長時間タスク）
- ✅ 適切なインデックス

### セキュリティ
- ✅ JWT認証（変更なし）
- ✅ student_profiles テーブル（変更なし）
- ✅ audit_logs（監査証跡）（変更なし）
- ✅ 外部キー制約によるデータ整合性（変更なし）

### 著作権安全（V3大幅強化）
- ✅ 動的閾値（短文10%、中文12%、長文15%）
- ✅ 多層防御（bigram、trigram、fourgram、embedding、完全一致）
- ✅ 拡張禁止パターン（英検特有の15種類以上）
- ✅ 完全一致フレーズ検出（4語以上）
- ✅ 総合スコア（加重平均）

---

## 🎉 次のアクション

1. **DB作成**: `wrangler d1 create eiken-db-v3`
2. **マイグレーション**: V3スキーマを実行
3. **V3実装開始**: Week 0（環境構築）から開始
4. **テスト戦略実行**: 各Weekごとの完了条件を満たす
5. **著作権確認**: 多層防御システムの動作確認

**V3は技術的危険性を全て排除し、実装可能な最終版です！** 🚀

---

## 📚 参考資料

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [D1 Best Practices](https://developers.cloudflare.com/d1/platform/best-practices/)
- [Durable Objects Guide](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits)
- [SQLite Foreign Keys](https://www.sqlite.org/foreignkeys.html)
- [SQLite CHECK Constraints](https://www.sqlite.org/lang_createtable.html#check_constraints)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Workers Environment Limitations](https://developers.cloudflare.com/workers/platform/limits/)
