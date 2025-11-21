# 語彙品質改善戦略

## 🎯 目標

**長文形式（essay, long_reading）の語彙スコアを95%以上に改善**

---

## 📊 現状分析

### 成功している形式（95%+）

| Format | Vocab Score | Word Count | Success Factors |
|--------|-------------|------------|-----------------|
| grammar_fill | 85-90% | 15-25語 | 短文、文法フォーカス、制約が強い |
| opinion_speech | 95%+ | 60-80語 | 中文、明確な指示、適切な複雑度 |
| reading_aloud | 95%+ | 50-80語 | 中文、自然な流れ、語彙制約が機能 |

### 失敗している形式（<70%）

| Format | Vocab Score | Word Count | Failure Reasons |
|--------|-------------|------------|-----------------|
| essay | 64% | 120-150語 | 長文、多様な語彙、LLMの自然な傾向 |
| long_reading | 69% | 250-300語 | 超長文、複雑な構造、制御困難 |

---

## 🔍 根本原因分析

### 1. **LLMの自然な語彙選択**
- GPT-4o-mini は自然で流暢な英語を生成しようとする
- 長文になるほど、多様で高度な語彙を使用する傾向
- Pre2レベル（CEFR A2-B1）の制約を超えやすい

### 2. **プロンプトの語彙制約が不十分**
```typescript
// 現在のプロンプト
"Use only words appropriate for ${blueprint.grade} level"
"CEFR Level: ${guidelines.vocabulary_level}"

// 問題: 抽象的すぎて、LLMが無視しやすい
```

### 3. **長文の複雑性**
- 120-150語（essay）、250-300語（long_reading）
- 多様なトピック表現が必要
- 語彙の繰り返しを避ける = 難しい単語を使う

### 4. **検証基準が厳しすぎる可能性**
- 目標: 95%の語彙適合率
- CEFRレベル分類が厳格
- 実際の英検問題では90%程度の可能性あり

---

## 💡 改善戦略（優先順位順）

### **戦略 1: LLMプロンプトの語彙制約強化** ⭐⭐⭐⭐⭐

#### A. 禁止語リストの明示
```typescript
// format-prompts.ts に追加
const FORBIDDEN_VOCABULARY_EXAMPLES = {
  pre2: [
    "sophisticated", "contemporary", "substantial", "comprehensive",
    "facilitate", "endeavor", "subsequent", "inevitable"
  ],
  // 各レベルで禁止する高度な語彙をリスト化
};

// プロンプトに追加
## STRICT Vocabulary Requirements
- ONLY use words at CEFR ${level} or below
- FORBIDDEN words for ${grade}: ${forbiddenWords.join(', ')}
- If you need a complex concept, use SIMPLE words to explain it
- Example: Instead of "facilitate" → use "help" or "make easier"
```

#### B. 許容語彙リストの提供
```typescript
// 頻出1000語リストをプロンプトに含める
## Recommended Vocabulary (SAFE to use)
Here are 50 common words appropriate for ${grade}:
${recommendedWords.join(', ')}

Try to use these words when possible.
```

#### C. 具体例の追加
```typescript
## Good Example (appropriate vocabulary):
"Many students think that studying English is important. It can help them 
get better jobs in the future. However, some students find it difficult 
because they don't have enough time to practice."

## Bad Example (too difficult):
"Numerous adolescents perceive that acquiring proficiency in English is 
essential. It can facilitate their prospects for superior employment 
opportunities. Nevertheless, certain individuals encounter challenges..."
```

---

### **戦略 2: 後処理による語彙置換** ⭐⭐⭐⭐

#### 実装概要
```typescript
// 新しいサービス: vocabulary-simplifier.ts

async function simplifyVocabulary(
  text: string,
  targetLevel: CEFRLevel,
  db: D1Database
): Promise<string> {
  // 1. 難しい単語を検出
  const difficultWords = await detectDifficultWords(text, targetLevel, db);
  
  // 2. 各単語を簡単な同義語に置換
  let simplifiedText = text;
  for (const word of difficultWords) {
    const simpler = await findSimplerSynonym(word, targetLevel, db);
    if (simpler) {
      simplifiedText = simplifiedText.replace(
        new RegExp(`\\b${word}\\b`, 'gi'),
        simpler
      );
    }
  }
  
  return simplifiedText;
}
```

#### メリット
- LLM生成後に確実に修正できる
- 語彙スコアを確実に向上させる
- 既存の生成ロジックを変更不要

#### デメリット
- 同義語データベースが必要
- 文脈を失う可能性
- 追加の処理時間

---

### **戦略 3: 語彙検証の許容度調整** ⭐⭐⭐

#### 現在の設定
```typescript
const DEFAULT_CONFIG: ValidationConfig = {
  target_level: 'A1',
  max_violation_rate: 0.05, // 5%まで許容
  strict_mode: false,
  allow_next_level: true, // A1の場合A2も許容
};
```

#### 提案
```typescript
// 長文形式専用の緩い設定
const LONG_TEXT_CONFIG: ValidationConfig = {
  target_level: 'A2', // Pre2 = A2-B1
  max_violation_rate: 0.10, // 10%まで許容（緩和）
  strict_mode: false,
  allow_next_level: true, // B1も許容
  allow_two_levels_up: true, // B2まで一部許容（新設）
};
```

#### 理由
- 実際の英検問題でも100%適合は稀
- 長文では多様な語彙が必要
- 学習効果: 少し難しい語彙も学習になる

---

### **戦略 4: Few-shot Examples の追加** ⭐⭐⭐⭐

#### 実装
```typescript
// プロンプトに成功例を追加
## Successful Examples from Our System

Here are examples that passed our vocabulary validation (95%+ score):

### Example 1 (Opinion Speech, Pre2 level):
"Do you think students should have part-time jobs while studying?

I think students should have part-time jobs because it helps them learn 
about responsibility. When they work, they need to arrive on time and 
finish their tasks properly. This is good practice for their future careers. 
Also, they can earn some money to buy things they want or need."

### Example 2 (Reading Aloud, Pre2 level):
"Lisa is planning a birthday party for her best friend. She wants to make 
it special, so she is thinking about what to prepare. First, she will bake 
a cake because her friend loves chocolate. Then, she will decorate the room 
with colorful balloons and prepare some fun games for everyone to play 
together."

IMPORTANT: Notice how these examples use SIMPLE, COMMON words that 
Pre2 students know. Your essay/passage should follow this style.
```

---

### **戦略 5: 反復リトライ with フィードバック** ⭐⭐⭐

#### 現在のロジック
```typescript
// 最大3回リトライ、同じプロンプト
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const result = await generateQuestion(blueprint);
  if (result.valid) return result;
}
```

#### 改善案
```typescript
// リトライ時に語彙違反をフィードバック
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const result = await generateQuestion(blueprint, previousViolations);
  
  if (result.valid) return result;
  
  // 次回に違反語彙を伝える
  previousViolations = result.violations.map(v => v.word);
}

// プロンプトに追加
${previousViolations.length > 0 ? `
IMPORTANT: Previous attempt used these TOO DIFFICULT words:
${previousViolations.join(', ')}

DO NOT use these words again. Find SIMPLER alternatives.
` : ''}
```

---

### **戦略 6: モデル変更** ⭐⭐

#### 現在
- `gpt-4o-mini` (コスト重視)

#### 代替案
- `gpt-4o` (より高精度、コスト3倍)
- `gpt-3.5-turbo` (より制約に従順、コスト1/3)

#### 実験
```typescript
// essay/long_readingだけgpt-4oを使用
const model = ['essay', 'long_reading'].includes(format)
  ? 'gpt-4o'
  : 'gpt-4o-mini';
```

---

## 🎯 推奨実装順序

### Phase 1: 即効性の高い改善（1-2時間）
1. ✅ **戦略1A**: 禁止語リストをプロンプトに追加
2. ✅ **戦略4**: Few-shot examples を追加
3. ✅ **戦略1C**: Good/Bad examples を明示

**期待効果**: 64% → 75-80%

---

### Phase 2: 構造的改善（3-5時間）
4. ✅ **戦略5**: 反復リトライ with フィードバック
5. ✅ **戦略1B**: 許容語彙リストの生成・提供
6. ✅ **戦略3**: 語彙検証の許容度調整（実験）

**期待効果**: 75-80% → 85-90%

---

### Phase 3: 高度な最適化（5-10時間）
7. ✅ **戦略2**: 後処理による語彙置換システム構築
8. ✅ **戦略6**: モデル変更実験（gpt-4o vs gpt-3.5-turbo）
9. ✅ 語彙データベースの再評価・調整

**期待効果**: 85-90% → 95%+

---

## 📊 成功指標

### 目標達成基準
- ✅ essay: 語彙スコア 95% 以上
- ✅ long_reading: 語彙スコア 95% 以上
- ✅ 生成成功率: 80% 以上（3回以内に成功）
- ✅ 生成時間: 120秒以内

### 測定方法
```bash
# テストスクリプト
for i in {1..10}; do
  curl -X POST "/api/eiken/questions/generate" \
    -d '{"format": "essay", "grade": "pre2"}' \
  | jq '.data.validation.vocabulary_score'
done

# 平均スコアを計算
```

---

## 🤝 他AIへの相談ポイント

### 質問1: プロンプトエンジニアリング
> 「LLMに特定のCEFRレベルの語彙のみを使用させるための最も効果的なプロンプト戦略は？」

### 質問2: 後処理アプローチ
> 「生成後に難しい語彙を自動的に簡単な同義語に置換するシステムの設計は？」

### 質問3: 語彙データベース
> 「CEFRレベル分類が厳しすぎる可能性。実際の英検Pre2レベルの許容範囲は？」

### 質問4: トレードオフ
> 「語彙の簡単さ vs 文章の自然さ。どこでバランスを取るべきか？」

---

## 📝 実装チェックリスト

- [ ] 戦略1A: 禁止語リスト実装
- [ ] 戦略1B: 許容語彙リスト実装
- [ ] 戦略1C: Good/Bad examples 追加
- [ ] 戦略4: Few-shot examples 追加
- [ ] 戦略5: フィードバックループ実装
- [ ] 戦略3: 許容度調整実験
- [ ] 戦略2: 後処理システム構築
- [ ] 戦略6: モデル変更実験
- [ ] テスト: 各形式10回ずつ生成
- [ ] 測定: 平均語彙スコア計算
- [ ] ドキュメント: 成功パターン記録

---

## 🎓 学んだこと

1. **短文は成功、長文は失敗** → 長さが語彙制御の難しさに直結
2. **LLMは自然さを優先** → 明示的な制約が必要
3. **検証基準の妥当性** → 100%達成は非現実的かも
4. **多層防御が有効** → プロンプト + 後処理 + 許容度調整

---

最終更新: 2025-11-21
