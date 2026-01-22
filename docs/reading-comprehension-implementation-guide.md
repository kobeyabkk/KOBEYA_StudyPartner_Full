# 読解問題自動生成アプリ - 実装ガイド

## 概要

このドキュメントは、作成した型定義・ロジック・APIを、既存のReactコンポーネントに統合する方法を説明します。

## ファイル構成

```
src/
├── utils/
│   └── reading-comprehension-generator.ts  # 問題生成ロジック
├── routes/
│   └── reading-comprehension.ts            # APIエンドポイント
└── components/ (既存)
    └── ReadingComprehensionGen.tsx         # フロントエンドコンポーネント
```

## 実装の流れ

### 1. 既存コンポーネントの型定義を更新

既存の `ReadingComprehensionGen.tsx` の型定義を拡張します。

```typescript
// 既存の型定義を以下に置き換え
import type {
  Grade,
  Question,
  QuestionType,
  StoryMetadata
} from '../utils/reading-comprehension-generator';

// 既存の型を拡張
type Question = ChoiceQuestion | ExtractQuestion | OrderQuestion;
```

### 2. メタ情報入力UIの追加（オプション）

左サイドバーにメタ情報編集エリアを追加：

```typescript
// メタ情報のstate
const [metadata, setMetadata] = useState<StoryMetadata>({});

// UI追加（Content Editorセクション内）
<div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
  <h4 className="text-xs font-bold text-blue-600 mb-2">メタ情報（オプション）</h4>
  <div className="space-y-2">
    <input
      type="text"
      placeholder="主人公"
      value={metadata.mainCharacter || ''}
      onChange={(e) => setMetadata({ ...metadata, mainCharacter: e.target.value })}
      className="w-full text-xs p-2 border rounded"
    />
    <input
      type="text"
      placeholder="時（例：ある日、朝）"
      value={metadata.time || ''}
      onChange={(e) => setMetadata({ ...metadata, time: e.target.value })}
      className="w-full text-xs p-2 border rounded"
    />
    <input
      type="text"
      placeholder="場所（例：森、家）"
      value={metadata.place || ''}
      onChange={(e) => setMetadata({ ...metadata, place: e.target.value })}
      className="w-full text-xs p-2 border rounded"
    />
  </div>
  <button
    onClick={async () => {
      // メタ情報自動抽出APIを呼び出す
      const response = await fetch('/api/reading-comprehension/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: bodyText, title })
      });
      const data = await response.json();
      if (data.ok) {
        setMetadata(data.metadata);
      }
    }}
    className="mt-2 text-xs bg-blue-500 text-white px-3 py-1 rounded"
  >
    AIで自動抽出
  </button>
</div>
```

### 3. 問題生成関数の置き換え

既存の `generateQuestionsFromText` 関数を置き換え：

```typescript
import {
  generateBasicQuestionsForLowGrade,
  generateQuestionsForMidGrade,
  generateQuestionsForHighGrade
} from '../utils/reading-comprehension-generator';

const generateQuestionsFromText = async (text: string) => {
  setIsGenerating(true);

  try {
    let newQuestions: Question[] = [];

    // 学年に応じた生成方法を選択
    if (selectedGrade === 'low') {
      // 低学年: ルールベース（同期処理）
      newQuestions = generateBasicQuestionsForLowGrade(text, title, metadata);
    } else {
      // 中学年・高学年: API経由で生成（非同期処理）
      const response = await fetch('/api/reading-comprehension/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: text,
          title,
          grade: selectedGrade,
          metadata,
          options: {
            grade: selectedGrade,
            useLLM: selectedGrade !== 'low',
            questionCount: selectedGrade === 'low' ? 5 : selectedGrade === 'mid' ? 6 : 7
          }
        })
      });

      const data = await response.json();
      if (data.ok) {
        newQuestions = data.questions;
        // LLMが抽出したメタ情報があれば更新
        if (data.metadata) {
          setMetadata(data.metadata);
        }
      } else {
        throw new Error(data.message || '問題生成に失敗しました');
      }
    }

    setQuestions(newQuestions);
  } catch (error) {
    console.error('問題生成エラー:', error);
    alert('問題生成中にエラーが発生しました: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    setIsGenerating(false);
  }
};
```

### 4. 問題タイプ表示の追加

問題カードにタイプ表示を追加：

```typescript
// 問題編集エリア内
<div className="flex items-center mb-1">
  <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded mr-2">
    問{qIdx + 1}
  </span>
  {q.type && (
    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
      {getQuestionTypeLabel(q.type)}
    </span>
  )}
</div>

// ヘルパー関数
const getQuestionTypeLabel = (type: QuestionType): string => {
  const labels: Record<QuestionType, string> = {
    who: 'だれ',
    when: 'いつ',
    where: 'どこ',
    what: 'なに',
    feeling: 'きもち',
    why: 'なぜ',
    extract: '抜き出し',
    summary: '要約',
    order: '順序',
    blank: '穴埋め'
  };
  return labels[type] || '';
};
```

### 5. APIルートの登録

メインのルーターに新しいAPIルートを追加：

```typescript
// src/index.tsx またはメインルーティングファイル
import readingComprehensionRouter from './routes/reading-comprehension';

// ルーター登録
app.route('/api/reading-comprehension', readingComprehensionRouter);
```

## 使用例

### 低学年（1-2年）向け

```typescript
// 自動生成（ルールベース、即座に完了）
const questions = generateBasicQuestionsForLowGrade(body, title, metadata);
// 結果: 基本5問（だれ・いつ・どこ・なに・きもち）が生成される
```

### 中学年（3-4年）向け

```typescript
// API経由で生成（LLM使用可）
const response = await fetch('/api/reading-comprehension/generate-questions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body,
    title,
    grade: 'mid',
    options: { useLLM: true, questionCount: 6 }
  })
});
// 結果: 基本5問 + 理由問題1問
```

### 高学年（5-6年）向け

```typescript
// API経由で生成（多様な形式）
const response = await fetch('/api/reading-comprehension/generate-questions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body,
    title,
    grade: 'high',
    options: { questionCount: 7 }
  })
});
// 結果: 選択問題・抜き出し・順序入れかえなど多様な形式
```

## メタ情報自動抽出の使用

```typescript
// メタ情報を自動抽出
const response = await fetch('/api/reading-comprehension/extract-metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ body, title })
});

const data = await response.json();
if (data.ok) {
  setMetadata(data.metadata);
  // メタ情報を使用して問題生成の精度が向上
}
```

## 注意事項

1. **低学年はルールベース**: 低学年向けはAPIキー不要で即座に生成されます
2. **中・高学年はLLM**: 中・高学年向けはOpenAI APIキーが必要です
3. **エラーハンドリング**: LLM生成失敗時はルールベースにフォールバックされます
4. **問題数制御**: レイアウト（縦書き・横書き）に応じて問題数を調整することを推奨

## 次のステップ

1. ✅ 型定義の拡張
2. ✅ 低学年向けルールベース生成器
3. ✅ LLM API統合
4. ⬜ メタ情報自動抽出UI
5. ⬜ 問題タイプ表示UI
6. ⬜ 抜き出し・順序入れかえ問題のUI対応

## トラブルシューティング

### LLM生成が失敗する場合

- OpenAI APIキーが正しく設定されているか確認
- プロンプトのトークン数が上限を超えていないか確認
- エラーログを確認し、フォールバックが動作しているか確認

### 問題の質が低い場合

- メタ情報を手動で入力・調整
- 本文の品質を確認（適切な長さ・構造か）
- 学年設定が適切か確認









