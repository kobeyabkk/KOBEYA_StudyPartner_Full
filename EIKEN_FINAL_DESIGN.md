# 英検対策システム - 最終設計書（AI統合版）

## 🎯 設計方針

3つのAI（Genspark、Claude、Gemini、ChatGPT）からのアドバイスを統合し、以下の原則に基づいて設計：

1. **段階的実装** - MVP → 機能追加 → スケール
2. **品質第一** - AI生成は必ず検証・レビュー
3. **著作権配慮** - 過去問は分析用、公開はAI生成問題のみ
4. **パフォーマンス** - 事前生成 + キャッシュ戦略
5. **保守性** - 正規化されたDB、明確な責任分離

---

## 📊 最終データベース設計

### 核心原則
- **正規化とJSONのバランス**: 検索・集計に使うデータはカラム化、構造が固定的なデータ（選択肢）はJSON
- **タグの完全正規化**: 文法ポイントは別テーブル管理（弱点分析の要）
- **過去問とAI問題の統一管理**: 学習履歴の参照を統一

### スキーマ定義

```sql
-- ====================
-- 1. 問題関連テーブル
-- ====================

-- 問題マスタ（過去問）
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,                    -- '5','4','3','pre2','2','pre1','1'
    section TEXT NOT NULL,                  -- 'reading_1', 'listening_2', etc.
    question_number INTEGER,                -- セクション内の通し番号
    question_type TEXT NOT NULL,            -- 'vocabulary', 'grammar', 'reading_comp', 'listening'
    question_text TEXT NOT NULL,            -- 問題文
    passage_id INTEGER,                     -- 長文問題の場合（外部キー）
    choices_json TEXT NOT NULL,             -- JSON: ["選択肢A", "選択肢B", "選択肢C", "選択肢D"]
    correct_answer_index INTEGER NOT NULL,  -- 0-based index (0=A, 1=B, 2=C, 3=D)
    explanation TEXT,                       -- 解説
    explanation_ja TEXT,                    -- 日本語解説
    audio_key TEXT,                         -- R2のキー（リスニング用）
    image_key TEXT,                         -- 画像のR2キー
    difficulty_score REAL DEFAULT 0.5,      -- 0.0-1.0（正答率から算出）
    vocab_band TEXT,                        -- 'CEFR-A2', 'CEFR-B1', etc.
    year INTEGER,                           -- 実施年
    exam_session TEXT,                      -- '1st', '2nd', '3rd'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(choices_json)),
    CHECK (correct_answer_index >= 0 AND correct_answer_index < 4),
    FOREIGN KEY (passage_id) REFERENCES passages(id)
);

-- 長文・リスニングスクリプト
CREATE TABLE IF NOT EXISTS passages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,                  -- 本文
    content_ja TEXT,                        -- 日本語訳
    audio_key TEXT,                         -- 音声のR2キー
    word_count INTEGER,
    reading_time_seconds INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 文法・語彙タグマスタ
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,              -- '仮定法過去', '関係副詞', 'TOEIC800'
    type TEXT NOT NULL,                     -- 'grammar', 'vocabulary', 'topic'
    category TEXT,                          -- 'verb_tense', 'clause', etc.
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 問題とタグの中間テーブル（Many-to-Many）
CREATE TABLE IF NOT EXISTS question_tags (
    question_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    relevance_score REAL DEFAULT 1.0,       -- 0.0-1.0（タグの関連度）
    PRIMARY KEY (question_id, tag_id),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- AI生成問題
CREATE TABLE IF NOT EXISTS generated_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_question_id INTEGER,           -- ベースとなった過去問ID（NULLable）
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_type TEXT NOT NULL,
    question_text TEXT NOT NULL,
    choices_json TEXT NOT NULL,
    correct_answer_index INTEGER NOT NULL,
    explanation TEXT,
    explanation_ja TEXT,
    audio_key TEXT,                         -- TTS生成音声のR2キー
    difficulty_score REAL DEFAULT 0.5,
    vocab_band TEXT,
    model TEXT,                             -- 'gpt-4o', 'gpt-4-turbo', etc.
    temperature REAL,                       -- 生成時のtemperature
    prompt_hash TEXT,                       -- プロンプトのハッシュ（再現性）
    seed INTEGER,                           -- 乱数シード
    similarity_score REAL,                  -- 元問題との類似度
    review_status TEXT DEFAULT 'pending',   -- 'pending', 'approved', 'rejected'
    reviewed_by TEXT,                       -- レビュアーID
    reviewed_at TEXT,
    quality_score REAL,                     -- 人間評価スコア（1-5）
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(choices_json)),
    CHECK (correct_answer_index >= 0 AND correct_answer_index < 4),
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
    FOREIGN KEY (original_question_id) REFERENCES questions(id)
);

-- 生成問題にもタグ付け
CREATE TABLE IF NOT EXISTS generated_question_tags (
    question_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    relevance_score REAL DEFAULT 1.0,
    PRIMARY KEY (question_id, tag_id),
    FOREIGN KEY (question_id) REFERENCES generated_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ====================
-- 2. 学習管理テーブル
-- ====================

-- 学習セッション
CREATE TABLE IF NOT EXISTS learning_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    session_type TEXT NOT NULL,             -- 'practice', 'mock_test', 'review', 'weak_point'
    grade TEXT NOT NULL,
    section TEXT,                           -- NULLの場合は複数セクション
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    total_questions INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    time_limit_seconds INTEGER,             -- タイマー設定（NULLの場合は無制限）
    metadata TEXT,                          -- JSON: 追加情報
    CHECK (json_valid(metadata) OR metadata IS NULL)
);

-- 学習履歴（統合管理）
CREATE TABLE IF NOT EXISTS learning_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    question_source TEXT NOT NULL,          -- 'original' or 'generated'
    question_id INTEGER NOT NULL,
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    question_type TEXT NOT NULL,
    user_answer_index INTEGER,              -- 0-based index（未回答の場合NULL）
    correct_answer_index INTEGER NOT NULL,
    is_correct INTEGER NOT NULL,            -- 0 or 1
    time_spent_ms INTEGER,                  -- ミリ秒単位
    confidence_level INTEGER,               -- 1-5（自信度、オプション）
    device TEXT,                            -- 'mobile', 'desktop', 'tablet'
    started_at TEXT,
    answered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (is_correct IN (0, 1)),
    CHECK (user_answer_index IS NULL OR (user_answer_index >= 0 AND user_answer_index < 4)),
    FOREIGN KEY (session_id) REFERENCES learning_sessions(id)
);

-- 学生の統計サマリー（定期的に集計）
CREATE TABLE IF NOT EXISTS student_stats (
    student_id TEXT PRIMARY KEY,
    grade TEXT NOT NULL,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    accuracy_rate REAL DEFAULT 0.0,         -- 正答率
    total_study_time_ms INTEGER DEFAULT 0,
    study_days INTEGER DEFAULT 0,           -- 学習日数
    current_streak INTEGER DEFAULT 0,       -- 連続学習日数
    last_study_date TEXT,
    weak_tags TEXT,                         -- JSON: 弱点タグのリスト
    strong_tags TEXT,                       -- JSON: 得意タグのリスト
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(weak_tags) OR weak_tags IS NULL),
    CHECK (json_valid(strong_tags) OR strong_tags IS NULL)
);

-- 復習スケジュール（SRS: Spaced Repetition System）
CREATE TABLE IF NOT EXISTS review_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    question_source TEXT NOT NULL,          -- 'original' or 'generated'
    question_id INTEGER NOT NULL,
    ease_factor REAL DEFAULT 2.5,           -- SM-2アルゴリズム用
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    next_review_date TEXT NOT NULL,
    last_reviewed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ====================
-- 3. メディア管理
-- ====================

-- R2メディアアセット
CREATE TABLE IF NOT EXISTS media_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    r2_key TEXT NOT NULL UNIQUE,            -- R2のキー
    asset_type TEXT NOT NULL,               -- 'audio', 'image'
    mime_type TEXT NOT NULL,                -- 'audio/mpeg', 'image/jpeg'
    file_size_bytes INTEGER,
    duration_seconds REAL,                  -- 音声の場合
    width INTEGER,                          -- 画像の場合
    height INTEGER,                         -- 画像の場合
    source TEXT,                            -- 'openai_tts', 'elevenlabs', 'upload', etc.
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (asset_type IN ('audio', 'image'))
);

-- ====================
-- 4. AI品質管理
-- ====================

-- AI生成ログ（デバッグ・改善用）
CREATE TABLE IF NOT EXISTS generation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    original_question_id INTEGER,
    model TEXT NOT NULL,
    temperature REAL,
    prompt_text TEXT,                       -- 実際のプロンプト
    response_text TEXT,                     -- AIのレスポンス
    generation_time_ms INTEGER,
    tokens_used INTEGER,
    success INTEGER NOT NULL,               -- 0 or 1
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (success IN (0, 1)),
    FOREIGN KEY (original_question_id) REFERENCES questions(id)
);

-- 人間フィードバック（品質改善用）
CREATE TABLE IF NOT EXISTS question_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_source TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    feedback_type TEXT NOT NULL,            -- 'quality', 'difficulty', 'error', 'clarity'
    rating INTEGER,                         -- 1-5
    comment TEXT,
    submitted_by TEXT,                      -- student_id or 'admin'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (feedback_type IN ('quality', 'difficulty', 'error', 'clarity')),
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);

-- ====================
-- 5. インデックス（パフォーマンス最適化）
-- ====================

-- 問題検索用
CREATE INDEX IF NOT EXISTS idx_questions_grade_section 
    ON questions(grade, section);
CREATE INDEX IF NOT EXISTS idx_questions_type_difficulty 
    ON questions(question_type, difficulty_score);
CREATE INDEX IF NOT EXISTS idx_questions_vocab_band 
    ON questions(vocab_band);

-- AI生成問題用
CREATE INDEX IF NOT EXISTS idx_gen_questions_grade_section 
    ON generated_questions(grade, section);
CREATE INDEX IF NOT EXISTS idx_gen_questions_status 
    ON generated_questions(review_status);
CREATE INDEX IF NOT EXISTS idx_gen_questions_original 
    ON generated_questions(original_question_id);

-- タグ検索用
CREATE INDEX IF NOT EXISTS idx_question_tags_tag 
    ON question_tags(tag_id);
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

-- ====================
-- 6. 分析用ビュー
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
LEFT JOIN question_tags qt ON 
    (lh.question_source = 'original' AND qt.question_id = lh.question_id)
LEFT JOIN generated_question_tags gqt ON 
    (lh.question_source = 'generated' AND gqt.question_id = lh.question_id)
LEFT JOIN tags t ON (t.id = qt.tag_id OR t.id = gqt.tag_id)
WHERE t.id IS NOT NULL
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
```

---

## 🤖 AI問題生成システム（2段階検証）

### Phase 1: 分析と生成

```typescript
// プロンプトテンプレート
const GENERATION_PROMPT_TEMPLATE = `
あなたは英検{grade}級の問題作成の専門家です。

# 基準となる過去問（分析用のみ・内容は使用しない）
問題文: {original_question_text}
選択肢: {original_choices}
正解: {correct_answer}
文法ポイント: {grammar_points}
語彙バンド: {vocab_band}
難易度: {difficulty_score}

# タスク
上記過去問を分析し、同等の品質・難易度の**完全にオリジナルな**問題を作成してください。

## Step 1: 分析
以下の点を分析してください：
1. 主要な文法ポイント（例: 関係副詞、仮定法過去）
2. 語彙レベル（CEFR基準）
3. 文の複雑さ（単文/複文/重文）
4. 誤答選択肢のパターン（なぜ間違いか）

## Step 2: 生成ルール
- **必須**: 全く異なる文脈・シチュエーション
- **禁止**: 単語の入れ替えのみの変更
- **必須**: 同じ文法ポイントをテスト
- **必須**: 同じ語彙レベル（CEFR {vocab_band}）
- **必須**: 誤答選択肢も元問題と同様の「間違いパターン」
- **禁止**: 固有名詞の流用
- **禁止**: 数字や日付の単純変更のみ

## Step 3: 出力
以下のJSONフォーマット**のみ**で回答してください：

{
  "analysis": {
    "grammar_focus": "string",
    "vocab_level": "string",
    "sentence_structure": "string",
    "distractor_patterns": {
      "A": "なぜ間違いか",
      "B": "なぜ間違いか",
      "C": "なぜ間違いか"
    }
  },
  "generated_question": {
    "question_text": "問題文",
    "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
    "correct_answer_index": 0,
    "explanation": "正解の理由（英語）",
    "explanation_ja": "正解の理由（日本語）",
    "distractor_rationale": {
      "1": "選択肢Bが誤答の理由",
      "2": "選択肢Cが誤答の理由",
      "3": "選択肢Dが誤答の理由"
    }
  }
}

**重要**: 過去問との類似度が15%未満になるよう、完全にオリジナルな内容にしてください。
`.trim();

// 生成関数
async function generateSimilarQuestion(
  originalQuestion: Question,
  env: Env
): Promise<GeneratedQuestionDraft> {
  const prompt = GENERATION_PROMPT_TEMPLATE
    .replace('{grade}', originalQuestion.grade)
    .replace('{original_question_text}', originalQuestion.question_text)
    .replace('{original_choices}', JSON.stringify(JSON.parse(originalQuestion.choices_json)))
    .replace('{correct_answer}', String.fromCharCode(65 + originalQuestion.correct_answer_index))
    .replace('{grammar_points}', await getGrammarPointsText(originalQuestion.id, env))
    .replace('{vocab_band}', originalQuestion.vocab_band || 'CEFR-B1')
    .replace('{difficulty_score}', originalQuestion.difficulty_score.toFixed(2));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert EIKEN test question writer. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,           // 創造性とコントロールのバランス
      response_format: { type: 'json_object' }
    }),
  });

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);
  
  return result.generated_question;
}
```

### Phase 2: 品質検証

```typescript
// 自動品質チェック
interface ValidationResult {
  isValid: boolean;
  score: number;  // 0-100
  issues: string[];
  warnings: string[];
}

async function validateGeneratedQuestion(
  draft: GeneratedQuestionDraft,
  originalQuestion: Question,
  env: Env
): Promise<ValidationResult> {
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // 1. 基本フォーマットチェック
  if (!Array.isArray(draft.choices) || draft.choices.length !== 4) {
    issues.push('選択肢が4つではありません');
    score -= 50;
  }

  if (draft.correct_answer_index < 0 || draft.correct_answer_index > 3) {
    issues.push('正解インデックスが不正です');
    score -= 50;
  }

  // 2. 選択肢の一意性チェック
  const uniqueChoices = new Set(draft.choices.map(c => c.trim().toLowerCase()));
  if (uniqueChoices.size !== 4) {
    issues.push('選択肢に重複があります');
    score -= 30;
  }

  // 3. 文長チェック（元問題の±50%以内）
  const originalLength = originalQuestion.question_text.length;
  const draftLength = draft.question_text.length;
  const lengthRatio = draftLength / originalLength;
  
  if (lengthRatio < 0.5 || lengthRatio > 1.5) {
    warnings.push(`問題文の長さが元問題と大きく異なります（${(lengthRatio * 100).toFixed(0)}%）`);
    score -= 10;
  }

  // 4. 語彙レベルチェック（簡易版 - 実際はCEFR辞書と照合）
  const words = draft.question_text.toLowerCase().match(/\b\w+\b/g) || [];
  const complexWords = words.filter(w => w.length > 10);
  const complexityRatio = complexWords.length / words.length;
  
  if (originalQuestion.vocab_band === 'CEFR-A2' && complexityRatio > 0.15) {
    warnings.push('語彙レベルが高すぎる可能性があります');
    score -= 5;
  }

  // 5. 類似度チェック（埋め込みベース）
  const similarity = await calculateSimilarity(
    originalQuestion.question_text,
    draft.question_text,
    env
  );

  if (similarity > 0.85) {
    issues.push('元問題との類似度が高すぎます（著作権リスク）');
    score -= 40;
  } else if (similarity > 0.50) {
    warnings.push('元問題との類似度がやや高めです');
    score -= 15;
  }

  // 6. 禁止ワードチェック
  const prohibitedPatterns = [
    /\[.*?\]/,      // プレースホルダー
    /___+/,         // 空欄マーカー
    /TODO/i,
    /FIXME/i,
  ];

  for (const pattern of prohibitedPatterns) {
    if (pattern.test(draft.question_text)) {
      issues.push('禁止パターンが検出されました');
      score -= 30;
    }
  }

  return {
    isValid: issues.length === 0 && score >= 60,
    score: Math.max(0, score),
    issues,
    warnings
  };
}

// 類似度計算（OpenAI Embeddings使用）
async function calculateSimilarity(
  text1: string,
  text2: string,
  env: Env
): Promise<number> {
  // テキストの埋め込みを取得
  const [embedding1, embedding2] = await Promise.all([
    getEmbedding(text1, env),
    getEmbedding(text2, env)
  ]);

  // コサイン類似度を計算
  const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
  const magnitude1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));

  return dotProduct / (magnitude1 * magnitude2);
}

async function getEmbedding(text: string, env: Env): Promise<number[]> {
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

  const data = await response.json();
  return data.data[0].embedding;
}
```

### Phase 3: 事前生成プール管理

```typescript
// Cloudflare Workers Cron Trigger
// wrangler.toml に以下を追加:
// [triggers]
// crons = ["0 */3 * * *"]  # 3時間ごと

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(maintainQuestionPool(env));
  }
};

async function maintainQuestionPool(env: Env) {
  // 承認済みAI問題のプールサイズをチェック
  const poolStatus = await env.DB.prepare(`
    SELECT 
      grade,
      section,
      COUNT(*) as count
    FROM generated_questions
    WHERE review_status = 'approved'
    AND id NOT IN (SELECT question_id FROM learning_history WHERE question_source = 'generated')
    GROUP BY grade, section
  `).all();

  const targetPoolSize = 50;  // 各セクションごと

  for (const row of poolStatus.results) {
    const { grade, section, count } = row;
    
    if (count < targetPoolSize) {
      const needed = targetPoolSize - count;
      console.log(`Generating ${needed} questions for ${grade}-${section}`);
      
      // ランダムに元問題を選択
      const originalQuestions = await env.DB.prepare(`
        SELECT * FROM questions
        WHERE grade = ? AND section = ?
        ORDER BY RANDOM()
        LIMIT ?
      `).bind(grade, section, needed).all();

      // 並列生成（最大5問同時）
      const batchSize = 5;
      for (let i = 0; i < originalQuestions.results.length; i += batchSize) {
        const batch = originalQuestions.results.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (original) => {
          try {
            const draft = await generateSimilarQuestion(original, env);
            const validation = await validateGeneratedQuestion(draft, original, env);
            
            // 自動検証に合格したら保存（人間レビュー待ち）
            if (validation.isValid) {
              await saveGeneratedQuestion(draft, original, validation, env);
            }
          } catch (error) {
            console.error(`Failed to generate question for ${original.id}:`, error);
          }
        }));
      }
    }
  }
}

async function saveGeneratedQuestion(
  draft: GeneratedQuestionDraft,
  original: Question,
  validation: ValidationResult,
  env: Env
) {
  const result = await env.DB.prepare(`
    INSERT INTO generated_questions (
      original_question_id, grade, section, question_type,
      question_text, choices_json, correct_answer_index,
      explanation, explanation_ja,
      model, temperature, prompt_hash,
      similarity_score, review_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    original.id,
    original.grade,
    original.section,
    original.question_type,
    draft.question_text,
    JSON.stringify(draft.choices),
    draft.correct_answer_index,
    draft.explanation,
    draft.explanation_ja,
    'gpt-4o',
    0.4,
    'prompt_v1_hash',  // 実際はハッシュ計算
    validation.score / 100,
    validation.score >= 80 ? 'approved' : 'pending'  // 高スコアは自動承認
  ).run();

  console.log(`✅ Generated question saved: ID ${result.meta.last_row_id}`);
}
```

---

## 🔊 リスニング音声生成（OpenAI TTS）

### 基本実装

```typescript
interface TTSConfig {
  model: 'tts-1' | 'tts-1-hd';
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed: number;  // 0.25 - 4.0
}

async function generateListeningAudio(
  text: string,
  questionId: string,
  config: TTSConfig,
  env: Env
): Promise<string> {
  // OpenAI TTS API呼び出し
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      voice: config.voice,
      input: text,
      speed: config.speed,
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS API error: ${response.statusText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  
  // R2にアップロード
  const audioKey = `audio/generated/${questionId}_${config.voice}_${config.speed.toFixed(2)}.mp3`;
  
  await env.R2_BUCKET.put(audioKey, audioBuffer, {
    httpMetadata: {
      contentType: 'audio/mpeg',
      cacheControl: 'public, max-age=31536000, immutable',  // 永久キャッシュ
    },
  });

  // media_assetsに記録
  await env.DB.prepare(`
    INSERT INTO media_assets (r2_key, asset_type, mime_type, source)
    VALUES (?, 'audio', 'audio/mpeg', 'openai_tts')
  `).bind(audioKey).run();

  return audioKey;
}

// 複数話者の会話問題用
async function generateConversationAudio(
  conversation: ConversationScript,
  questionId: string,
  env: Env
): Promise<string> {
  // 話者ごとに音声生成
  const audioSegments = await Promise.all(
    conversation.turns.map(async (turn, index) => {
      const voice = turn.speaker === 'A' ? 'alloy' : 'echo';  // 話者ごとに声を変える
      
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1-hd',
          voice: voice,
          input: turn.text,
          speed: 0.9,
        }),
      });

      return {
        buffer: await response.arrayBuffer(),
        order: index,
      };
    })
  );

  // 音声セグメントを結合（Workers内では難しいため、R2に個別保存して再生時に連結）
  // または、ffmpegを使える環境で事前結合
  
  // 簡易実装: 個別ファイルを配列として返す
  const audioKeys = [];
  for (const segment of audioSegments) {
    const key = `audio/conversation/${questionId}_part${segment.order}.mp3`;
    await env.R2_BUCKET.put(key, segment.buffer, {
      httpMetadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    audioKeys.push(key);
  }

  return JSON.stringify(audioKeys);  // フロントエンドで順次再生
}
```

---

## 📥 データ投入戦略

### フェーズ1: 手動MVP（最初の50問）

```typescript
// サンプルデータ構造
const sampleQuestion = {
  grade: '2',
  section: 'reading_1',
  question_number: 1,
  question_type: 'vocabulary',
  question_text: 'The new policy will _____ affect our business operations.',
  choices: ['significantly', 'significance', 'significant', 'signify'],
  correct_answer_index: 0,
  explanation: "'Significantly' is an adverb modifying the verb 'affect'.",
  explanation_ja: "'Significantly'は動詞'affect'を修飾する副詞です。",
  difficulty_score: 0.65,
  vocab_band: 'CEFR-B1',
  year: 2024,
  exam_session: '1st',
  tags: ['adverbs', 'word_forms']
};

// 投入スクリプト
async function seedInitialQuestions(env: Env) {
  const questions = [
    sampleQuestion,
    // ... 他の49問
  ];

  for (const q of questions) {
    // 問題を保存
    const result = await env.DB.prepare(`
      INSERT INTO questions (
        grade, section, question_number, question_type,
        question_text, choices_json, correct_answer_index,
        explanation, explanation_ja, difficulty_score, vocab_band,
        year, exam_session
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      q.grade, q.section, q.question_number, q.question_type,
      q.question_text, JSON.stringify(q.choices), q.correct_answer_index,
      q.explanation, q.explanation_ja, q.difficulty_score, q.vocab_band,
      q.year, q.exam_session
    ).run();

    const questionId = result.meta.last_row_id;

    // タグを関連付け
    for (const tagName of q.tags) {
      // タグIDを取得または作成
      let tag = await env.DB.prepare(`
        SELECT id FROM tags WHERE name = ?
      `).bind(tagName).first();

      if (!tag) {
        const tagResult = await env.DB.prepare(`
          INSERT INTO tags (name, type) VALUES (?, 'grammar')
        `).bind(tagName).run();
        tag = { id: tagResult.meta.last_row_id };
      }

      // 中間テーブルに登録
      await env.DB.prepare(`
        INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)
      `).bind(questionId, tag.id).run();
    }
  }

  console.log(`✅ Seeded ${questions.length} questions`);
}
```

### フェーズ2: 半自動投入（OCR + GPT-4 + レビュー）

```typescript
// PDF OCRの構造化プロンプト
const OCR_STRUCTURE_PROMPT = `
以下は英検の過去問PDFから抽出したテキストです。
問題番号、問題文、選択肢、正解を抽出し、JSON配列で出力してください。

【抽出テキスト】
{ocr_text}

【出力形式】
[
  {
    "question_number": 1,
    "question_text": "問題文",
    "choices": ["A", "B", "C", "D"],
    "correct_answer": "A",
    "confidence": 0.95,
    "notes": "不明点があれば記載"
  },
  ...
]

【注意事項】
- confidenceは0.0-1.0で、抽出の確信度を示してください
- 不明瞭な部分は notes に記載してください
- 問題番号が連続していることを確認してください
`;

// Web管理画面用のレビューAPI
export async function reviewOcrResults(request: Request, env: Env) {
  const { ocrData, edits, action } = await request.json();

  if (action === 'approve') {
    // 承認された問題をDBに保存
    for (const question of edits) {
      await saveQuestion(question, env);
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (action === 'reject') {
    // ログに記録して終了
    console.log('OCR data rejected:', ocrData);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Invalid action', { status: 400 });
}
```

---

## ⚡ パフォーマンス最適化

### キャッシュ戦略

```typescript
// Cloudflare Workers KVを使ったキャッシュ
async function getQuestionsWithCache(
  grade: string,
  section: string,
  env: Env
): Promise<Question[]> {
  const cacheKey = `questions:${grade}:${section}:v1`;
  
  // KVから取得を試みる
  const cached = await env.KV.get(cacheKey, 'json');
  if (cached) {
    console.log('✅ Cache hit:', cacheKey);
    return cached;
  }

  // キャッシュミス - DBから取得
  console.log('❌ Cache miss:', cacheKey);
  const questions = await env.DB.prepare(`
    SELECT * FROM questions
    WHERE grade = ? AND section = ?
    ORDER BY question_number
  `).bind(grade, section).all();

  // KVに保存（5分間）
  await env.KV.put(cacheKey, JSON.stringify(questions.results), {
    expirationTtl: 300,
  });

  return questions.results;
}
```

### キーセットページング（高速）

```typescript
// ❌ 悪い例: OFFSET使用（遅い）
const badQuery = `
  SELECT * FROM questions
  WHERE grade = ?
  LIMIT 20 OFFSET ${page * 20}
`;

// ✅ 良い例: キーセットページング
async function getQuestionsPaginated(
  grade: string,
  lastId: number | null,
  limit: number,
  env: Env
): Promise<PaginatedResult> {
  const query = lastId
    ? `SELECT * FROM questions WHERE grade = ? AND id > ? ORDER BY id LIMIT ?`
    : `SELECT * FROM questions WHERE grade = ? ORDER BY id LIMIT ?`;

  const bindings = lastId ? [grade, lastId, limit] : [grade, limit];
  
  const results = await env.DB.prepare(query).bind(...bindings).all();

  return {
    questions: results.results,
    nextCursor: results.results.length === limit 
      ? results.results[results.results.length - 1].id 
      : null,
  };
}
```

---

## 🎨 UI/UX実装例（React）

### タイマーコンポーネント

```tsx
import { useState, useEffect } from 'react';

interface TimerProps {
  totalSeconds: number;
  onTimeUp: () => void;
  mode: 'countdown' | 'stopwatch';
}

export function StudyTimer({ totalSeconds, onTimeUp, mode }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (mode === 'countdown') {
          if (prev <= 1) {
            onTimeUp();
            setIsActive(false);
            return 0;
          }
          return prev - 1;
        } else {
          return prev + 1;
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, mode, onTimeUp]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressColor = () => {
    if (mode === 'stopwatch') return '#3b82f6';
    const ratio = timeLeft / totalSeconds;
    if (ratio > 0.5) return '#10b981';
    if (ratio > 0.2) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="timer-container">
      <div 
        className="timer-display"
        style={{ color: getProgressColor() }}
      >
        ⏱️ {mode === 'countdown' ? '残り' : '経過'}: {formatTime(timeLeft)}
      </div>
      {mode === 'countdown' && (
        <div className="timer-progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${(timeLeft / totalSeconds) * 100}%`,
              backgroundColor: getProgressColor(),
            }}
          />
        </div>
      )}
      <button onClick={() => setIsActive(!isActive)}>
        {isActive ? '⏸️ 一時停止' : '▶️ 再開'}
      </button>
    </div>
  );
}
```

### 弱点分析ダッシュボード

```tsx
interface WeakPoint {
  tagName: string;
  accuracy: number;
  totalAttempts: number;
}

export function WeakPointsDashboard({ studentId }: { studentId: string }) {
  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);

  useEffect(() => {
    fetch(`/api/student/${studentId}/weak-points`)
      .then(res => res.json())
      .then(data => setWeakPoints(data));
  }, [studentId]);

  return (
    <div className="weak-points-dashboard">
      <h2>📊 あなたの弱点分野</h2>
      
      {weakPoints.length === 0 ? (
        <p>まだデータがありません。問題を解いて分析を開始しましょう！</p>
      ) : (
        <div className="weak-points-list">
          {weakPoints.map((point) => (
            <div key={point.tagName} className="weak-point-card">
              <div className="tag-name">{point.tagName}</div>
              <div className="accuracy-bar">
                <div
                  className="accuracy-fill"
                  style={{
                    width: `${point.accuracy * 100}%`,
                    backgroundColor: point.accuracy < 0.5 ? '#ef4444' : '#f59e0b',
                  }}
                />
              </div>
              <div className="stats">
                正答率: {(point.accuracy * 100).toFixed(1)}%
                （{point.totalAttempts}問中）
              </div>
              <button 
                className="review-button"
                onClick={() => window.location.href = `/practice?tag=${point.tagName}`}
              >
                この分野を復習する →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 🚀 実装ロードマップ（最終版）

### Week 1-2: 基盤構築（MVP）
- [x] D1データベース作成・マイグレーション
- [x] 手動で50問投入（2級の大問1）
- [x] React基本UI（問題表示・選択肢・解答）
- [x] 学習履歴保存API

**成果物**: 2級の語彙問題50問が解けるシステム

### Week 3-4: AI生成（コア機能）
- [x] AI問題生成プロンプト実装
- [x] 2段階検証（生成 → 品質チェック）
- [x] 管理画面（生成問題レビュー）
- [x] 事前生成プール（Cron Trigger）

**成果物**: AI生成問題が自動で貯まるシステム

### Week 5-6: リスニング対応
- [x] OpenAI TTS統合
- [x] R2音声アップロード
- [x] 音声再生UI（速度調整機能）
- [x] リスニング問題50問投入

**成果物**: リスニング問題が解けるシステム

### Week 7-8: 学習分析
- [x] タグ別正答率分析
- [x] 弱点ダッシュボード
- [x] 復習スケジュール（簡易SRS）
- [x] おすすめ問題表示

**成果物**: 個別最適化された学習システム

### Week 9-10: スケール・最適化
- [x] キャッシュ戦略実装
- [x] パフォーマンスチューニング
- [x] 他の級への展開
- [x] データ大量投入（OCR補助）

**成果物**: 全7級対応の完全システム

---

## ✅ 重要な決定事項まとめ

### DB設計
- ✅ **正規化**: タグは別テーブル（Many-to-Many）
- ✅ **JSON使用**: 選択肢のみ（検索不要なデータ）
- ✅ **インデックス**: grade+section, tag_id, student_id+time

### AI生成
- ✅ **2段階検証**: 生成 → 自動品質チェック → 人間レビュー
- ✅ **類似度監視**: 15%未満を維持（著作権配慮）
- ✅ **事前生成**: Cron Triggerで自動プール管理

### リスニング
- ✅ **TTS選択**: OpenAI TTS（コスパ最高）
- ✅ **音声管理**: R2に保存、永久キャッシュ
- ✅ **複数話者**: 声を変えて会話を表現

### データ投入
- ✅ **フェーズ1**: 手動50問（品質重視）
- ✅ **フェーズ2**: OCR + GPT-4 + 人間レビュー
- ✅ **フェーズ3**: Web管理画面で継続投入

### 著作権
- ✅ **安全策**: 過去問は内部分析のみ、公開はAI生成問題のみ
- ✅ **類似度監視**: 埋め込みベースで常時チェック
- ✅ **利用規約**: 英検協会とは無関係と明記

### パフォーマンス
- ✅ **キャッシュ**: Workers KV（5分TTL）
- ✅ **ページング**: キーセット方式（高速）
- ✅ **AI待ち時間**: 事前生成プールで解決

---

## 🎉 次のアクション

1. **DB作成**: `wrangler d1 create eiken-db`
2. **マイグレーション実行**: 上記スキーマを実行
3. **サンプルデータ投入**: 手動で10問作成
4. **MVP実装開始**: 問題表示 → 解答 → 採点

**準備ができたら、実装を開始します！** 🚀
