# デモページ実装プラン

## 📋 概要

英検対策と小論文対策の機能を、独立したデモページとして展開する。
各ページには実際の動作デモと技術的な説明を含める。

---

## 🎯 実装する3つのデモページ

### 1. 英検対策デモページ (`/demo/eiken`)
- **URL**: `/demo/eiken` または `/eiken-demo`
- **内容**: 英検3級の問題1問を実際に体験できるデモ
- **技術説明**: バックエンドロジック、AI活用方法、評価アルゴリズムの説明

### 2. 小論文対策デモページ (`/demo/essay`)
- **URL**: `/demo/essay` または `/essay-demo`
- **内容**: 小論文コーチングの段階的学習を体験できるデモ
- **技術説明**: ステップバイステップのロジック、フィードバック生成の仕組み

### 3. トップページ/ランディングページ (`/demo` または `/`)
- **URL**: `/demo` または新しいランディングページ
- **内容**: 両方のデモへのリンクと、プロジェクト全体の説明
- **技術説明**: システムアーキテクチャ、使用技術スタック

---

## 🏗️ 実装アプローチ

### アプローチ1: 新規デモ専用ルート（推奨）

**メリット**:
- 既存の機能に影響を与えない
- デモ用の簡易版として最適化できる
- 技術説明を組み込みやすい
- 本番環境と分離できる

**構造**:
```
src/
  routes/
    demo/
      eiken-demo.tsx       # 英検デモルート
      essay-demo.tsx       # 小論文デモルート
      index.tsx            # デモトップページ
  pages/
    demo/
      EikenDemo.tsx        # 英検デモコンポーネント
      EssayDemo.tsx        # 小論文デモコンポーネント
      DemoLanding.tsx      # デモランディング
public/
  demo/
    eiken.html            # 英検デモHTML（もしくはTSXで生成）
    essay.html            # 小論文デモHTML
    index.html            # デモトップ
```

### アプローチ2: 既存ページを拡張

**メリット**:
- 実装が早い
- 既存のコンポーネントを再利用

**デメリット**:
- 本番機能とデモが混在する
- 説明文の追加が複雑になる可能性

---

## 📝 実装手順（推奨アプローチ1）

### Phase 1: デモインフラの準備

#### Step 1.1: ディレクトリ構造を作成
```bash
mkdir -p src/routes/demo
mkdir -p src/pages/demo
mkdir -p src/components/demo
mkdir -p public/demo
```

#### Step 1.2: デモランディングページの作成
- ファイル: `src/routes/demo/index.tsx`
- 内容:
  - プロジェクト概要
  - 2つのデモへのリンク（英検・小論文）
  - GitHub リポジトリリンク
  - 技術スタック紹介

#### Step 1.3: ルーティング設定
- `src/index.tsx` に追加:
```typescript
import demoRoutes from './routes/demo'
app.route('/demo', demoRoutes)
```

---

### Phase 2: 英検デモページの実装

#### Step 2.1: 英検デモルートの作成
- ファイル: `src/routes/demo/eiken-demo.tsx`
- 機能:
  - 固定の英検3級問題を1問表示
  - 解答送信と評価
  - 技術説明セクション

#### Step 2.2: デモ用の固定データ準備
```typescript
// src/data/demo/eiken-sample.ts
export const DEMO_EIKEN_QUESTION = {
  id: 'demo-grade3-001',
  grade: '3',
  format: 'grammar_fill',
  question: {
    text: 'My sister ( ) to the library every Saturday.',
    choices: [
      { id: 'A', text: 'go', explanation: '主語がMy sister（三人称単数）なので不正解' },
      { id: 'B', text: 'goes', explanation: '正解！三人称単数現在形' },
      { id: 'C', text: 'going', explanation: '進行形だが文法的に不適切' },
      { id: 'D', text: 'went', explanation: '過去形だがevery Saturdayは習慣を示す' }
    ],
    correctAnswer: 'B',
    cefr_level: 'A2',
    topic: 'daily-life'
  }
}
```

#### Step 2.3: 技術説明コンポーネント
```typescript
// src/components/demo/TechExplanation.tsx
// 以下の内容を含む：
// - 問題生成のロジック
// - CEFR-J単語データベース（10,000語）
// - 著作権チェックの仕組み
// - AI評価アルゴリズム
// - 使用技術: OpenAI GPT-4o, Cloudflare D1, Hono.js
```

#### Step 2.4: デモページUI
- 左側: 問題エリア（実際に解答可能）
- 右側: 技術説明エリア（折りたたみ可能）
- 下部: バックエンドAPIコールの可視化（オプション）

---

### Phase 3: 小論文デモページの実装

#### Step 3.1: 小論文デモルートの作成
- ファイル: `src/routes/demo/essay-demo.tsx`
- 機能:
  - 固定のお題で段階的学習を体験
  - ステップ1〜2のみ体験可能（デモ版）
  - 技術説明セクション

#### Step 3.2: デモ用の固定お題データ
```typescript
// src/data/demo/essay-sample.ts
export const DEMO_ESSAY_THEME = {
  id: 'demo-essay-001',
  title: 'あなたの好きな季節について',
  theme_content: '四季の中で、あなたが最も好きな季節はどれですか？その季節が好きな理由を、具体的な例を挙げて説明してください。',
  steps: [
    {
      stepNumber: 1,
      type: 'comprehension',
      question: 'このお題では何について書くことが求められていますか？',
      // ... (実際のステップデータ)
    }
  ]
}
```

#### Step 3.3: 技術説明コンポーネント
```typescript
// src/components/demo/EssayTechExplanation.tsx
// 以下の内容を含む：
// - 段階的学習のロジック（4-7ステップ動的生成）
// - 画像解析（GPT-4o Vision）
// - リアルタイムフィードバック
// - セッション管理の仕組み
// - 使用技術: OpenAI GPT-4o Vision, Cloudflare D1, WebSocket
```

#### Step 3.4: デモページUI
- ステップ表示（プログレスバー）
- 実際の解答入力
- AIフィードバック表示
- 技術説明パネル（右サイド）

---

### Phase 4: ページ分離とナビゲーション

#### Step 4.1: 共通ヘッダーコンポーネント
```typescript
// src/components/demo/DemoHeader.tsx
export const DemoHeader = () => {
  return (
    <header className="bg-blue-600 text-white p-4">
      <nav>
        <a href="/demo">デモトップ</a>
        <a href="/demo/eiken">英検デモ</a>
        <a href="/demo/essay">小論文デモ</a>
        <a href="https://github.com/kobeyabkk/KOBEYA_StudyPartner_Full">GitHub</a>
      </nav>
    </header>
  )
}
```

#### Step 4.2: 各ページにヘッダーを追加
- すべてのデモページで共通ヘッダーを使用
- 現在のページをハイライト表示

---

## 🎨 デザイン方針

### カラースキーム
- **英検デモ**: 青系（学習・知識のイメージ）
- **小論文デモ**: 緑系（成長・創造のイメージ）
- **技術説明**: グレー系（プロフェッショナル）

### レイアウト
```
┌─────────────────────────────────────────────┐
│  Header (ナビゲーション)                      │
├─────────────────────┬───────────────────────┤
│                     │                       │
│  デモエリア          │  技術説明エリア        │
│  (実際に操作可能)    │  (折りたたみ可能)      │
│                     │                       │
│  - 問題表示          │  🔧 バックエンド       │
│  - 解答入力          │  📊 データベース       │
│  - フィードバック    │  🤖 AI技術            │
│                     │  ⚡ パフォーマンス     │
│                     │                       │
└─────────────────────┴───────────────────────┘
│  Footer (GitHub リンクなど)                  │
└─────────────────────────────────────────────┘
```

---

## 📚 技術説明に含める内容

### 英検デモページ

#### 1. 問題生成ロジック
```markdown
### 問題生成のフロー

1. **トピック選択**: 61種類のトピックエリアから選択
2. **CEFR-J単語データベース**: 10,000語のデータベースから適切な語彙を選択
3. **文法パターン生成**: GPT-4oで自然な文章を生成
4. **著作権チェック**: 過去問との類似度をコサイン類似度でチェック（閾値: 0.85）
5. **選択肢生成**: 正解1つ + 魅力的な誤答3つ
6. **解説生成**: 各選択肢に詳細な説明を付与

**使用技術**:
- OpenAI GPT-4o
- Cloudflare D1 (SQLite)
- CEFR-J Wordlist API
```

#### 2. データベース設計
```markdown
### 主要テーブル

- `eiken_generated_questions`: 生成された問題
- `eiken_vocabulary_lexicon`: 10,000語の語彙データ
- `eiken_topic_areas`: 61のトピックエリア
- `eiken_generation_metrics`: 問題生成の分析データ
```

#### 3. APIエンドポイント
```markdown
### 問題生成API

**エンドポイント**: `POST /api/eiken/questions/generate`

**リクエスト例**:
```json
{
  "student_id": "demo-user",
  "grade": "3",
  "format": "grammar_fill",
  "count": 1
}
```

**レスポンス**: 生成された問題データ
```

---

### 小論文デモページ

#### 1. 段階的学習システム
```markdown
### 4-7ステップの動的生成

問題の複雑さに応じて、AIが最適なステップ数を決定：

1. **読解確認** (Step 1): お題の理解度チェック
2. **構成計画** (Step 2): アウトライン作成
3. **語彙確認** (Step 3): 必要な語彙の確認
4. **本文執筆** (Step 4-5): 段落ごとの執筆
5. **推敲** (Step 6): 文章の見直し
6. **完成** (Step 7): 最終チェック

**使用技術**:
- OpenAI GPT-4o Vision (画像解析)
- OpenAI GPT-4o (フィードバック生成)
- Cloudflare D1 (セッション管理)
```

#### 2. 画像解析機能
```markdown
### GPT-4o Visionによる画像解析

生徒がアップロードした画像（ノート、教科書など）を分析：

- **テキスト抽出**: OCR機能で文字を読み取り
- **問題分析**: 問題の種類、難易度を判定
- **学習プラン生成**: 最適な学習ステップを自動生成

**精度**: 日本語OCR 95%以上
```

#### 3. リアルタイムフィードバック
```markdown
### AIフィードバックの生成

各ステップでの解答に対して：

1. **即座に評価**: 平均2-3秒で応答
2. **具体的な改善点**: 文法、語彙、構成の観点
3. **ポジティブな声かけ**: モチベーション維持
4. **次のヒント**: 次のステップへの導き

**使用モデル**: GPT-4o (温度: 0.7)
```

---

## 🚀 実装の優先順位

### 最優先 (Week 1)
1. ✅ デモランディングページ (`/demo`)
2. ✅ 英検デモページの基本実装 (`/demo/eiken`)
3. ✅ 技術説明コンポーネント（英検用）

### 高優先 (Week 2)
4. ✅ 小論文デモページの基本実装 (`/demo/essay`)
5. ✅ 技術説明コンポーネント（小論文用）
6. ✅ 共通ヘッダー・ナビゲーション

### 中優先 (Week 3)
7. ⚪ スタイリングの洗練
8. ⚪ レスポンシブデザイン対応
9. ⚪ APIコール可視化機能（オプション）

### 低優先 (Week 4)
10. ⚪ アニメーション効果
11. ⚪ パフォーマンス最適化
12. ⚪ 多言語対応（英語版）

---

## 🔧 技術的な実装詳細

### 1. ルーティング設定

**ファイル**: `src/routes/demo/index.tsx`
```typescript
import { Hono } from 'hono'
import { html } from 'hono/html'

const demoRoutes = new Hono()

// デモトップページ
demoRoutes.get('/', (c) => {
  return c.html(/* DemoLandingPageのHTML */)
})

// 英検デモページ
demoRoutes.get('/eiken', (c) => {
  return c.html(/* EikenDemoPageのHTML */)
})

// 小論文デモページ
demoRoutes.get('/essay', (c) => {
  return c.html(/* EssayDemoPageのHTML */)
})

export default demoRoutes
```

### 2. デモ用APIエンドポイント

**ファイル**: `src/routes/demo/api.tsx`
```typescript
import { Hono } from 'hono'

const demoApiRoutes = new Hono()

// 英検デモ問題取得（固定データ）
demoApiRoutes.get('/eiken/question', (c) => {
  return c.json(DEMO_EIKEN_QUESTION)
})

// 英検デモ解答評価
demoApiRoutes.post('/eiken/answer', async (c) => {
  const { answer } = await c.req.json()
  const isCorrect = answer === DEMO_EIKEN_QUESTION.correctAnswer
  return c.json({
    isCorrect,
    explanation: DEMO_EIKEN_QUESTION.choices.find(ch => ch.id === answer)?.explanation
  })
})

// 小論文デモ評価
demoApiRoutes.post('/essay/evaluate', async (c) => {
  const { step, answer } = await c.req.json()
  // デモ用の簡易評価ロジック
  return c.json({
    feedback: 'よく書けています！次のステップに進みましょう。',
    score: 85
  })
})

export default demoApiRoutes
```

### 3. 状態管理（クライアント側）

```typescript
// src/pages/demo/EikenDemo.tsx
import { useState } from 'react'

export const EikenDemo = () => {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleSubmit = async () => {
    const response = await fetch('/demo/api/eiken/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: selectedAnswer })
    })
    const data = await response.json()
    setResult(data)
    setShowResult(true)
  }

  return (
    <div className="demo-container">
      {/* 問題表示 */}
      {/* 選択肢 */}
      {/* 技術説明 */}
    </div>
  )
}
```

---

## 📊 期待される効果

### ポートフォリオとしての価値
- ✅ 実際に動くデモで技術力をアピール
- ✅ コード品質とアーキテクチャの理解を示す
- ✅ 教育システムへの深い洞察を示す

### ユーザー体験
- ✅ 機能を理解しやすい
- ✅ 実際の使用感を体験できる
- ✅ 技術的な裏側を学べる

### 採用・営業での活用
- ✅ 面接でのデモンストレーション
- ✅ クライアントへの提案材料
- ✅ GitHub上でのスター獲得

---

## 🎯 成功の指標

### 技術的指標
- [ ] ページロード時間 < 2秒
- [ ] レスポンシブ対応（モバイル・タブレット）
- [ ] アクセシビリティスコア > 90

### ユーザー指標
- [ ] 直感的に操作できる（説明不要）
- [ ] 技術説明が理解しやすい
- [ ] 実際の機能への興味を喚起

---

## 🔄 次のステップ

### 今すぐできること
1. デモページのディレクトリ構造を作成
2. デモランディングページのHTML/TSXを実装
3. 英検デモの固定データを準備

### 質問事項
1. デモページのURL構造の最終決定
   - `/demo/eiken` vs `/eiken-demo`
   - どちらがお好みですか？

2. 技術説明の詳細度
   - どこまで詳しく説明するか？
   - 初心者向け？エンジニア向け？

3. 既存ページとの統合
   - 既存の `/essay-coaching` や `/eiken/practice` とは別物として実装？
   - それともリンクを張る？

---

## 💡 推奨アクション

**今すぐ始めるなら**:

```bash
# 1. ディレクトリ作成
mkdir -p src/routes/demo
mkdir -p src/pages/demo
mkdir -p src/components/demo
mkdir -p src/data/demo

# 2. デモランディングページから実装
# → 全体の構想を固める

# 3. 英検デモを先に完成させる
# → 小論文デモの実装パターンとして活用

# 4. 小論文デモを実装

# 5. 最終的にスタイリングを洗練
```

---

**実装を始めますか？どのページから始めたいですか？**

1. デモランディングページ (`/demo`)
2. 英検デモページ (`/demo/eiken`)
3. 小論文デモページ (`/demo/essay`)

また、URL構造や技術説明の詳細度についてのご希望があればお聞かせください！
