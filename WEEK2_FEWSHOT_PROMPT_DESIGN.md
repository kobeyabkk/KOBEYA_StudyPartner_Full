# Week 2 Day 1-2: Few-shot Examples付き改善プロンプト設計

## 目的

語彙バリデーションシステムを活用して、適切なレベルの語彙を使った問題生成を実現する。

## 課題分析

### 現在の問題点
1. **語彙レベル違反**: Phase 1 PoCで判明した通り、生成される問題にB1-B2レベルの語彙が含まれる
2. **プロンプトの弱点**: システムプロンプトで "appropriate for the target level" と指示しているが具体性に欠ける
3. **検証のみで改善なし**: 現在は生成後に検証して却下するのみで、プロンプト改善がない

### 解決アプローチ

**Few-shot Learning with Vocabulary Constraints**
- ✅ 良い例（適切な語彙レベル）を示す
- ❌ 悪い例（語彙レベル違反）とその改善例を示す
- 📋 許容語彙リストの一部を例示
- 🎯 級ごとの具体的な語彙ガイドラインを提供

## アーキテクチャ設計

```
┌─────────────────────────────────────────────────────────────┐
│  Few-shot Prompt Builder                                    │
│                                                              │
│  1. 基本システムプロンプト                                     │
│  2. 語彙制約セクション ← 新規追加                              │
│     - CEFR-J A1語彙の特徴                                    │
│     - 許容語彙例（頻出200語から抽出）                          │
│     - 禁止パターン（B1-B2語彙の例）                           │
│  3. Few-shot Examples ← 新規追加                             │
│     - Good Example (A1語彙のみ使用)                          │
│     - Bad Example (B1-B2語彙含む)                            │
│     - Corrected Example (A1語彙に修正)                       │
│  4. 生成指示                                                  │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│  OpenAI GPT-4o                                              │
│  - Few-shot examplesから学習                                 │
│  - 語彙制約を理解                                             │
│  - 適切なレベルの問題を生成                                   │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│  Vocabulary Validation (既存)                               │
│  - 生成された問題の語彙をチェック                              │
│  - 違反があれば詳細をログ出力                                 │
│  - 却下率のモニタリング                                       │
└─────────────────────────────────────────────────────────────┘
```

## 実装計画

### Phase 1: Few-shot Examples データ準備

**ファイル**: `src/eiken/prompts/few-shot-examples.ts`

```typescript
export interface FewShotExample {
  type: 'good' | 'bad' | 'corrected';
  questionText: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  vocabularyNotes?: string;
}

export const grade5Examples: {
  grammar: FewShotExample[];
  vocabulary: FewShotExample[];
} = {
  grammar: [
    {
      type: 'good',
      questionText: "I ( ) to school every day.",
      choices: ["go", "goes", "went", "going"],
      correctIndex: 0,
      explanation: "Uses A1 vocabulary: go, school, every, day",
      vocabularyNotes: "All words are in CEFR-J A1 list"
    },
    {
      type: 'bad',
      questionText: "She ( ) delighted to receive the promotion.",
      choices: ["was", "is", "were", "be"],
      correctIndex: 0,
      explanation: "BAD: Contains B2 words 'delighted' (B2), 'receive' (B1), 'promotion' (B1)",
      vocabularyNotes: "Violates A1 vocabulary constraints"
    },
    {
      type: 'corrected',
      questionText: "She ( ) happy to get the good news.",
      choices: ["was", "is", "were", "be"],
      correctIndex: 0,
      explanation: "GOOD: Replaced with A1 words: happy, get, good, news",
      vocabularyNotes: "All words are in CEFR-J A1 list"
    }
  ],
  vocabulary: [
    // Similar structure
  ]
};
```

### Phase 2: 語彙制約プロンプトセクション

**ファイル**: `src/eiken/prompts/vocabulary-constraints.ts`

```typescript
export interface VocabularyConstraints {
  level: string;
  allowedVocabulary: string[];
  prohibitedPatterns: string[];
  guidelines: string[];
}

export const grade5Constraints: VocabularyConstraints = {
  level: "CEFR-J A1 (Eiken Grade 5)",
  allowedVocabulary: [
    // 頻出200語から抽出
    "be", "have", "go", "do", "make", "get", "see", "come", "want", "know",
    "time", "day", "year", "way", "people", "man", "woman", "child", "school", "work",
    "good", "new", "first", "last", "long", "great", "little", "old", "big", "small",
    // ... (200語)
  ],
  prohibitedPatterns: [
    "Academic vocabulary (analyze, demonstrate, evaluate)",
    "Business terms (promotion, conference, colleague)",
    "Advanced verbs (delighted, concerned, accomplished)",
    "Complex adjectives (magnificent, extraordinary, substantial)"
  ],
  guidelines: [
    "Use only simple present, past, and future tenses",
    "Avoid phrasal verbs with multiple meanings",
    "Use common everyday nouns (house, school, food, family)",
    "Stick to basic adjectives (good, bad, big, small, happy, sad)",
    "Use high-frequency verbs (go, come, make, take, give)"
  ]
};
```

### Phase 3: プロンプトビルダーの改善

**ファイル**: `src/eiken/services/question-generator.ts` (既存ファイル修正)

```typescript
import { buildFewShotPrompt } from '../prompts/few-shot-builder';

function buildSystemPrompt(
  request: QuestionGenerationRequest,
  analysisContext: any
): string {
  
  // 既存のロジック...
  
  // Few-shot examples付きプロンプトを生成
  const fewShotSection = buildFewShotPrompt(request.grade, request.section);
  
  return `${existingPrompt}

${fewShotSection}

CRITICAL VOCABULARY REQUIREMENT:
You MUST use only the vocabulary from the allowed list above.
Any word outside this list will cause the question to be rejected.

Study the examples carefully and follow the same vocabulary level.`;
}
```

### Phase 4: 動的Few-shot選択

**Advanced Feature**: 却下された問題から学習

```typescript
// 将来的な実装
export async function selectRelevantExamples(
  rejectedQuestions: RejectedQuestion[],
  targetGrammar: string
): Promise<FewShotExample[]> {
  // 最近却下された問題から学習
  // 同じ文法ポイントの成功例を優先
  // 動的にFew-shot examplesを調整
}
```

## データ準備タスク

### A1語彙リスト抽出

```sql
-- 頻出200語を抽出（既にDBに2,518語存在）
SELECT word, base_form, pos, zipf_score
FROM eiken_vocabulary_lexicon
WHERE cefr_level = 'A1'
ORDER BY zipf_score DESC
LIMIT 200;
```

### 成功例・失敗例の収集

```typescript
// テスト用データとして準備
const testQuestions = [
  {
    text: "I go to school every day.",
    result: "✅ valid",
    reason: "All A1 vocabulary"
  },
  {
    text: "She was delighted to receive the promotion.",
    result: "❌ invalid",
    reason: "B1-B2 vocabulary: delighted, receive, promotion",
    corrected: "She was happy to get the good news."
  }
];
```

## 成功指標

### Before (現状)
- 語彙違反却下率: ~30-40%
- 生成成功率: 60-70%
- 試行回数: 平均2-3回/問題

### After (目標)
- 語彙違反却下率: <10%
- 生成成功率: >90%
- 試行回数: 平均1.2回/問題

## 実装順序

1. ✅ **Step 1**: Few-shot examples データ作成 (today)
2. ✅ **Step 2**: Vocabulary constraints定義 (today)
3. ✅ **Step 3**: Few-shot prompt builder実装 (tomorrow)
4. ✅ **Step 4**: question-generator統合 (tomorrow)
5. ⏳ **Step 5**: A/Bテスト・効果測定 (Week 2 Day 3)

## 次のステップ

→ Week 2 Day 3-4: 自動リライト機能実装
- 語彙違反を検出したら自動的にA1語彙に置き換え
- GPT-4oによる自動リライトAPI
- リライト前後の品質比較
