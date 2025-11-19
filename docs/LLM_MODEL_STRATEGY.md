# LLM Model Selection Strategy - ハイブリッド構成

**最終更新**: 2025-11-19  
**実装状況**: ✅ 完了

---

## 戦略概要

英検問題生成システムは、**ハイブリッドLLMモデル戦略**を採用しています。

### モデル構成

| 用途 | モデル | 理由 |
|------|--------|------|
| **本番生成（保存データ）** | GPT-4o | 長文一貫性・論理性・CEFR整合性 |
| **練習モード** | GPT-4o-mini | 高速・低コスト |
| **語彙書き換え** | GPT-4o | 文法的正確性・自然さ |
| **問題分析** | GPT-4o | 分析精度 |

---

## 詳細ルール

### 1. 本番モード（production）

生徒の学習履歴として保存される問題の生成

#### 2級以上（2, pre1, 1）
- **常に GPT-4o**
- 理由: 高度な論理性、抽象的思考、複雑な文章構造が必要

#### 準2級・3級（pre2, 3）
| 問題形式 | モデル | 理由 |
|---------|--------|------|
| 長文読解 (`long_reading`) | GPT-4o | 段落間の一貫性が重要 |
| エッセイ (`essay`) | GPT-4o | 論理展開・構成力が重要 |
| 意見スピーチ (`opinion_speech`) | GPT-4o | 論理的説得力が必要 |
| 文法穴埋め (`grammar_fill`) | GPT-4o-mini | 文法精度は十分 |
| 音読 (`reading_aloud`) | GPT-4o-mini | 発音・流暢さが主目的 |

#### 5級・4級（5, 4）
- **常に GPT-4o-mini**
- 理由: 基礎レベルの問題は十分な品質

### 2. 練習モード（practice）

リアルタイム練習、下書き、プレビュー生成

- **常に GPT-4o-mini**
- 理由: 高速フィードバックと低コスト優先

### 3. その他の用途

| 用途 | モデル | 理由 |
|------|--------|------|
| 語彙書き換え | GPT-4o | 文法的正確性と自然さが最重要 |
| 問題分析 | GPT-4o | 分析精度が後続処理に影響 |
| 著作権検証 | GPT-4o | 誤判定を避ける必要がある |

---

## コスト試算

### シナリオ: 生徒100人、1日1人5問生成

#### 本番モード（production）のみ使用の場合:

**内訳**:
- 2級以上: 20人 × 5問 = 100問 → GPT-4o
- 準2級・3級（長文系）: 30人 × 2問 = 60問 → GPT-4o
- 準2級・3級（文法系）: 30人 × 3問 = 90問 → GPT-4o-mini
- 5級・4級: 50人 × 5問 = 250問 → GPT-4o-mini

**合計**:
- GPT-4o: 160問/日 × 800 tokens = 128,000 tokens/日
- GPT-4o-mini: 340問/日 × 800 tokens = 272,000 tokens/日

**月間コスト（30日）**:
```
GPT-4o:
  Input: 3.84M × 0.5 × $2.50 = $4.80
  Output: 3.84M × 0.5 × $10.00 = $19.20
  小計: $24.00

GPT-4o-mini:
  Input: 8.16M × 0.5 × $0.15 = $0.61
  Output: 8.16M × 0.5 × $0.60 = $2.45
  小計: $3.06

合計: $27.06/月
```

#### 全てGPT-4oを使用した場合:
```
合計: $75.00/月

→ ハイブリッド構成で 約64%のコスト削減！
```

---

## 実装

### ファイル構成

```
src/eiken/
├── types/index.ts
│   └── LLMModel, GenerationMode型定義
├── utils/model-selector.ts
│   └── selectModel(), getModelInfo()関数
└── services/
    ├── question-generator.ts (✅ モデル選択統合済み)
    ├── vocabulary-rewriter.ts (✅ GPT-4o固定)
    └── question-analyzer.ts (✅ GPT-4o固定)
```

### 使用例

#### 1. 本番モード - 準2級エッセイ問題
```typescript
const request: QuestionGenerationRequest = {
  grade: 'pre2',
  section: 'writing',
  questionType: 'essay',
  count: 1,
  mode: 'production',
  format: 'essay'
};

// 内部でGPT-4oが選択される
const questions = await generateQuestions(request, analysisContext, env);
```

#### 2. 練習モード - 3級文法問題
```typescript
const request: QuestionGenerationRequest = {
  grade: '3',
  section: 'grammar',
  questionType: 'grammar',
  count: 5,
  mode: 'practice',  // 練習モード
  format: 'grammar_fill'
};

// 内部でGPT-4o-miniが選択される
const questions = await generateQuestions(request, analysisContext, env);
```

---

## モニタリング

### ログ出力

各問題生成時に以下のログが出力されます:

```
[Model Selection] gpt-4o - pre2級のessayは長文一貫性が重要なため gpt-4o を使用
[Model Selection] gpt-4o-mini - 練習モードのため gpt-4o-mini を使用（高速・低コスト）
```

### コスト追跡

`getModelInfo()`関数でモデルごとのコスト情報を取得可能:

```typescript
const info = getModelInfo('gpt-4o');
console.log(`Cost per 1M tokens: Input $${info.costPerMTokenInput}, Output $${info.costPerMTokenOutput}`);
```

---

## 品質保証

### GPT-4oが選ばれるケース（品質優先）

✅ 2級以上の全ての問題  
✅ 準2級・3級の長文読解  
✅ 準2級・3級のエッセイ  
✅ 準2級・3級の意見スピーチ  
✅ 語彙書き換え  
✅ 問題分析  

### GPT-4o-miniが選ばれるケース（コスト効率優先）

✅ 5級・4級の全ての問題  
✅ 準2級・3級の文法穴埋め  
✅ 準2級・3級の音読  
✅ 練習モード全般  

---

## 今後の拡張

### Phase 3以降で追加予定

1. **コスト統計ダッシュボード**
   - 日次/月次のモデル別使用量
   - コスト推移グラフ
   - 生徒あたりのコスト

2. **A/Bテスト機能**
   - GPT-4o vs GPT-4o-mini の品質比較
   - 生徒の正答率との相関分析

3. **動的モデル切り替え**
   - 負荷状況に応じた自動切り替え
   - 品質スコアに基づく自動調整

---

## まとめ

✅ **品質とコストのバランス**: 高度な問題にはGPT-4o、基礎問題にはGPT-4o-mini  
✅ **64%のコスト削減**: 全てGPT-4oと比較して  
✅ **柔軟な拡張性**: 簡単にモデル追加・ルール変更が可能  
✅ **透明性**: ログとメトリクスで判断根拠を追跡可能  

この戦略により、英検対策システムは**高品質を維持しながらスケーラブルな運用**を実現します。
