# 英検問題生成システム強化ロードマップ

**作成日**: 2025-11-11  
**ベース**: V3既存実装 + 3AI統合アドバイス（Claude, Gemini, ChatGPT, Genspark）

---

## 📊 エグゼクティブサマリー

### 現状
- ✅ 空所補充問題（文法・語彙）実装済み
- ✅ 著作権検証システム実装済み
- ✅ 各級の文法トピックマッピング完了
- ✅ 日本語解説・翻訳生成機能完備

### 不足している主要機能
1. 🔴 **語彙レベル管理システム**（300語～15,000語の厳密な制御）
2. 🔴 **2024年度リニューアル対応**（要約・Eメール問題）
3. 🔴 **問題形式の多様化**（会話文、長文読解、語順整序）
4. 🟡 **トピック分野管理**（各級の推奨トピックリスト）
5. 🟡 **ライティング自動採点**（4項目×4点＝16点満点）

### 実装優先度（3AI総合判断）
```
Phase 1: 語彙レベル管理        [CRITICAL] 🔥🔥🔥
Phase 2: トピック分野管理      [HIGH]     ⚠️⚠️
Phase 3: 問題形式多様化（簡単） [HIGH]     ⚠️
Phase 4: 2024年度対応          [HIGH]     ⚠️
Phase 5: 長文読解・採点        [MEDIUM]   📌
```

---

## 🎯 Phase 1: 語彙レベル管理システム【最優先】

### 目標
各級の語彙数範囲（5級:300-600語 ～ 1級:10,000-15,000語）を厳密に管理し、生成問題の語彙レベルを保証する。

### 技術的アプローチ（3AI統合案）

#### A. 語彙辞書データベース構築

**採用方針**: Claude提案の「複数ソース統合」+ ChatGPT提案の「CEFR×頻度管理」

```sql
-- 新テーブル: 語彙辞書
CREATE TABLE IF NOT EXISTS eiken_vocabulary_lexicon (
    word_lemma TEXT NOT NULL,              -- 見出し語（原型）
    pos TEXT NOT NULL,                     -- 品詞 (noun/verb/adj/adv/...)
    cefr_level TEXT NOT NULL,              -- 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'
    zipf_score REAL,                       -- 頻度スコア (1.0-7.0)
    grade_level INTEGER,                   -- 英検級 (5, 4, 3, 21, 2, 11, 1)
    
    -- 信頼性管理
    sources TEXT NOT NULL,                 -- JSON: ["CEFR-J", "SVL", "NGSL"]
    confidence REAL NOT NULL DEFAULT 1.0,  -- 複数ソース一致度 (0.0-1.0)
    
    -- メタデータ
    frequency_rank INTEGER,
    manual_verified INTEGER DEFAULT 0,     -- 手動検証済み
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (word_lemma, pos),
    CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
    CHECK (manual_verified IN (0, 1)),
    CHECK (json_valid(sources))
);

CREATE INDEX idx_vocab_cefr ON eiken_vocabulary_lexicon(cefr_level);
CREATE INDEX idx_vocab_grade ON eiken_vocabulary_lexicon(grade_level);
CREATE INDEX idx_vocab_zipf ON eiken_vocabulary_lexicon(zipf_score);
CREATE INDEX idx_vocab_confidence ON eiken_vocabulary_lexicon(confidence);
```

**データソース戦略**:
1. **CEFR-J**: 日本の学習者向けに最適化
2. **SVL 12000**: 日本でメジャー、教育現場で広く使用
3. **NGSL/NAWL**: 国際標準、実用的
4. **コンセンサスアルゴリズム**: 3ソースで一致する語彙を高信頼度として採用

#### B. Lemmatization（原型化）実装

**採用ライブラリ**: `compromise`（Cloudflare Workers互換、軽量）

```typescript
// src/eiken/services/vocabulary-analyzer.ts

import nlp from 'compromise';

export interface VocabularyAnalysisResult {
  isValid: boolean;
  totalWords: number;
  uniqueWords: number;
  outOfRangeWords: string[];
  outOfRangeRatio: number;
  suggestion: string | null;
  zipfViolations: string[];
}

/**
 * テキストの語彙レベルを分析
 */
export async function analyzeVocabularyLevel(
  text: string,
  targetGrade: string,
  env: EikenEnv
): Promise<VocabularyAnalysisResult> {
  
  // 1. トークナイズ & Lemmatization
  const doc = nlp(text);
  const tokens = doc.terms().out('array');
  const lemmas = tokens.map(token => 
    doc.match(token).toInfinitive().out('text') || token.toLowerCase()
  );
  
  const uniqueLemmas = [...new Set(lemmas)];
  
  // 2. D1に一括クエリ（高速化）
  const placeholders = uniqueLemmas.map(() => '?').join(',');
  const vocabData = await env.DB.prepare(`
    SELECT word_lemma, cefr_level, grade_level, zipf_score
    FROM eiken_vocabulary_lexicon
    WHERE word_lemma IN (${placeholders})
    ORDER BY confidence DESC
  `).bind(...uniqueLemmas).all();
  
  // 3. レベル判定
  const vocabMap = new Map(
    vocabData.results.map(row => [row.word_lemma, row])
  );
  
  const targetCEFR = getTargetCEFR(targetGrade);
  const targetZipfMin = 3.5; // 頻度閾値
  
  const outOfRange: string[] = [];
  const zipfViolations: string[] = [];
  
  for (const lemma of uniqueLemmas) {
    const vocabInfo = vocabMap.get(lemma);
    
    if (!vocabInfo) {
      // 辞書にない単語（固有名詞、専門用語等）→ 許容
      continue;
    }
    
    // CEFR超過チェック
    if (isAboveCEFR(vocabInfo.cefr_level, targetCEFR)) {
      outOfRange.push(lemma);
    }
    
    // 頻度チェック（低頻度語は避ける）
    if (vocabInfo.zipf_score && vocabInfo.zipf_score < targetZipfMin) {
      zipfViolations.push(lemma);
    }
  }
  
  const outOfRangeRatio = outOfRange.length / uniqueLemmas.length;
  const zipfViolationRatio = zipfViolations.length / uniqueLemmas.length;
  
  // 4. 判定（3%ルール）
  const isValid = outOfRangeRatio < 0.03 && zipfViolationRatio < 0.05;
  
  return {
    isValid,
    totalWords: lemmas.length,
    uniqueWords: uniqueLemmas.length,
    outOfRangeWords: outOfRange,
    outOfRangeRatio,
    suggestion: !isValid
      ? `以下の単語を${targetCEFR}レベルに置き換えてください: ${outOfRange.slice(0, 5).join(', ')}`
      : null,
    zipfViolations
  };
}

function getTargetCEFR(grade: string): string {
  const mapping: Record<string, string> = {
    '5': 'A1',
    '4': 'A1',
    '3': 'A2',
    'pre2': 'A2',
    '2': 'B1',
    'pre1': 'B2',
    '1': 'C1'
  };
  return mapping[grade] || 'B1';
}

function isAboveCEFR(wordLevel: string, targetLevel: string): boolean {
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return levels.indexOf(wordLevel) > levels.indexOf(targetLevel);
}
```

#### C. 生成フロー統合（事前制御 + 事後検証）

```typescript
// src/eiken/services/question-generator.ts に追加

/**
 * 語彙制約付き問題生成
 */
async function generateQuestionWithVocabControl(
  request: QuestionGenerationRequest,
  env: EikenEnv
): Promise<GeneratedQuestion> {
  
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 1. 問題生成（プロンプトで語彙制約を指定）
    const question = await generateSingleQuestion(request, null, env.OPENAI_API_KEY);
    
    // 2. 語彙レベル検証
    const combinedText = `${question.questionText} ${question.choices.join(' ')}`;
    const analysis = await analyzeVocabularyLevel(combinedText, request.grade, env);
    
    if (analysis.isValid) {
      console.log(`✅ Vocabulary check passed (attempt ${attempt})`);
      return question;
    }
    
    console.log(`⚠️ Vocabulary check failed (attempt ${attempt}): ${analysis.outOfRangeRatio * 100}% out of range`);
    
    // 3. 修正プロンプトで再生成
    if (attempt < maxRetries) {
      const rewritePrompt = buildVocabRewritePrompt(
        question,
        analysis.outOfRangeWords,
        request.grade
      );
      
      // 修正版生成（次のループで再検証）
      request.topicHints = [`REWRITE: ${analysis.suggestion}`];
    }
  }
  
  throw new Error('Failed to generate question within vocabulary constraints');
}

function buildVocabRewritePrompt(
  question: GeneratedQuestion,
  outOfRangeWords: string[],
  grade: string
): string {
  const targetCEFR = getTargetCEFR(grade);
  
  return `
VOCABULARY CONSTRAINT VIOLATION DETECTED.

Original question uses words beyond ${targetCEFR} level:
${outOfRangeWords.join(', ')}

REWRITE this question using simpler synonyms appropriate for ${targetCEFR} level.
Maintain the same grammar point and difficulty.

Original: ${question.questionText}

Requirements:
- Replace advanced words with ${targetCEFR}-level synonyms
- Keep the question structure identical
- Ensure choices remain grammatically correct
- Preserve the educational value

Output: Rewritten question in the same JSON format.
  `.trim();
}
```

### 実装タスク

```typescript
const PHASE1_TASKS = [
  {
    id: 'P1-1',
    task: '語彙辞書テーブル作成',
    file: 'migrations/0009_create_vocabulary_lexicon.sql',
    priority: 'CRITICAL',
    estimatedHours: 2
  },
  {
    id: 'P1-2',
    task: 'CEFR-J + SVL + NGSL データ統合スクリプト',
    file: 'scripts/import-vocabulary-data.ts',
    priority: 'CRITICAL',
    estimatedHours: 6,
    notes: 'データソースのライセンス確認必須'
  },
  {
    id: 'P1-3',
    task: 'Vocabulary Analyzer実装',
    file: 'src/eiken/services/vocabulary-analyzer.ts',
    priority: 'CRITICAL',
    estimatedHours: 4
  },
  {
    id: 'P1-4',
    task: 'compromise ライブラリ統合',
    dependencies: ['npm install compromise'],
    priority: 'HIGH',
    estimatedHours: 2
  },
  {
    id: 'P1-5',
    task: '生成フロー統合（事前＋事後検証）',
    file: 'src/eiken/services/question-generator.ts',
    priority: 'HIGH',
    estimatedHours: 4
  },
  {
    id: 'P1-6',
    task: 'KVキャッシング実装',
    file: 'src/eiken/services/vocabulary-cache.ts',
    priority: 'MEDIUM',
    estimatedHours: 2,
    notes: 'パフォーマンス最適化'
  },
  {
    id: 'P1-7',
    task: 'ユニットテスト（3%ルール検証）',
    file: 'tests/vocabulary-analyzer.test.ts',
    priority: 'HIGH',
    estimatedHours: 3
  }
];

// 合計見積: 23時間（約3営業日）
```

---

## 🏷️ Phase 2: トピック分野管理

### 目標
各級の推奨トピック分野リストを実装し、問題生成時に適切なトピックを選択する。

### 実装内容

```typescript
// 新ファイル: src/eiken/data/topic-areas.ts

export const topicAreasByGrade: Record<EikenGrade, TopicArea[]> = {
  '5': [
    { code: 'family', label: '家族', weight: 1.5 },
    { code: 'friends', label: '友達', weight: 1.5 },
    { code: 'school', label: '学校', weight: 2.0 },
    { code: 'hobbies', label: '趣味', weight: 1.2 },
    { code: 'sports', label: 'スポーツ', weight: 1.0 },
    { code: 'movies', label: '映画', weight: 0.8 },
    { code: 'music', label: '音楽', weight: 0.8 },
    { code: 'food', label: '食べ物', weight: 1.2 },
    { code: 'weather', label: '天気', weight: 1.0 },
    { code: 'directions', label: '道案内', weight: 0.7 },
    { code: 'self-intro', label: '自己紹介', weight: 1.3 },
    { code: 'plans', label: '休日の予定', weight: 1.0 }
  ],
  
  '4': [
    { code: 'school', label: '学校', weight: 1.5 },
    { code: 'local-community', label: '地域', weight: 1.0 },
    { code: 'shopping', label: '買い物', weight: 1.2 },
    { code: 'part-time', label: 'アルバイト', weight: 0.8 },
    { code: 'travel', label: '旅行', weight: 1.3 },
    { code: 'directions', label: '道案内', weight: 0.7 },
    { code: 'phone-conversation', label: '電話での会話', weight: 0.9 },
    { code: 'birthday', label: '誕生日', weight: 0.6 },
    { code: 'future-dreams', label: '将来の夢', weight: 1.4 }
  ],
  
  '3': [
    { code: 'family', label: '家族', weight: 1.2 },
    { code: 'friends', label: '友人', weight: 1.2 },
    { code: 'school', label: '学校', weight: 1.5 },
    { code: 'local-community', label: '地域', weight: 1.0 },
    { code: 'phone', label: '電話', weight: 0.8 },
    { code: 'shopping', label: '買い物', weight: 1.0 },
    { code: 'travel', label: '旅行', weight: 1.3 },
    { code: 'directions', label: '道案内', weight: 0.7 },
    { code: 'sports', label: 'スポーツ', weight: 1.0 },
    { code: 'movies', label: '映画', weight: 0.9 },
    { code: 'music', label: '音楽', weight: 0.9 },
    { code: 'cooking', label: '料理', weight: 0.8 },
    { code: 'weather', label: '天気', weight: 0.7 }
  ],
  
  'pre2': [
    { code: 'school-life', label: '学校生活', weight: 1.3 },
    { code: 'hobbies', label: '趣味', weight: 1.0 },
    { code: 'travel', label: '旅行', weight: 1.2 },
    { code: 'shopping', label: '買い物', weight: 0.9 },
    { code: 'sports', label: 'スポーツ', weight: 1.0 },
    { code: 'movies', label: '映画', weight: 0.8 },
    { code: 'volunteer', label: 'ボランティア活動', weight: 1.1 },
    { code: 'cultural-exchange', label: '異文化理解', weight: 1.3 },
    { code: 'science', label: '科学', weight: 1.0 },
    { code: 'nature-environment', label: '自然・環境', weight: 1.2 }
  ],
  
  '2': [
    { code: 'daily-life', label: '日常生活', weight: 1.0 },
    { code: 'school', label: '学校', weight: 1.0 },
    { code: 'work', label: '仕事', weight: 1.2 },
    { code: 'hobbies', label: '趣味', weight: 0.9 },
    { code: 'travel', label: '旅行', weight: 1.1 },
    { code: 'shopping', label: '買い物', weight: 0.8 },
    { code: 'health', label: '健康', weight: 1.2 },
    { code: 'sports', label: 'スポーツ', weight: 0.9 },
    { code: 'volunteer', label: 'ボランティア', weight: 1.0 },
    { code: 'science', label: '科学', weight: 1.1 },
    { code: 'history', label: '歴史', weight: 1.0 },
    { code: 'education', label: '教育', weight: 1.3 },
    { code: 'business', label: 'ビジネス', weight: 1.2 },
    { code: 'media', label: 'メディア', weight: 1.1 },
    { code: 'environment', label: '環境', weight: 1.3 }
  ],
  
  'pre1': [
    { code: 'science', label: '科学', weight: 1.3 },
    { code: 'medicine', label: '医療', weight: 1.2 },
    { code: 'technology', label: 'テクノロジー', weight: 1.4 },
    { code: 'business', label: 'ビジネス', weight: 1.3 },
    { code: 'politics', label: '政治', weight: 1.0 },
    { code: 'education', label: '教育', weight: 1.2 },
    { code: 'history', label: '歴史', weight: 1.0 },
    { code: 'environment', label: '環境', weight: 1.4 },
    { code: 'arts', label: '芸術', weight: 0.9 },
    { code: 'psychology', label: '心理学', weight: 1.1 },
    { code: 'globalization', label: 'グローバル化', weight: 1.2 },
    { code: 'innovation', label: 'イノベーション', weight: 1.3 }
  ],
  
  '1': [
    { code: 'education', label: '教育', weight: 1.2 },
    { code: 'science', label: '科学', weight: 1.3 },
    { code: 'technology', label: 'テクノロジー', weight: 1.4 },
    { code: 'business', label: 'ビジネス', weight: 1.3 },
    { code: 'medicine', label: '医療', weight: 1.2 },
    { code: 'environment', label: '環境', weight: 1.4 },
    { code: 'society', label: '社会', weight: 1.3 },
    { code: 'culture', label: '文化', weight: 1.1 },
    { code: 'economics', label: '経済', weight: 1.2 },
    { code: 'international-relations', label: '国際関係', weight: 1.1 },
    { code: 'ethics', label: '倫理', weight: 1.0 },
    { code: 'philosophy', label: '哲学', weight: 0.9 }
  ]
};

interface TopicArea {
  code: string;
  label: string;
  weight: number; // 選択確率の重み
}

/**
 * 重み付きランダムでトピックを選択
 * 直近使用したトピックは回避
 */
export function selectRandomTopic(
  grade: EikenGrade,
  recentHistory: string[] = []
): TopicArea {
  
  const topics = topicAreasByGrade[grade];
  
  // 直近使用トピックを除外
  const available = topics.filter(t => !recentHistory.includes(t.code));
  
  if (available.length === 0) {
    // 全トピック使用済みの場合はリセット
    return weightedRandom(topics);
  }
  
  return weightedRandom(available);
}

function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) {
      return item;
    }
  }
  
  return items[items.length - 1];
}
```

### トピック使用履歴管理

```sql
-- トピック使用履歴テーブル
CREATE TABLE IF NOT EXISTS eiken_topic_usage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,
    topic_code TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    used_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (grade IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')),
    FOREIGN KEY (question_id) REFERENCES eiken_generated_questions(id) ON DELETE CASCADE
);

CREATE INDEX idx_topic_usage_grade_recent 
    ON eiken_topic_usage_history(grade, used_at DESC);
```

### 実装タスク

```typescript
const PHASE2_TASKS = [
  {
    id: 'P2-1',
    task: 'トピック分野定義ファイル作成',
    file: 'src/eiken/data/topic-areas.ts',
    priority: 'HIGH',
    estimatedHours: 3
  },
  {
    id: 'P2-2',
    task: 'トピック使用履歴テーブル追加',
    file: 'migrations/0010_create_topic_usage_history.sql',
    priority: 'MEDIUM',
    estimatedHours: 1
  },
  {
    id: 'P2-3',
    task: '重み付きランダム選択ロジック実装',
    file: 'src/eiken/data/topic-areas.ts',
    priority: 'HIGH',
    estimatedHours: 2
  },
  {
    id: 'P2-4',
    task: '問題生成時のトピック統合',
    file: 'src/eiken/services/question-generator.ts',
    priority: 'HIGH',
    estimatedHours: 2
  },
  {
    id: 'P2-5',
    task: 'ユニットテスト',
    file: 'tests/topic-selection.test.ts',
    priority: 'MEDIUM',
    estimatedHours: 2
  }
];

// 合計見積: 10時間（約1.5営業日）
```

---

## 🗣️ Phase 3: 問題形式の多様化（簡単な形式から）

### 目標
空所補充以外の問題形式を段階的に追加する。

### 実装順序

#### 3-1. 会話文空所補充（最も簡単）

```typescript
// src/eiken/services/conversation-generator.ts

export interface ConversationQuestion extends GeneratedQuestion {
  conversationType: 'daily' | 'phone' | 'shopping' | 'direction';
  speakers: string[];
}

async function generateConversationQuestion(
  request: QuestionGenerationRequest,
  env: EikenEnv
): Promise<ConversationQuestion> {
  
  const topic = selectRandomTopic(request.grade);
  const targetCEFR = getTargetCEFR(request.grade);
  
  const prompt = `
Generate a CONVERSATION fill-in-the-blank question for Eiken Grade ${request.grade}.

Requirements:
- Topic: ${topic.label}
- CEFR Level: ${targetCEFR}
- Create a realistic dialogue between 2-3 people
- Insert ( ) blank in a natural conversation point
- Test appropriate language functions (greeting, asking, suggesting, etc.)
- Provide 4 choices that fit grammatically but only one fits contextually

Format:
Speaker A: [First speaker's line]
Speaker B: [Second speaker's line with ( ) blank]
Speaker A: [Response]

Output JSON:
{
  "speakers": ["A", "B"],
  "conversation_type": "daily",
  "question_text": "Full conversation with ( ) blank",
  "choices": ["option1", "option2", "option3", "option4"],
  "correct_answer_index": 0,
  "explanation": "Why this answer is correct",
  "explanation_ja": "正解の理由",
  "translation_ja": "会話の日本語訳"
}
  `.trim();
  
  // OpenAI API呼び出し（既存の generateSingleQuestion を流用）
  // ...
}
```

#### 3-2. 語順整序問題（3級以下）

```typescript
// src/eiken/services/reorder-generator.ts

export interface ReorderQuestion {
  questionNumber: number;
  japaneseSentence: string;
  englishWords: string[];
  correctOrder: number[];
  extraWordIndex: number;
  explanation: string;
  explanationJa: string;
  difficulty: number;
}

async function generateReorderQuestion(
  request: QuestionGenerationRequest,
  env: EikenEnv
): Promise<ReorderQuestion> {
  
  // 3級以下のみ対応
  if (!['5', '4', '3'].includes(request.grade)) {
    throw new Error('Reorder questions are only for grades 5, 4, and 3');
  }
  
  const topic = selectRandomTopic(request.grade);
  const targetCEFR = getTargetCEFR(request.grade);
  
  const prompt = `
Generate a SENTENCE ORDERING question for Eiken Grade ${request.grade}.

Requirements:
- Topic: ${topic.label}
- CEFR Level: ${targetCEFR}
- Provide a Japanese sentence to translate
- Give 5-6 English word/phrase cards in random order
- One card is extra (not needed)
- Student must select 4 cards and arrange them correctly

Example:
Japanese: 「彼は昨日公園で犬と遊んでいました。」
Cards: [1. playing  2. in the park  3. with his dog  4. yesterday  5. was  6. has been]
Correct order: 5 → 1 → 2 → 3 (cards 5, 1, 2, 3)
Extra card: 6

Output JSON:
{
  "japanese_sentence": "日本語の文",
  "english_words": ["word1", "word2", "word3", "word4", "word5", "word6"],
  "correct_order": [4, 0, 1, 2],
  "extra_word_index": 5,
  "explanation": "Grammar explanation",
  "explanation_ja": "文法説明"
}
  `.trim();
  
  // ...
}
```

### 実装タスク

```typescript
const PHASE3_TASKS = [
  {
    id: 'P3-1',
    task: '会話文生成サービス実装',
    file: 'src/eiken/services/conversation-generator.ts',
    priority: 'HIGH',
    estimatedHours: 4
  },
  {
    id: 'P3-2',
    task: '語順整序生成サービス実装',
    file: 'src/eiken/services/reorder-generator.ts',
    priority: 'HIGH',
    estimatedHours: 4
  },
  {
    id: 'P3-3',
    task: 'QuestionType型定義拡張',
    file: 'src/eiken/types.ts',
    priority: 'HIGH',
    estimatedHours: 1
  },
  {
    id: 'P3-4',
    task: 'スキーマ拡張（問題形式対応）',
    file: 'migrations/0011_extend_question_types.sql',
    priority: 'MEDIUM',
    estimatedHours: 2
  },
  {
    id: 'P3-5',
    task: 'ユニットテスト',
    file: 'tests/conversation-reorder.test.ts',
    priority: 'MEDIUM',
    estimatedHours: 3
  }
];

// 合計見積: 14時間（約2営業日）
```

---

## 📝 Phase 4: 2024年度リニューアル対応

### 目標
ライティング問題（要約・Eメール）と自動採点システムを実装する。

### 4-1. ライティング問題生成

#### 要約問題（準1級・2級）

```typescript
// src/eiken/services/writing-summary-generator.ts

export interface SummaryWritingTask {
  passage: string;
  passageWordCount: number;
  instruction: string;
  wordLimit: { min: number; max: number };
  rubric: ScoringRubric;
  topic: string;
  difficulty: number;
}

async function generateSummaryTask(
  grade: '2' | 'pre1',
  env: EikenEnv
): Promise<SummaryWritingTask> {
  
  const topic = selectRandomTopic(grade);
  const wordLimit = grade === 'pre1' 
    ? { min: 45, max: 55 } 
    : { min: 60, max: 70 };
  
  const passageLength = grade === 'pre1' ? '90-120' : '90-120';
  
  const prompt = `
Generate a SUMMARY writing task for Eiken Grade ${grade}.

Requirements:
- Provide a ${passageLength} word English passage on topic: ${topic.label}
- The passage should present 2-3 main points clearly
- Ask the examinee to summarize in ${wordLimit.min}-${wordLimit.max} words
- Topic should be appropriate for ${grade === 'pre1' ? 'Pre-1' : 'Grade 2'} level

Output JSON:
{
  "passage": "Original English passage (${passageLength} words)",
  "passage_word_count": 100,
  "instruction": "Task instruction in Japanese",
  "word_limit": { "min": ${wordLimit.min}, "max": ${wordLimit.max} },
  "main_points": ["point1", "point2", "point3"],
  "sample_answer": "Example summary (for reference only, not shown to students)",
  "topic": "${topic.code}"
}
  `.trim();
  
  // OpenAI API呼び出し
  // ...
}
```

#### Eメール問題（準2級・3級）

```typescript
// src/eiken/services/writing-email-generator.ts

export interface EmailWritingTask {
  situation: string;
  receivedEmail: string;
  requiredPoints: string[];
  instruction: string;
  rubric: ScoringRubric;
  topic: string;
}

async function generateEmailTask(
  grade: '3' | 'pre2',
  env: EikenEnv
): Promise<EmailWritingTask> {
  
  const topic = selectRandomTopic(grade);
  
  const prompt = `
Generate an EMAIL writing task for Eiken Grade ${grade}.

Requirements:
- Create a realistic situation where the student receives an email
- The email should be from a friend, teacher, or acquaintance
- Provide 2 required points that must be included in the reply
- Task should be appropriate for ${grade === 'pre2' ? 'Pre-2' : 'Grade 3'} level

Output JSON:
{
  "situation": "Situation description in Japanese",
  "received_email": "Email content in English",
  "sender_name": "Name of the sender",
  "required_points": [
    "Point 1 that must be included in the reply",
    "Point 2 that must be included in the reply"
  ],
  "instruction": "Task instruction in Japanese",
  "sample_answer": "Example reply (for reference only)",
  "topic": "${topic.code}"
}
  `.trim();
  
  // ...
}
```

### 4-2. 自動採点システム

**採用方針**: Gemini提案の「ルーブリック明示型」+ ChatGPT提案の「根拠抽出→採点」

```typescript
// src/eiken/services/writing-scorer.ts

export interface ScoringRubric {
  criteria: ScoringCriterion[];
  totalScore: number;
}

export interface ScoringCriterion {
  name: string;
  nameEn: string;
  maxScore: number;
  description: string;
  levels: Record<number, string>;
}

export interface ScoringResult {
  scores: Record<string, number>;
  totalScore: number;
  maxScore: number;
  feedback: Record<string, string>;
  evidence: Record<string, string>;
  confidence: number;
}

// ルーブリック定義
export const WRITING_RUBRICS: Record<string, ScoringRubric> = {
  opinion: {
    criteria: [
      {
        name: '内容',
        nameEn: 'Content',
        maxScore: 4,
        description: '課題で求められている内容が含まれているか',
        levels: {
          4: '課題の要求を十分満たしている',
          3: 'ほぼ満たしているが一部不足',
          2: '課題の要求の一部しか満たしていない',
          1: '課題の要求をほとんど満たしていない',
          0: '答案なし'
        }
      },
      {
        name: '構成',
        nameEn: 'Coherence',
        maxScore: 4,
        description: '英文の構成や流れがわかりやすく論理的か',
        levels: {
          4: '論理的な構成で、流れがスムーズ',
          3: '概ね論理的だが、一部不明瞭',
          2: '構成が不十分で、流れが悪い',
          1: '構成がほとんどない',
          0: '答案なし'
        }
      },
      {
        name: '語彙',
        nameEn: 'Vocabulary',
        maxScore: 4,
        description: '課題に相応しい語彙を正しく使えているか',
        levels: {
          4: '豊富で適切な語彙を使用',
          3: '概ね適切だが、一部不適切',
          2: '語彙が限定的または不適切',
          1: '語彙が非常に限定的',
          0: '答案なし'
        }
      },
      {
        name: '文法',
        nameEn: 'Grammar',
        maxScore: 4,
        description: '文構造のバリエーションやそれらを正しく使えているか',
        levels: {
          4: '多様な文構造を正確に使用',
          3: '概ね正確だが、一部誤りあり',
          2: '文法エラーが目立つ',
          1: '文法エラーが非常に多い',
          0: '答案なし'
        }
      }
    ],
    totalScore: 16
  },
  
  summary: {
    criteria: [
      {
        name: '内容',
        nameEn: 'Content',
        maxScore: 4,
        description: '文章の要点を捉えているか',
        levels: {
          4: '主要な要点をすべて含む',
          3: 'ほとんどの要点を含むが一部欠落',
          2: '要点の一部のみ',
          1: '要点をほとんど捉えていない',
          0: '答案なし'
        }
      },
      {
        name: '構成',
        nameEn: 'Coherence',
        maxScore: 4,
        description: '論理の流れがわかりやすく一貫性があるか',
        levels: {
          4: '論理的で一貫性のある要約',
          3: '概ね一貫しているが一部不明瞭',
          2: '論理の流れが不十分',
          1: 'ほとんど一貫性がない',
          0: '答案なし'
        }
      },
      {
        name: '語彙',
        nameEn: 'Vocabulary',
        maxScore: 4,
        description: '適切な語彙を使用しているか',
        levels: {
          4: '適切で多様な語彙',
          3: '概ね適切だが一部不適切',
          2: '語彙が限定的',
          1: '語彙が非常に限定的',
          0: '答案なし'
        }
      },
      {
        name: '文法',
        nameEn: 'Grammar',
        maxScore: 4,
        description: '正確に文法を使用しているか',
        levels: {
          4: '文法エラーがほとんどない',
          3: '軽微な文法エラー',
          2: '文法エラーが目立つ',
          1: '文法エラーが非常に多い',
          0: '答案なし'
        }
      }
    ],
    totalScore: 16
  },
  
  email: {
    criteria: [
      {
        name: '内容',
        nameEn: 'Content',
        maxScore: 4,
        description: '指定された2つのポイントが含まれているか',
        levels: {
          4: '2つのポイントを十分に記述',
          3: '2つのポイントを含むが一部不足',
          2: '1つのポイントのみ、または不十分',
          1: 'ポイントがほとんど含まれていない',
          0: '答案なし'
        }
      },
      {
        name: '構成',
        nameEn: 'Coherence',
        maxScore: 4,
        description: 'Eメールの形式が適切で、流れが自然か',
        levels: {
          4: '適切な形式で自然な流れ',
          3: '概ね適切だが一部不自然',
          2: '形式や流れが不十分',
          1: 'ほとんど適切でない',
          0: '答案なし'
        }
      },
      {
        name: '語彙',
        nameEn: 'Vocabulary',
        maxScore: 4,
        description: 'Eメールに適した語彙を使用しているか',
        levels: {
          4: '適切で自然な語彙',
          3: '概ね適切だが一部不適切',
          2: '語彙が限定的または不適切',
          1: '語彙が非常に限定的',
          0: '答案なし'
        }
      },
      {
        name: '文法',
        nameEn: 'Grammar',
        maxScore: 4,
        description: '文法的に正しい英文が書けているか',
        levels: {
          4: '文法エラーがほとんどない',
          3: '軽微な文法エラー',
          2: '文法エラーが目立つ',
          1: '文法エラーが非常に多い',
          0: '答案なし'
        }
      }
    ],
    totalScore: 16
  }
};

/**
 * ライティング自動採点（2段階方式）
 */
export async function scoreWriting(
  answer: string,
  task: SummaryWritingTask | EmailWritingTask,
  rubricType: 'opinion' | 'summary' | 'email',
  env: EikenEnv
): Promise<ScoringResult> {
  
  const rubric = WRITING_RUBRICS[rubricType];
  
  // Step 1: 根拠抽出（各基準ごとに該当箇所を引用）
  const evidencePrompt = buildEvidenceExtractionPrompt(answer, task, rubric);
  const evidenceResponse = await callOpenAI(evidencePrompt, env.OPENAI_API_KEY);
  const evidence = JSON.parse(evidenceResponse);
  
  // Step 2: 採点（根拠に基づいて点数付与）
  const scoringPrompt = buildScoringPrompt(answer, task, rubric, evidence);
  const scoringResponse = await callOpenAI(scoringPrompt, env.OPENAI_API_KEY);
  const scoring = JSON.parse(scoringResponse);
  
  return {
    scores: scoring.scores,
    totalScore: Object.values(scoring.scores).reduce((a: number, b: number) => a + b, 0) as number,
    maxScore: rubric.totalScore,
    feedback: scoring.feedback,
    evidence: evidence,
    confidence: scoring.confidence || 0.8
  };
}

function buildEvidenceExtractionPrompt(
  answer: string,
  task: any,
  rubric: ScoringRubric
): string {
  return `
You are an EIKEN writing examiner. Extract evidence from the student's answer for each scoring criterion.

# Rubric
${JSON.stringify(rubric.criteria, null, 2)}

# Task
${JSON.stringify(task, null, 2)}

# Student's Answer
${answer}

# Your Task
For each criterion, extract specific quotes from the student's answer that demonstrate their performance.

Output JSON:
{
  "content": "Quote demonstrating content quality",
  "coherence": "Quote demonstrating coherence",
  "vocabulary": "Quote demonstrating vocabulary usage",
  "grammar": "Quote demonstrating grammar usage"
}
  `.trim();
}

function buildScoringPrompt(
  answer: string,
  task: any,
  rubric: ScoringRubric,
  evidence: Record<string, string>
): string {
  return `
You are an EIKEN writing examiner. Score the student's answer based on the rubric and extracted evidence.

# Rubric
${JSON.stringify(rubric, null, 2)}

# Task
${JSON.stringify(task, null, 2)}

# Student's Answer
${answer}

# Extracted Evidence
${JSON.stringify(evidence, null, 2)}

# Your Task
Score each criterion (0-4 points) based on the rubric levels.
Provide specific feedback for each criterion in Japanese.

Output JSON:
{
  "scores": {
    "content": 3,
    "coherence": 4,
    "vocabulary": 2,
    "grammar": 3
  },
  "feedback": {
    "content": "要約のポイントAは含まれていましたが、Bが不足していました。",
    "coherence": "論理的な流れで、接続詞も適切に使われています。",
    "vocabulary": "「good」や「nice」の多用が見られます。代わりに「effective」や「suitable」などの語彙も使ってみましょう。",
    "grammar": "時制の使い方は概ね正確です。ただし、3箇所で冠詞の誤りがあります。"
  },
  "confidence": 0.85
}
  `.trim();
}
```

### 実装タスク

```typescript
const PHASE4_TASKS = [
  {
    id: 'P4-1',
    task: '要約問題生成サービス実装',
    file: 'src/eiken/services/writing-summary-generator.ts',
    priority: 'HIGH',
    estimatedHours: 6
  },
  {
    id: 'P4-2',
    task: 'Eメール問題生成サービス実装',
    file: 'src/eiken/services/writing-email-generator.ts',
    priority: 'HIGH',
    estimatedHours: 5
  },
  {
    id: 'P4-3',
    task: 'ルーブリック定義',
    file: 'src/eiken/data/writing-rubrics.ts',
    priority: 'CRITICAL',
    estimatedHours: 3
  },
  {
    id: 'P4-4',
    task: '自動採点サービス実装（2段階方式）',
    file: 'src/eiken/services/writing-scorer.ts',
    priority: 'CRITICAL',
    estimatedHours: 8
  },
  {
    id: 'P4-5',
    task: 'ライティングテーブル拡張',
    file: 'migrations/0012_extend_writing_system.sql',
    priority: 'HIGH',
    estimatedHours: 2
  },
  {
    id: 'P4-6',
    task: '採点精度検証（人間評価との比較）',
    file: 'tests/writing-scorer-accuracy.test.ts',
    priority: 'HIGH',
    estimatedHours: 6,
    notes: '目標: 80%以上の一致率'
  }
];

// 合計見積: 30時間（約4営業日）
```

---

## 📚 Phase 5: 長文読解問題（最も複雑）

### 目標
長文パッセージ + 内容一致問題を高品質に生成する。

### 採用方針: Chain of Generation（3段階生成）

**根拠**: 3つのAIがすべて推奨。品質向上のメリットがコスト増を上回る。

```typescript
// src/eiken/services/reading-comprehension-generator.ts

export interface ReadingComprehensionSet {
  passage: string;
  wordCount: number;
  passageType: 'expository' | 'narrative' | 'argumentative';
  questions: ReadingQuestion[];
  topic: string;
  difficulty: number;
}

export interface ReadingQuestion {
  questionNumber: number;
  questionText: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
  explanationJa: string;
  evidenceQuote: string;
  questionType: 'main_idea' | 'detail' | 'inference' | 'vocabulary_in_context';
}

/**
 * Chain of Generation: 3段階で長文問題セットを生成
 */
export class ChainedReadingGenerator {
  
  /**
   * Step 1: パッセージ生成
   */
  static async generatePassage(
    grade: EikenGrade,
    topic: string,
    wordCount: number,
    env: EikenEnv
  ): Promise<string> {
    
    const targetCEFR = getTargetCEFR(grade);
    
    const prompt = `
Generate a reading comprehension passage for Eiken Grade ${grade}.

Topic: ${topic}
Word count: ${wordCount} words
CEFR Level: ${targetCEFR}

**IMPORTANT**: 
- This passage will be used to create 3 content-based questions later
- Include 3 or more clear main points
- Place important information in each paragraph
- Use natural, authentic language appropriate for the level

Output: Plain text passage only (no JSON, no extra formatting)
    `.trim();
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an EIKEN passage writer.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      }),
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
  }
  
  /**
   * Step 2: 質問と正答の生成
   */
  static async generateQuestionsWithAnswers(
    passage: string,
    questionCount: number,
    env: EikenEnv
  ): Promise<QuestionDraft[]> {
    
    const prompt = `
Create ${questionCount} content-based questions for this passage.

# Passage
${passage}

# Requirements
For each question, provide:
1. Question text
2. Quote from the passage that supports the answer
3. Correct answer text (not the full choice yet)
4. Question type (main_idea, detail, inference, vocabulary_in_context)

# Output Format (JSON array)
[
  {
    "question_number": 1,
    "question_text": "What is the main purpose of this passage?",
    "evidence_quote": "Quote from the passage",
    "correct_answer_text": "Text of the correct choice",
    "question_type": "main_idea"
  },
  {
    "question_number": 2,
    ...
  }
]

**IMPORTANT**: 
- Questions must be answerable from the passage
- Provide evidence_quote to justify the answer
    `.trim();
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an EIKEN question writer.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' }
      }),
    });
    
    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    return Array.isArray(result) ? result : result.questions || [];
  }
  
  /**
   * Step 3: 誤答選択肢（Distractor）の生成
   */
  static async generateDistractors(
    passage: string,
    question: QuestionDraft,
    env: EikenEnv
  ): Promise<string[]> {
    
    const prompt = `
This is a reading comprehension question with a pre-determined correct answer.

# Passage
${passage}

# Question
${question.question_text}

# Correct Answer (FIXED)
${question.correct_answer_text}

# Your Task
Generate 3 INCORRECT but plausible answer choices (distractors).

# Good Distractor Criteria
1. Grammatically correct
2. Seems plausible at first glance
3. BUT contradicts the passage content
4. Exploits common student errors (partially correct, easily confused, etc.)

# Output Format (JSON)
{
  "distractors": [
    "Incorrect choice 1",
    "Incorrect choice 2",
    "Incorrect choice 3"
  ],
  "rationale": {
    "1": "Why this is incorrect",
    "2": "Why this is incorrect",
    "3": "Why this is incorrect"
  }
}
    `.trim();
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in creating plausible but incorrect answer choices.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      }),
    });
    
    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    return result.distractors;
  }
  
  /**
   * 完全なワークフロー
   */
  static async generateCompleteReadingSet(
    grade: EikenGrade,
    topic: string,
    questionCount: number,
    env: EikenEnv
  ): Promise<ReadingComprehensionSet> {
    
    console.log('📖 Step 1: Generating passage...');
    const passage = await this.generatePassage(
      grade,
      topic,
      this.getWordCount(grade),
      env
    );
    
    console.log('❓ Step 2: Generating questions with answers...');
    const questionDrafts = await this.generateQuestionsWithAnswers(
      passage,
      questionCount,
      env
    );
    
    console.log('🎭 Step 3: Generating distractors (parallel)...');
    const questions = await Promise.all(
      questionDrafts.map(async (draft, index) => {
        const distractors = await this.generateDistractors(passage, draft, env);
        
        // 正解と誤答をシャッフル
        const allChoices = [draft.correct_answer_text, ...distractors];
        const shuffled = this.shuffle(allChoices);
        const correctIndex = shuffled.indexOf(draft.correct_answer_text);
        
        return {
          questionNumber: index + 1,
          questionText: draft.question_text,
          choices: shuffled,
          correctAnswerIndex: correctIndex,
          explanation: `根拠: ${draft.evidence_quote}`,
          explanationJa: `この問題の答えは、本文の「${draft.evidence_quote}」という記述から導かれます。`,
          evidenceQuote: draft.evidence_quote,
          questionType: draft.question_type
        };
      })
    );
    
    return {
      passage,
      wordCount: passage.split(/\s+/).length,
      questions,
      passageType: 'expository',
      topic,
      difficulty: 0.5
    };
  }
  
  private static shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  
  private static getWordCount(grade: EikenGrade): number {
    const counts: Record<string, number> = {
      '5': 60,
      '4': 100,
      '3': 150,
      'pre2': 220,
      '2': 300,
      'pre1': 400,
      '1': 550
    };
    return counts[grade] || 300;
  }
}

interface QuestionDraft {
  question_number: number;
  question_text: string;
  evidence_quote: string;
  correct_answer_text: string;
  question_type: string;
}
```

### コスト試算

```typescript
const READING_COMP_COST_ESTIMATE = {
  step1_passage: {
    model: 'gpt-4o',
    inputTokens: 500,
    outputTokens: 400,  // 300語パッセージ
    costUSD: (500 * 2.50 + 400 * 10.00) / 1_000_000  // $0.005
  },
  step2_questions: {
    model: 'gpt-4o',
    inputTokens: 900,  // パッセージ + プロンプト
    outputTokens: 400,  // 3問の質問+正答
    costUSD: (900 * 2.50 + 400 * 10.00) / 1_000_000  // $0.006
  },
  step3_distractors: {
    model: 'gpt-4o',
    calls: 3,  // 各質問ごと
    inputTokensPerCall: 1000,
    outputTokensPerCall: 150,
    costUSD: 3 * ((1000 * 2.50 + 150 * 10.00) / 1_000_000)  // $0.012
  },
  total: 0.023  // 約$0.023/セット
};

// 100セット生成: $2.30
// 1000セット生成: $23.00
// → 許容範囲内、品質向上のメリットが大きい
```

### 実装タスク

```typescript
const PHASE5_TASKS = [
  {
    id: 'P5-1',
    task: 'Passages テーブル作成',
    file: 'migrations/0013_create_passages_table.sql',
    priority: 'HIGH',
    estimatedHours: 2
  },
  {
    id: 'P5-2',
    task: 'Chain of Generation実装（3段階）',
    file: 'src/eiken/services/reading-comprehension-generator.ts',
    priority: 'CRITICAL',
    estimatedHours: 10
  },
  {
    id: 'P5-3',
    task: '一貫性検証ロジック',
    file: 'src/eiken/services/reading-validator.ts',
    priority: 'HIGH',
    estimatedHours: 4,
    notes: '代名詞解消チェック、時制一貫性検証'
  },
  {
    id: 'P5-4',
    task: 'ユニットテスト（品質検証）',
    file: 'tests/reading-comprehension.test.ts',
    priority: 'HIGH',
    estimatedHours: 5
  },
  {
    id: 'P5-5',
    task: 'パフォーマンステスト',
    file: 'tests/reading-performance.test.ts',
    priority: 'MEDIUM',
    estimatedHours: 3,
    notes: 'API呼び出し時間、並列化効果測定'
  }
];

// 合計見積: 24時間（約3営業日）
```

---

## 🛠️ 共通改善タスク

### プロンプトビルダーシステム

**採用方針**: Gemini提案の「Prompt Builder パターン」

```typescript
// 新ファイル: src/eiken/services/prompt-builder.ts

export class PromptBuilder {
  
  private baseSystem: string;
  private constraints: string[] = [];
  private instructions: string[] = [];
  private examples: string[] = [];
  
  constructor(questionType: QuestionType) {
    this.baseSystem = BASE_SYSTEM_PROMPTS[questionType];
  }
  
  addConstraint(constraint: string): this {
    this.constraints.push(constraint);
    return this;
  }
  
  addGradeConstraints(grade: EikenGrade): this {
    const gradeInfo = GRADE_CONSTRAINTS[grade];
    this.constraints.push(`CEFR Level: ${gradeInfo.cefrLevel}`);
    this.constraints.push(`Vocabulary: ${gradeInfo.vocabRange.min}-${gradeInfo.vocabRange.max} words`);
    this.constraints.push(`Grammar Focus: ${gradeInfo.grammarPoints.join(', ')}`);
    return this;
  }
  
  addTopicConstraints(topic: TopicArea): this {
    this.constraints.push(`Topic: ${topic.label}`);
    return this;
  }
  
  addInstruction(instruction: string): this {
    this.instructions.push(instruction);
    return this;
  }
  
  addExample(example: string): this {
    this.examples.push(example);
    return this;
  }
  
  build(): { system: string; user: string } {
    const systemPrompt = `
${this.baseSystem}

# Constraints
${this.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

${this.instructions.length > 0 ? `# Instructions\n${this.instructions.join('\n')}` : ''}

${this.examples.length > 0 ? `# Examples\n${this.examples.join('\n\n')}` : ''}
    `.trim();
    
    return {
      system: systemPrompt,
      user: this.buildUserPrompt()
    };
  }
  
  private buildUserPrompt(): string {
    return 'Generate the question according to the specifications above.';
  }
}

// 使用例
const prompt = new PromptBuilder('gap-fill')
  .addGradeConstraints('2')
  .addTopicConstraints(selectRandomTopic('2'))
  .addConstraint('Focus on passive voice')
  .addInstruction('Ensure all choices are grammatically valid')
  .build();
```

### プロンプトバージョン管理

```sql
-- プロンプトテンプレートテーブル
CREATE TABLE IF NOT EXISTS eiken_prompt_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_version TEXT NOT NULL UNIQUE,  -- 'v1.0.0', 'v1.1.0'
    question_type TEXT NOT NULL,
    template_text TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    activated_at TEXT,
    performance_metrics TEXT,  -- JSON: 採用率、品質スコア等
    CHECK (is_active IN (0, 1)),
    CHECK (json_valid(performance_metrics) OR performance_metrics IS NULL)
);

CREATE INDEX idx_prompt_templates_active 
    ON eiken_prompt_templates(question_type, is_active);
```

---

## 📊 総合実装スケジュール

| Phase | 内容 | 見積工数 | 優先度 | 開始条件 |
|---|---|---|---|---|
| **Phase 1** | 語彙レベル管理 | 23時間（3日） | 🔥 CRITICAL | なし |
| **Phase 2** | トピック分野管理 | 10時間（1.5日） | ⚠️ HIGH | Phase 1完了後 |
| **Phase 3** | 問題形式多様化 | 14時間（2日） | ⚠️ HIGH | Phase 2完了後 |
| **Phase 4** | 2024年度対応 | 30時間（4日） | ⚠️ HIGH | Phase 3完了後 |
| **Phase 5** | 長文読解 | 24時間（3日） | 📌 MEDIUM | Phase 4完了後 |
| **共通改善** | プロンプトビルダー | 8時間（1日） | 📌 MEDIUM | Phase 1と並行可 |

**合計見積**: 109時間（約14営業日）

### クリティカルパス

```
Phase 1 (語彙管理) [3日]
  ↓
Phase 2 (トピック) [1.5日]
  ↓
Phase 3 (会話・整序) [2日]
  ↓
Phase 4 (ライティング) [4日]
  ↓
Phase 5 (長文読解) [3日]
  ↓
統合テスト・調整 [2日]
  ↓
本番デプロイ
```

---

## 🎯 実装の判断基準

### すべて技術的に実現可能 ✅

| 機能 | 実現可能性 | 推奨実装 | 注意点 |
|---|---|---|---|
| 語彙管理 | ✅ 100% | CEFR-J + SVL統合 + Lemmatization | compromise使用（Workers互換） |
| Chain of Generation | ✅ 100% | 3ステップ生成 | コスト増（$0.023/セット）は許容範囲 |
| 自動採点 | ✅ 95% | AI採点 + 人間レビュー併用 | 80%一致率達成可能 |
| JSON Payload | ⚠️ 70% | ハイブリッド推奨 | 完全JSON化は避ける |

---

## 🔧 技術的推奨事項

### 採用すべきアイデア ✅

1. ✅ **CEFR-J + SVL 12000の統合**（Claude提案）
2. ✅ **Lemmatization with compromise**（Claude提案、Workers対応）
3. ✅ **Chain of Generation**（Gemini/ChatGPT/Genspark、品質重視）
4. ✅ **3%閾値での語彙検証**（Gemini提案）
5. ✅ **PromptBuilder パターン**（全AI一致）
6. ✅ **ルーブリック明示型採点**（全AI一致）
7. ✅ **正規化スキーマ + metadata拡張**（既存方針 + 柔軟性）

### 避けるべきアイデア ❌

1. ❌ **完全JSON Payload方式**（検索性・型安全性が犠牲）
2. ❌ **1回のAPI呼び出しで長文+設問**（品質が低下）

---

## 📚 次のステップ

### 即座に開始できるタスク

```bash
# 1. 依存関係のインストール
npm install compromise

# 2. 語彙辞書データの準備
# - CEFR-J データソースの確認
# - SVL 12000 ライセンス確認
# - NGSL/NAWL データ取得

# 3. マイグレーション準備
# - migrations/0009_create_vocabulary_lexicon.sql 作成

# 4. テストデータ準備
# - 各級のサンプル問題（人間評価用）
# - 採点精度検証用のライティングサンプル
```

### 質問・相談事項

1. **データソースライセンス**: CEFR-J、SVL 12000の利用条件確認が必要
2. **Phase優先順位**: 提案した順序で問題ないか？別の順序を希望するか？
3. **コスト承認**: Chain of Generation のコスト増（$0.023/セット）は許容範囲か？
4. **品質基準**: 自動採点の目標一致率80%で良いか？より高い精度が必要か？

---

**このロードマップについて、ご意見・ご指示をお待ちしております！** 🚀
