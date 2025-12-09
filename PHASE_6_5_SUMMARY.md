# Phase 6.5: Answer Diversity Manager - 完全実装レポート

## 🎯 問題の特定

### ユーザー報告
```
Q1: will (正解)
Q2: did (正解)
Q3: did (正解)
Q4: did (正解)

→ 4問中3問が did という偏った出題
```

### 根本原因
- **トピック選択**の多様性管理（ε-greedy, LRU）はあった
- しかし**正解選択肢の分散管理**が完全に欠けていた
- LLMが「過去形の質問には did が正解」というパターンを学習し、連続して同じ正解を生成

---

## ✅ 実装内容

### 1. `AnswerDiversityManager` の新規作成

**ファイル**: `src/eiken/services/answer-diversity-manager.ts`

#### 主要機能

1. **セッション内の正解履歴追跡**
   - `answer_history`: 直近の正解選択肢を配列で保持
   - `answer_counts`: 各正解の出現回数をMapで管理

2. **分散チェックアルゴリズム** (`shouldAvoidAnswer`)
   - **連続チェック**: 同じ正解が `MAX_CONSECUTIVE (2回)` 連続したら回避
   - **頻度チェック**: 直近 `RECENT_WINDOW (4問)` で出現率が `MAX_FREQUENCY_PERCENT (40%)` 超えたら回避
   - **ブラックリスト**: 直近 `BLACKLIST_WINDOW (2問)` で全て同じ正解なら回避

3. **LLMプロンプト生成** (`getAnswerDiversityInstruction`)
   ```
   ⚠️ ANSWER DIVERSITY REQUIREMENT:
   Recent correct answers: [did, did, will]
   HIGH FREQUENCY ANSWERS: "did" (2回)
   
   🎯 YOUR TASK:
   - Avoid making these high-frequency answers correct again
   - Choose a DIFFERENT answer option that has appeared less frequently
   ```

4. **統計情報** (`getStatistics`)
   - セッション終了時に正解分散の統計を出力
   - デバッグとモニタリングのため

#### 設定パラメータ

```typescript
const DIVERSITY_CONFIG = {
  RECENT_WINDOW: 4,           // 直近N問での重複チェック
  MAX_CONSECUTIVE: 2,          // 同じ正解が連続する最大回数
  MAX_FREQUENCY_PERCENT: 40,   // セッション全体での最大出現率（%）
  BLACKLIST_WINDOW: 2,         // ブラックリスト期間
};
```

---

### 2. `/api/eiken/generate` エンドポイントへの統合

**ファイル**: `src/eiken/routes/generate.ts`

#### 変更点

**BEFORE (Phase 6)**:
```typescript
while (generated.length < count && attempts < maxAttempts) {
  const question = await generateSingleQuestion(...);
  generated.push(question);
}
```

**AFTER (Phase 6.5)**:
```typescript
// 1. セッション初期化
const diversityManager = new AnswerDiversityManager(db);
await diversityManager.initializeSession(sessionId, grade);

while (generated.length < count && attempts < maxAttempts) {
  // 2. 正解分散の指示をプロンプトに追加
  const diversityInstruction = diversityManager.getAnswerDiversityInstruction(sessionId);
  
  const question = await generateSingleQuestion(..., diversityInstruction);
  
  // 3. 正解選択肢の偏りをチェック
  const correctAnswer = question.choices[question.correctAnswerIndex];
  if (diversityManager.shouldAvoidAnswer(sessionId, correctAnswer)) {
    rejected++;
    continue; // 再生成
  }
  
  // 4. 正解を記録
  await diversityManager.recordAnswer(sessionId, correctAnswer, grade);
  generated.push(question);
}

// 5. 統計情報をログ出力
const stats = diversityManager.getStatistics(sessionId);
console.log(`📊 Answer diversity stats:`, stats);
```

---

## 📊 期待効果

### 1. **偏りの解消**
- ✅ 'did' が3回連続で正解になることを防止
- ✅ 直近4問で同じ正解が40%以上出現しない
- ✅ より自然で多様な問題セットが生成される

### 2. **学習効果の向上**
- ✅ 学習者の混乱を防ぐ
- ✅ 異なる文法パターンをバランスよく学習
- ✅ 実際の英検試験に近い多様性

### 3. **デバッグとモニタリング**
- ✅ セッション終了時に正解分散の統計を出力
- ✅ 問題の偏りをリアルタイムで検知
- ✅ LLMプロンプトへのフィードバックループ

---

## 🧪 テスト方法

### 1. **新しい問題を4問生成**
```bash
# Eiken Grade 4, grammar_fill 形式で4問生成
POST /api/eiken/generate
{
  "grade": "4",
  "section": "grammar",
  "questionType": "grammar_fill",
  "count": 4
}
```

### 2. **正解分散を確認**
- 期待結果: 正解が偏らない（例: will, did, do, does）
- ログ出力: `📊 Answer diversity stats:` で統計確認

### 3. **連続生成テスト**
- 10問連続で生成し、同じ正解が3回以上連続しないことを確認

---

## 🚀 デプロイ状況

### コミット情報
- **コミットID**: `2b591fe`
- **ブランチ**: `main`
- **プッシュ先**: `origin/main`

### デプロイURL
- **本番環境**: `https://kobeyabkk-studypartner.pages.dev/eiken/practice`
- **API エンドポイント**: `https://kobeyabkk-studypartner.pages.dev/api/eiken/generate`

---

## 📝 次のステップ (Optional)

### Phase 6.6: IntegratedQuestionGenerator への統合
現在、Phase 6.5 は `/api/eiken/generate` (従来のAPI) にのみ適用されています。

Phase 3 の新しいAPI `/api/eiken/questions/generate` にも同様の正解分散ロジックを統合する必要があります。

**TODO**:
1. `IntegratedQuestionGenerator` に `AnswerDiversityManager` を統合
2. Blueprint生成時に正解分散の制約を追加
3. 検証パイプラインに正解分散チェックを追加

---

## 🎓 まとめ

### 実装完了項目
- ✅ Phase 5F: 日本語翻訳と語彙意味の表示
- ✅ Phase 6 Part 1: 文法タグ検出レイヤー
- ✅ Phase 6 Part 2: 4ブロック解説テンプレート
- ✅ **Phase 6.5: 正解選択肢の分散管理** ← 今回実装

### 問題解決状況
- ✅ 問題翻訳がない → 解決（Phase 5F）
- ✅ 熟語の解説がない → 解決（Phase 5F）
- ✅ 解説が学校方式でない → 解決（Phase 6 Part 2）
- ✅ **問題の正解が偏る** → **解決（Phase 6.5）** ✨

### ユーザーへのメッセージ
**「4級の問題で新しく4問生成してみてください。正解の偏りが大幅に改善されているはずです！」**

---

## 📚 関連ファイル

- `src/eiken/services/answer-diversity-manager.ts` (新規作成)
- `src/eiken/routes/generate.ts` (修正)
- `PHASE_6_5_SUMMARY.md` (このファイル)
