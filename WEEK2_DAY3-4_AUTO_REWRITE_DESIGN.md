# Week 2 Day 3-4: 自動リライト機能 設計書

## 🎯 目的

語彙違反を検出した問題を、自動的にA1語彙に置き換えて修正する機能を実装し、問題生成の成功率をさらに向上させる。

## 📊 現状の課題

### Week 2 Day 1-2 完了時点
- Few-shot examples導入により語彙違反率は改善見込み（30-40% → <10%目標）
- しかし、まだ10%程度の違反が残る可能性
- 違反した問題は単純に却下される（無駄）

### 解決すべき問題
1. **生成コストの無駄**: 違反した問題を捨てるのはもったいない
2. **試行回数の増加**: 再生成には追加のAPI呼び出しとコストが必要
3. **時間的コスト**: ユーザーが待つ時間が長くなる

## 🚀 ソリューション: 自動リライト機能

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  Question Generation (GPT-4o)                               │
│  - Few-shot prompts適用済み                                  │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Vocabulary Validation (既存)                               │
│  - 2,518 A1語彙データベースでチェック                         │
│  - 違反単語リスト抽出                                         │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
                    違反あり？
                    /        \
                  YES         NO
                   ↓           ↓
┌─────────────────────────────────┐    ┌──────────────────┐
│  Auto-Rewrite (NEW!)            │    │  Accept Question │
│  - GPT-4oで自動リライト          │    └──────────────────┘
│  - 違反単語をA1語彙に置換        │
│  - 文法・意味を保持              │
└─────────────────┬───────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────┐
│  Re-validation                                              │
│  - リライト後の問題を再検証                                   │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
                    まだ違反？
                    /        \
                  YES         NO
                   ↓           ↓
            ┌──────────┐   ┌──────────────────┐
            │  Reject  │   │  Accept Question │
            └──────────┘   └──────────────────┘
```

### 期待される効果

| 指標 | Before | After (Rewrite適用) | 改善 |
|------|--------|-------------------|------|
| 語彙違反却下率 | <10% | **<2%** | 80%減 |
| 生成成功率 | >90% | **>98%** | 8%増 |
| 試行回数/問題 | 1.2回 | **1.05回** | 12%減 |
| API呼び出し | 1.2回 | **1.1回** (rewrite含む) | 8%減 |

## 📝 実装計画

### Phase 1: Rewrite Prompt設計

**ファイル**: `src/eiken/prompts/rewrite-prompts.ts`

```typescript
export interface RewriteRequest {
  originalQuestion: string;
  originalChoices: string[];
  violatedWords: string[];
  targetLevel: string;
  grammarPoint?: string;
}

export interface RewriteResult {
  rewrittenQuestion: string;
  rewrittenChoices: string[];
  correctAnswerIndex: number;
  replacements: {
    original: string;
    replacement: string;
    reason: string;
  }[];
  confidence: number; // 0.0-1.0
}

export function buildRewritePrompt(request: RewriteRequest): string {
  return `
You are an expert at rewriting English test questions to use simpler vocabulary.

TASK: Rewrite the following question to use ONLY A1 (beginner) level vocabulary.

ORIGINAL QUESTION:
"${request.originalQuestion}"

CHOICES:
${request.originalChoices.map((c, i) => `${i + 1}. ${c}`).join('\n')}

VIOLATED WORDS (must be replaced):
${request.violatedWords.join(', ')}

REQUIREMENTS:
1. Replace all violated words with A1 vocabulary equivalents
2. Keep the same grammar structure and difficulty
3. Preserve the meaning and testing point
4. Maintain naturalness and clarity
5. Keep choices parallel in structure
6. Ensure only ONE correct answer

ALLOWED A1 VOCABULARY:
Verbs: be, have, go, come, make, take, get, do, see, want, ...
Nouns: time, day, school, home, friend, family, book, ...
Adjectives: good, bad, big, small, happy, sad, old, new, ...

EXAMPLES:
❌ "She was delighted to receive the promotion."
✅ "She was happy to get the good news."

❌ "The conference will commence next week."
✅ "The party will start next week."

Return JSON:
{
  "rewritten_question": "...",
  "rewritten_choices": ["...", "...", "...", "..."],
  "correct_answer_index": 0-3,
  "replacements": [
    {
      "original": "delighted",
      "replacement": "happy",
      "reason": "simpler A1 adjective"
    }
  ],
  "confidence": 0.0-1.0
}
`;
}
```

### Phase 2: Vocabulary Rewriter Service

**ファイル**: `src/eiken/services/vocabulary-rewriter.ts`

```typescript
import type { EikenEnv } from '../types';
import type { VocabularyViolation } from '../types/vocabulary';
import { buildRewritePrompt, type RewriteRequest, type RewriteResult } from '../prompts/rewrite-prompts';

export interface RewriteOptions {
  maxAttempts?: number; // デフォルト: 2
  minConfidence?: number; // デフォルト: 0.7
  preserveGrammar?: boolean; // デフォルト: true
}

export interface RewriteResponse {
  success: boolean;
  original: {
    question: string;
    choices: string[];
  };
  rewritten: {
    question: string;
    choices: string[];
    correctAnswerIndex: number;
  };
  replacements: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
  confidence: number;
  attempts: number;
  error?: string;
}

/**
 * 語彙違反を自動修正
 */
export async function rewriteQuestion(
  originalQuestion: string,
  originalChoices: string[],
  violations: VocabularyViolation[],
  targetLevel: string,
  env: EikenEnv,
  options: RewriteOptions = {}
): Promise<RewriteResponse> {
  
  const {
    maxAttempts = 2,
    minConfidence = 0.7,
    preserveGrammar = true
  } = options;
  
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      success: false,
      original: { question: originalQuestion, choices: originalChoices },
      rewritten: { question: '', choices: [], correctAnswerIndex: 0 },
      replacements: [],
      confidence: 0,
      attempts: 0,
      error: 'OpenAI API key not configured'
    };
  }
  
  const violatedWords = violations.map(v => v.word);
  
  console.log(`🔄 Attempting to rewrite question with ${violatedWords.length} violations`);
  console.log(`   Violated words: ${violatedWords.join(', ')}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${maxAttempts}...`);
      
      // GPT-4oでリライト
      const rewriteRequest: RewriteRequest = {
        originalQuestion,
        originalChoices,
        violatedWords,
        targetLevel
      };
      
      const prompt = buildRewritePrompt(rewriteRequest);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are an expert at simplifying English text for beginners.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3, // 低めで一貫性重視
          max_tokens: 800
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      const result = JSON.parse(data.choices[0].message.content) as RewriteResult;
      
      // 信頼度チェック
      if (result.confidence < minConfidence) {
        console.log(`   ⚠️ Low confidence: ${result.confidence}, retrying...`);
        continue;
      }
      
      console.log(`   ✅ Rewrite successful (confidence: ${result.confidence})`);
      console.log(`   Replacements: ${result.replacements.map(r => `${r.original}→${r.replacement}`).join(', ')}`);
      
      return {
        success: true,
        original: { question: originalQuestion, choices: originalChoices },
        rewritten: {
          question: result.rewrittenQuestion,
          choices: result.rewrittenChoices,
          correctAnswerIndex: result.correctAnswerIndex
        },
        replacements: result.replacements,
        confidence: result.confidence,
        attempts: attempt
      };
      
    } catch (error) {
      console.error(`   ❌ Rewrite attempt ${attempt} failed:`, error);
      
      if (attempt === maxAttempts) {
        return {
          success: false,
          original: { question: originalQuestion, choices: originalChoices },
          rewritten: { question: '', choices: [], correctAnswerIndex: 0 },
          replacements: [],
          confidence: 0,
          attempts: attempt,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  }
  
  return {
    success: false,
    original: { question: originalQuestion, choices: originalChoices },
    rewritten: { question: '', choices: [], correctAnswerIndex: 0 },
    replacements: [],
    confidence: 0,
    attempts: maxAttempts,
    error: 'Max attempts reached'
  };
}

/**
 * バッチリライト（複数問題を一度に処理）
 */
export async function rewriteQuestions(
  questions: Array<{
    question: string;
    choices: string[];
    violations: VocabularyViolation[];
  }>,
  targetLevel: string,
  env: EikenEnv,
  options: RewriteOptions = {}
): Promise<RewriteResponse[]> {
  
  const results: RewriteResponse[] = [];
  
  for (const q of questions) {
    const result = await rewriteQuestion(
      q.question,
      q.choices,
      q.violations,
      targetLevel,
      env,
      options
    );
    results.push(result);
    
    // レート制限対策
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}
```

### Phase 3: Question Generator統合

**ファイル**: `src/eiken/services/question-generator.ts` (修正)

```typescript
// 既存のvalidation後に追加
if (!vocabAnalysis.isValid) {
  console.log(`❌ Vocabulary violations detected: ${vocabAnalysis.outOfRangeRatio * 100}%`);
  
  // 🆕 自動リライト試行
  console.log(`🔄 Attempting auto-rewrite...`);
  const rewriteResult = await rewriteQuestion(
    question.questionText,
    question.choices,
    vocabAnalysis.violations || [],
    request.grade,
    env,
    { maxAttempts: 2, minConfidence: 0.7 }
  );
  
  if (rewriteResult.success) {
    console.log(`✅ Auto-rewrite successful!`);
    
    // リライト後の問題を再検証
    const revalidation = await validateVocabularyWithCache(
      `${rewriteResult.rewritten.question} ${rewriteResult.rewritten.choices.join(' ')}`,
      env.DB,
      env.KV,
      { target_level: getCEFRLevel(request.grade) }
    );
    
    if (revalidation.valid) {
      console.log(`✅ Rewritten question passed validation`);
      // リライト後の問題を採用
      question.questionText = rewriteResult.rewritten.question;
      question.choices = rewriteResult.rewritten.choices;
      question.correctAnswerIndex = rewriteResult.rewritten.correctAnswerIndex;
      // 続行
    } else {
      console.log(`❌ Rewritten question still has violations, rejecting`);
      rejected++;
      continue;
    }
  } else {
    console.log(`❌ Auto-rewrite failed: ${rewriteResult.error}`);
    rejected++;
    continue;
  }
}
```

### Phase 4: REST API

**ファイル**: `src/eiken/routes/vocabulary.ts` (既存ファイルに追加)

```typescript
import { rewriteQuestion, type RewriteOptions } from '../services/vocabulary-rewriter';

// POST /api/eiken/vocabulary/rewrite
app.post('/rewrite', async (c) => {
  try {
    const body = await c.req.json<{
      question: string;
      choices: string[];
      violations: VocabularyViolation[];
      target_level: string;
      options?: RewriteOptions;
    }>();
    
    const result = await rewriteQuestion(
      body.question,
      body.choices,
      body.violations,
      body.target_level,
      c.env,
      body.options || {}
    );
    
    return c.json(result);
    
  } catch (error) {
    console.error('Rewrite error:', error);
    return c.json({
      success: false,
      error: 'Failed to rewrite question',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});
```

## 🧪 テストケース

### Test 1: Simple Vocabulary Replacement
```typescript
Input:
  Question: "She was delighted to receive the promotion."
  Violations: ["delighted" (B2), "receive" (B1), "promotion" (B1)]

Expected Output:
  Question: "She was happy to get the good news."
  Replacements: [
    { original: "delighted", replacement: "happy", reason: "simpler A1 adjective" },
    { original: "receive", replacement: "get", reason: "basic A1 verb" },
    { original: "promotion", replacement: "good news", reason: "A1 phrase" }
  ]
```

### Test 2: Grammar Preservation
```typescript
Input:
  Question: "The conference will commence next month."
  Violations: ["conference" (B1), "commence" (C1)]

Expected Output:
  Question: "The party will start next month."
  Grammar: Future tense preserved (will + base verb)
```

### Test 3: Multiple Choice Coherence
```typescript
Input:
  Question: "He demonstrated excellent ( ) skills."
  Choices: ["leadership", "management", "communication", "teamwork"]
  Violations: ["demonstrated", "excellent", "leadership", "management", ...]

Expected Output:
  Question: "He showed very good ( ) skills."
  Choices: ["leading", "planning", "talking", "teamwork"]
  Note: All choices must remain valid options
```

## 📊 評価指標

### Success Metrics
1. **Rewrite Success Rate**: >90%
2. **Post-Rewrite Validation Pass Rate**: >95%
3. **Overall Generation Success Rate**: >98%
4. **Average Confidence Score**: >0.8

### Cost Metrics
1. **API Calls per Question**: <1.1 (including rewrites)
2. **Average Tokens per Rewrite**: ~500
3. **Total Generation Time**: <5s per question

## 🔧 実装順序

### Day 3: コア機能実装
1. ✅ `rewrite-prompts.ts` - プロンプト設計
2. ✅ `vocabulary-rewriter.ts` - リライトロジック
3. ✅ 型定義追加 (`RewriteRequest`, `RewriteResult`, etc.)

### Day 4: 統合とテスト
4. ✅ `question-generator.ts` - 統合
5. ✅ REST API追加 (`/api/eiken/vocabulary/rewrite`)
6. ✅ テストスクリプト (`test-auto-rewrite.ts`)
7. ✅ ドキュメント作成

## 🎯 成功基準

- [  ] リライト成功率 >90%
- [  ] 再検証合格率 >95%
- [  ] 全体生成成功率 >98%
- [  ] API呼び出し <1.1回/問題
- [  ] 平均信頼度 >0.8
- [  ] ビルド成功
- [  ] 全テストパス

---

**実装開始**: 2025-11-12  
**目標完了**: Week 2 Day 3-4  
**次のステップ**: Week 2-3 Cron Worker実装
