# 📚 英検問題生成システム - アーキテクチャ完全ガイド

**最終更新**: 2025-11-21  
**作成理由**: 2つのAPI共存による混乱を解消するため

---

## 🎯 システム概要

このシステムは**2つの問題生成API**が共存しています。

| API名 | パス | 状態 | 特徴 |
|------|------|------|------|
| **従来API** | `/api/eiken/generate` | 🟡 段階的廃止予定 | シンプル、検証なし |
| **Phase 3 API** | `/api/eiken/questions/generate` | 🟢 推奨 | 高機能、検証あり |

---

## 📂 ファイル構造

```
webapp/
├── src/
│   ├── index.tsx                          # メインエントリーポイント（Hono + React Router）
│   │   └── ルーティング設定（21000行目付近）:
│   │       ├── app.route('/api/eiken/generate', generateRoute)      ← 従来API
│   │       └── app.route('/api/eiken/questions', questionRoutes)    ← Phase 3 API
│   │
│   ├── eiken/
│   │   ├── routes/
│   │   │   ├── generate.ts                # 従来API実装
│   │   │   └── questions.ts               # Phase 3 API実装 ⭐
│   │   │
│   │   ├── services/
│   │   │   └── integrated-question-generator.ts  # Phase 3のコア生成ロジック
│   │   │
│   │   └── types/
│   │       └── index.ts                   # 型定義
│   │
│   ├── components/eiken/
│   │   ├── QuestionGenerator.tsx          # UI: 問題生成フォーム
│   │   ├── QuestionDisplay.tsx            # UI: 問題表示
│   │   └── ResultsDashboard.tsx           # UI: 結果表示
│   │
│   ├── hooks/
│   │   └── useEikenAPI.ts                 # API通信フック
│   │
│   └── pages/eiken/
│       └── practice.tsx                   # メイン練習ページ
│
├── vite.config.ts                         # Vite設定（Honoと統合）
└── wrangler.toml                          # Cloudflare設定
```

---

## 🔀 2つのAPI比較

### API 1: `/api/eiken/generate` (従来型)

**ファイル**: `src/eiken/routes/generate.ts`

#### リクエスト例:
```json
{
  "grade": "pre1",
  "section": "vocabulary",      ← UI層の概念
  "questionType": "vocabulary",
  "count": 5,
  "difficulty": 0.6,
  "topicHints": ["business"]
}
```

#### 特徴:
- ✅ シンプル・軽量
- ✅ すぐに動く
- ❌ 語彙検証なし
- ❌ CEFR-Jチェックなし
- ❌ 語彙notes (語注) なし
- ❌ Blueprint生成なし

#### レスポンス:
```json
{
  "success": true,
  "generated": [
    {
      "questionNumber": 1,
      "questionText": "She was _____ to hear the news.",
      "choices": ["delighted", "angry", "confused", "worried"],
      "correctAnswerIndex": 0,
      "explanation": "...",
      "explanationJa": "...",
      "translationJa": "...",
      "difficulty": 0.6,
      "topic": "business",
      "copyrightSafe": true,
      "copyrightScore": 95
    }
  ],
  "rejected": 0,
  "totalAttempts": 5,
  "saved": 5
}
```

---

### API 2: `/api/eiken/questions/generate` (Phase 3 推奨) ⭐

**ファイル**: `src/eiken/routes/questions.ts`

#### リクエスト例:
```json
{
  "student_id": "test_user_001",
  "grade": "pre1",
  "format": "grammar_fill",     ← バックエンドの問題形式
  "count": 1,
  "difficulty_preference": "adaptive",
  "topic_hints": ["business"]
}
```

#### 利用可能なフォーマット (3種類 - 英検一次試験対応):
```typescript
const availableFormats = [
  'grammar_fill',     // 短文の語句空所補充（語彙・文法問題）
  'long_reading',     // 長文読解（内容一致選択）
  'essay'             // ライティング（意見論述）
];
```

**注**: バックエンドには `opinion_speech` と `reading_aloud` も実装されていますが、これらは英検の正式な一次試験形式ではないため、UIからは除外しています。

#### 処理フロー:
```
1. Blueprint生成 (Topic Selection)
   ↓
2. LLM問題生成 (OpenAI GPT-4o)
   ↓
3. 語彙検証 (CEFR-Jレベルチェック)
   ↓ (Phase 4A)
4. 語彙notes追加 (難しい単語に日本語注釈)
   ↓ (Phase 4A)
5. 適応的閾値で検証 (フォーマット別調整)
   ↓
6. DB保存 (検証データ付き)
```

#### 特徴:
- ✅ Blueprint生成 (トピック選定)
- ✅ 語彙データベース検証
- ✅ CEFR-Jレベルチェック
- ✅ 語彙notes自動付与 (Phase 4A)
- ✅ 適応的な検証閾値 (Phase 4A)
- ✅ 詳細な検証メタデータ
- ⚠️ 処理時間やや長い (検証のため)

#### レスポンス:
```json
{
  "success": true,
  "data": {
    "question": {
      "id": 123,
      "format": "grammar_fill",
      "grade": "pre1",
      "question_text": "She was _____ to hear the news.",
      "choices_json": "[\"delighted\", \"angry\", \"confused\", \"worried\"]",
      "correct_answer": "delighted",
      "explanation": "...",
      "vocabulary_notes_json": "{\"delighted\": \"大喜びする\"}"  // Phase 4A
    },
    "blueprint": {
      "topic": "business",
      "difficulty": 0.75
    },
    "validation": {
      "vocabulary_coverage": 0.82,        // Phase 4A: 語彙カバレッジ
      "text_profile": {...},
      "threshold_used": 0.75,             // Phase 4A: 使用された閾値
      "notes_added": 3                    // Phase 4A: 追加された語注数
    },
    "metadata": {
      "generated_at": "2025-11-21T...",
      "llm_model": "gpt-4o"
    }
  }
}
```

---

## 🎨 UI層の構造

### 現在のUI (2025-11-21時点)

**ファイル**: `src/components/eiken/QuestionGenerator.tsx`

#### ボタン定義:
```typescript
const SECTION_OPTIONS = [
  { value: 'vocabulary', label: '語彙問題', icon: '📚' },
  { value: 'grammar', label: '文法問題', icon: '✍️' },
  { value: 'reading', label: '読解問題', icon: '📖' },
];
```

#### 問題点:
- ❌ 3つのボタンしかない
- ❌ `opinion_speech` と `reading_aloud` にアクセス不可
- ❌ 古い `/api/eiken/generate` API を呼んでいる
- ❌ Phase 3/4Aの機能が使えない

---

## 🔄 UI-to-Backend マッピング問題

### 現在の混乱:

```
UI Layer (QuestionGenerator.tsx)
    ↓ section: 'vocabulary'
API Hook (useEikenAPI.ts)
    ↓ POST /api/eiken/generate
従来API (generate.ts)
    ↓ section パラメータをそのまま使用
OpenAI Prompt
    ↓ "Generate ONE UNIQUE vocabulary question..."
結果
    → シンプルな問題生成
    → 検証なし、語彙notesなし
```

### 理想的な構造 (Phase 3 API使用):

```
UI Layer (QuestionGenerator.tsx)
    ↓ format: 'grammar_fill'
API Hook (useEikenAPI.ts)
    ↓ POST /api/eiken/questions/generate
Phase 3 API (questions.ts)
    ↓ IntegratedQuestionGenerator
Blueprint生成 → LLM → 検証 → 語彙notes → DB保存
結果
    → 高品質な問題
    → 語彙notes付き
    → 検証データ付き
```

---

## 📊 Phase 4A の成果

### 実装内容:
1. **語彙notes (語注) 自動付与**
   - CEFR-Jデータベースから日本語定義を取得
   - 問題文中の難しい単語に自動注釈
   
2. **適応的な検証閾値**
   ```typescript
   // src/eiken/services/integrated-question-generator.ts (Line 565-595)
   const thresholds = {
     grammar_fill: {
       base: 0.70,
       with_notes: 0.65  // 語彙notes付きは閾値を緩和
     },
     long_reading: {
       base: 0.75,
       with_notes: 0.70
     },
     essay: {
       base: 0.72,
       with_notes: 0.68
     }
   };
   ```

3. **Glossary単語の除外**
   - 語彙notesに含まれる単語は検証から除外
   - カバレッジ計算の精度向上

### 効果:
- Essay: 73-77% → **77-82%** (+5%)
- Long Reading: 77-80% → **82-85%** (+5%)

---

## 🛠️ 開発環境

### ローカル開発:
```bash
npm run dev
# → Vite dev server (http://localhost:5173)
# → Hono APIも同時に起動
```

### 本番デプロイ:
```bash
npm run build
npm run deploy
# → Cloudflare Pages にデプロイ
```

### API直接テスト:
```bash
# 従来API
curl -X POST http://localhost:5173/api/eiken/generate \
  -H "Content-Type: application/json" \
  -d '{"grade":"pre1","section":"vocabulary","questionType":"vocabulary","count":1}'

# Phase 3 API
curl -X POST http://localhost:5173/api/eiken/questions/generate \
  -H "Content-Type: application/json" \
  -d '{"student_id":"test","grade":"pre1","format":"grammar_fill","count":1}'
```

---

## 🚀 今後の方向性

### Phase 5以降の計画:

1. **UIをPhase 3 APIに完全移行** ← 今ココ！
   - 5つの問題タイプ全て対応
   - 語彙notes UI表示
   - 検証データの可視化

2. **データ基盤の拡充**
   - CEFR-J語彙を100万語に拡張
   - 過去問データの統合

3. **Cron自動生成**
   - 定期的な問題プール更新
   - 重複検出の強化

4. **ユーザーAPI実装**
   - 個別の学習履歴
   - パーソナライズ

---

## 🔍 デバッグ Tips

### UIでどのAPIを呼んでいるか確認:
```javascript
// ブラウザのコンソールで
// useEikenAPI.ts の console.log を見る
// → "📡 Sending API request:" で確認可能
```

### Phase 3 APIが動いているか確認:
```bash
# Health check
curl http://localhost:5173/api/eiken/questions/health
```

### データベース確認:
```bash
cd /home/user/webapp
wrangler d1 execute kobeya-logs-db --local --command "SELECT COUNT(*) FROM eiken_questions"
```

---

## 📞 よくある質問

### Q1: なぜ2つのAPIがあるの？
**A**: Phase 1で従来APIを作成 → Phase 3で高機能API追加 → UIがまだ従来APIを使っている

### Q2: どちらを使うべき？
**A**: **Phase 3 API** (`/api/eiken/questions/generate`) を推奨！

### Q3: スピーキング問題はどこ？
**A**: Phase 3 APIにはあるが、UIからアクセス不可（今から修正します）

### Q4: 従来APIは削除する？
**A**: UI移行後、段階的に廃止予定

### Q5: Phase 4Aの機能を使うには？
**A**: Phase 3 APIを呼ぶ必要がある（今から実装）

---

## 🎓 用語集

| 用語 | 意味 |
|------|------|
| **Blueprint** | 問題生成前の設計図（トピック、難易度など） |
| **CEFR-J** | 日本版CEFR、語彙レベルの基準 |
| **語彙notes (Vocabulary Notes)** | 難しい英単語への日本語注釈 |
| **Glossary** | 語彙notesに含まれる単語リスト |
| **Coverage** | 問題文の語彙がDBに存在する割合 |
| **Threshold** | 語彙カバレッジの合格基準 |
| **Format** | 問題形式（grammar_fill, essay など） |
| **Section** | UI層の問題カテゴリ（vocabulary, grammar, reading） |

---

**このドキュメントは常に最新の状態に保ってください！**
