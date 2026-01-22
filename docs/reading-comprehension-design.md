# 小学生向け読解問題自動生成アプリ - 設計提案書

## 1. 設計の全体像

### 1.1 アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│  フロントエンド (React TSX)                          │
│  - 本文入力・編集                                     │
│  - 問題プレビュー・編集                                │
│  - 印刷レイアウト                                     │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  問題生成ロジック層                                   │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ 低学年用     │  │ 中・高学年用  │                │
│  │ ルールベース │  │ LLM統合      │                │
│  │ 生成器       │  │ 生成器       │                │
│  └──────────────┘  └──────────────┘                │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  LLM API (OpenAI)                                    │
│  - 中学年: 心情・理由抽出                             │
│  - 高学年: 多様な問題形式生成                         │
└─────────────────────────────────────────────────────┘
```

### 1.2 学年別アプローチ

- **低学年（1-2年）**: ルールベースで「基本5問」を安定生成
  - だれ（who）、いつ（when）、どこ（where）、なに（what）、きもち（feeling）
  - 本文から直接抽出できる情報のみ
  
- **中学年（3-4年）**: ルールベース + LLM補助
  - 基本5問 + 理由（why）問題
  - LLMで心情・理由を抽出
  
- **高学年（5-6年）**: LLM中心
  - 抜き出し、要約、主旨、文の順序入れかえなど多様な形式

### 1.3 メタ情報の活用

本文から自動抽出または手動入力可能なメタ情報を活用：
- 主人公、時、場所、主な出来事、心情の転換点など
- これにより、ルールベース生成の精度向上とLLMプロンプトの品質向上を実現

---

## 2. 型定義案

### 2.1 基本型定義

```typescript
// 学年区分
type Grade = 'low' | 'mid' | 'high';

// 問題の種類
type QuestionType = 
  | 'who'        // だれ - 低学年～
  | 'when'       // いつ - 低学年～
  | 'where'      // どこ - 低学年～
  | 'what'       // なに - 低学年～
  | 'feeling'    // きもち - 低学年～
  | 'why'        // なぜ - 中学年～
  | 'extract'    // 抜き出し - 高学年～
  | 'summary'    // 要約・主旨 - 高学年～
  | 'order'      // 順序入れかえ - 高学年～
  | 'blank';     // 穴埋め（既存互換）

// 問題形式
type QuestionFormat = 'choice' | 'extract' | 'order';

// 選択問題
interface ChoiceQuestion {
  text: string;
  choices: string[];
  answer: number; // 正解のインデックス
  type: QuestionType;
  format: 'choice';
  // オプション: 解説・引用箇所
  explanation?: string;
  sourceText?: string; // 本文の該当箇所
}

// 抜き出し問題
interface ExtractQuestion {
  text: string;
  correctAnswer: string; // 正解の文字列
  type: 'extract';
  format: 'extract';
  sourceText?: string; // 本文の該当箇所
  maxLength?: number; // 最大文字数
}

// 順序入れかえ問題
interface OrderQuestion {
  text: string;
  sentences: string[]; // 並び替える文
  correctOrder: number[]; // 正しい順序 [2,0,1,3] など
  type: 'order';
  format: 'order';
  sourceText?: string;
}

// 問題のユニオン型
type Question = ChoiceQuestion | ExtractQuestion | OrderQuestion;

// ストーリーのメタ情報
interface StoryMetadata {
  mainCharacter?: string;     // 主人公
  time?: string;              // 時（「ある日」「朝」「夕方」など）
  place?: string;             // 場所
  mainEvent?: string;         // 主な出来事（簡潔に）
  feelings?: Array<{          // 心情の変化
    character: string;
    emotion: string;
    reason?: string;
    sourceText: string;       // 本文の該当箇所
  }>;
  extractedBy?: 'rule' | 'llm' | 'manual'; // 抽出方法
}

// ストーリー型
interface Story {
  id: number;
  title: string;
  grade: Grade;
  imagePrompt: string;
  body: string;
  questions: Question[];
  metadata?: StoryMetadata; // 新規追加
}

// 問題生成オプション
interface QuestionGenerationOptions {
  grade: Grade;
  questionTypes?: QuestionType[]; // 生成したい問題タイプ
  useLLM?: boolean; // LLM使用可否（低学年は false 推奨）
  questionCount?: number; // 生成問題数（デフォルト: 低学年5, 中学年6, 高学年7）
}
```

### 2.2 拡張ポイント

- `Question`型に`type`と`format`を追加することで、学年に応じた問題生成が可能
- `StoryMetadata`により、ルールベース生成の精度向上とLLMプロンプトの品質向上
- 既存の`Question`型との互換性を保ちつつ、段階的に拡張可能

---

## 3. 問題生成ロジック案

### 3.1 低学年向け「基本5問」ルールベース生成

```typescript
// 低学年用のルールベース問題生成器
function generateBasicQuestionsForLowGrade(
  body: string,
  title: string,
  metadata?: StoryMetadata
): Question[] {
  const questions: Question[] = [];
  const sentences = body.split(/[。\n]+/).filter(s => s.trim().length > 0);

  // 1. だれ（who）問題
  if (metadata?.mainCharacter) {
    questions.push(generateWhoQuestion(metadata.mainCharacter, body));
  } else {
    // メタ情報がない場合は、タイトルや本文から推定
    const character = extractMainCharacter(title, body);
    if (character) {
      questions.push(generateWhoQuestion(character, body));
    }
  }

  // 2. いつ（when）問題
  const timeInfo = metadata?.time || extractTime(sentences);
  if (timeInfo) {
    questions.push(generateWhenQuestion(timeInfo, body));
  }

  // 3. どこ（where）問題
  const placeInfo = metadata?.place || extractPlace(sentences);
  if (placeInfo) {
    questions.push(generateWhereQuestion(placeInfo, body));
  }

  // 4. なに（what）問題
  const eventInfo = metadata?.mainEvent || extractMainEvent(sentences);
  if (eventInfo) {
    questions.push(generateWhatQuestion(eventInfo, body));
  }

  // 5. きもち（feeling）問題
  if (metadata?.feelings && metadata.feelings.length > 0) {
    const feeling = metadata.feelings[0]; // 最初の心情
    questions.push(generateFeelingQuestion(feeling, body));
  } else {
    // メタ情報がない場合は、感情語から推定
    const feeling = extractFeeling(sentences);
    if (feeling) {
      questions.push(generateFeelingQuestion(feeling, body));
    }
  }

  return questions.slice(0, 5); // 最大5問
}

// 個別問題生成関数の例
function generateWhoQuestion(character: string, body: string): ChoiceQuestion {
  const choices = [character];
  
  // ダミー選択肢生成（既存のDUMMY_WORDS + 別キャラ候補）
  const dummyCharacters = ['男の子', '女の子', 'おとうさん', 'おかあさん', 'いぬ', 'ねこ'];
  while (choices.length < 3) {
    const dummy = dummyCharacters[Math.floor(Math.random() * dummyCharacters.length)];
    if (!choices.includes(dummy)) {
      choices.push(dummy);
    }
  }

  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const answerIndex = shuffled.indexOf(character);

  return {
    text: 'このお話の主人公はだれですか。',
    choices: shuffled,
    answer: answerIndex,
    type: 'who',
    format: 'choice',
    sourceText: body.split(character)[0] + character + body.split(character)[1]?.slice(0, 20) || ''
  };
}

function generateWhenQuestion(timeInfo: string, body: string): ChoiceQuestion {
  const timePatterns = {
    'ある日': ['ある日', 'いつか', 'むかし'],
    '朝': ['朝', '昼', '夜'],
    '夕方': ['夕方', '朝', '夜'],
    '夜': ['夜', '朝', '昼'],
    'むかし': ['むかし', '今', 'これから']
  };

  let choices = [timeInfo];
  const patterns = timePatterns[timeInfo as keyof typeof timePatterns] || [timeInfo, 'いつか', 'ある日'];
  
  for (const p of patterns) {
    if (choices.length >= 3) break;
    if (!choices.includes(p)) choices.push(p);
  }

  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const answerIndex = shuffled.indexOf(timeInfo);

  return {
    text: 'このお話は、いつのはなしですか。',
    choices: shuffled,
    answer: answerIndex,
    type: 'when',
    format: 'choice'
  };
}

// 抽出ヘルパー関数
function extractMainCharacter(title: string, body: string): string | null {
  // タイトルから推定（「〜の子」「〜ちゃん」など）
  const titleMatch = title.match(/(.+?)(の子|ちゃん|くん|さん|じいさん|ばあさん)/);
  if (titleMatch) return titleMatch[1] + titleMatch[2];

  // 本文の最初の文から主語を抽出（簡易版）
  const firstSentence = body.split(/[。\n]/)[0];
  const subjectMatch = firstSentence.match(/(.+?)[はが]/);
  if (subjectMatch && subjectMatch[1].length < 10) {
    return subjectMatch[1];
  }

  return null;
}

function extractTime(sentences: string[]): string | null {
  const timeKeywords = ['ある日', '朝', '昼', '夕方', '夜', 'むかし', 'きょう', 'きのう'];
  for (const sentence of sentences.slice(0, 3)) { // 最初の3文のみ
    for (const keyword of timeKeywords) {
      if (sentence.includes(keyword)) {
        return keyword;
      }
    }
  }
  return null;
}

function extractPlace(sentences: string[]): string | null {
  const placeKeywords = ['にわ', '森', '家', '学校', '公園', '川', '池', '海', '山'];
  for (const sentence of sentences) {
    for (const keyword of placeKeywords) {
      if (sentence.includes(keyword)) {
        return keyword;
      }
    }
  }
  return null;
}

function extractMainEvent(sentences: string[]): string | null {
  // 動詞を含む最初の文から主な動作を抽出（簡易版）
  const verbPatterns = /(たべ|の|い|かえ|でかけ|あそ|はな|み|き|か)/;
  for (const sentence of sentences.slice(0, 3)) {
    if (verbPatterns.test(sentence)) {
      return sentence.slice(0, 30); // 簡潔に
    }
  }
  return null;
}

function extractFeeling(sentences: string[]): { character: string; emotion: string; sourceText: string } | null {
  const emotionKeywords = ['うれしい', 'たのしい', 'かなしい', 'こわい', 'びっくり', 'おこ', 'なか'];
  for (const sentence of sentences) {
    for (const keyword of emotionKeywords) {
      if (sentence.includes(keyword)) {
        return {
          character: '主人公', // 簡易版
          emotion: keyword,
          sourceText: sentence
        };
      }
    }
  }
  return null;
}
```

### 3.2 中学年向け（ルールベース + LLM補助）

```typescript
async function generateQuestionsForMidGrade(
  body: string,
  title: string,
  metadata?: StoryMetadata,
  useLLM: boolean = true
): Promise<Question[]> {
  // まず基本5問を生成（低学年ロジックを再利用）
  const basicQuestions = generateBasicQuestionsForLowGrade(body, title, metadata);

  if (useLLM) {
    // LLMで理由問題と心情詳細を生成
    const llmQuestions = await generateWhyAndFeelingQuestionsWithLLM(body, metadata);
    return [...basicQuestions, ...llmQuestions].slice(0, 6);
  } else {
    // ルールベースで理由問題を追加（簡易版）
    const whyQuestion = generateWhyQuestionRuleBased(body, metadata);
    if (whyQuestion) {
      return [...basicQuestions, whyQuestion].slice(0, 6);
    }
    return basicQuestions;
  }
}
```

### 3.3 高学年向け（LLM中心）

```typescript
async function generateQuestionsForHighGrade(
  body: string,
  title: string,
  metadata?: StoryMetadata
): Promise<Question[]> {
  // LLM APIを呼び出して多様な問題形式を生成
  return await generateDiverseQuestionsWithLLM(body, title, metadata);
}
```

---

## 4. LLM統合設計

### 4.1 API設計

```typescript
// API エンドポイント設計
// POST /api/reading-comprehension/generate-questions

interface GenerateQuestionsRequest {
  body: string;
  title: string;
  grade: Grade;
  metadata?: StoryMetadata;
  options?: QuestionGenerationOptions;
}

interface GenerateQuestionsResponse {
  questions: Question[];
  metadata?: StoryMetadata; // LLMが抽出したメタ情報（ない場合は提供されたものを返す）
  generatedAt: string;
}
```

### 4.2 LLMプロンプト設計（中学年用）

```typescript
async function generateWhyAndFeelingQuestionsWithLLM(
  body: string,
  metadata?: StoryMetadata
): Promise<ChoiceQuestion[]> {
  const prompt = `
あなたは小学生向け読解問題の専門家です。
以下の物語を読んで、中学年（3-4年生）向けの読解問題を生成してください。

【物語】
${body}

【指示】
1. 「なぜ〜したのですか」という理由を問う問題を1問生成
2. 「このとき、どんな気持ちだったと思いますか」という心情問題を1問生成

【要件】
- 問題文は、小学生が理解しやすい簡潔な日本語で
- 選択肢は3つ、本文に基づいた正解を1つ、本文と矛盾しない誤答を2つ
- 正解の根拠となる本文の箇所を明記

【出力形式】JSON形式
{
  "questions": [
    {
      "text": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3"],
      "answer": 0,
      "type": "why",
      "sourceText": "本文の該当箇所"
    },
    {
      "text": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3"],
      "answer": 1,
      "type": "feeling",
      "sourceText": "本文の該当箇所"
    }
  ]
}
`;

  // OpenAI API呼び出し（既存の実装を参考）
  const response = await fetch('/api/reading-comprehension/llm-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, grade: 'mid' })
  });

  const data = await response.json();
  return data.questions;
}
```

### 4.3 LLMプロンプト設計（高学年用）

```typescript
async function generateDiverseQuestionsWithLLM(
  body: string,
  title: string,
  metadata?: StoryMetadata
): Promise<Question[]> {
  const prompt = `
あなたは小学生向け読解問題の専門家です。
以下の物語を読んで、高学年（5-6年生）向けの読解問題を7問生成してください。

【物語】
タイトル: ${title}
${body}

【指示】
以下の形式の問題をバランスよく生成してください：
1. 基本理解問題（だれ・いつ・どこ・なに）: 2-3問
2. 理由・心情問題: 1-2問
3. 抜き出し問題: 1問（15文字以内の抜き出し）
4. 要約・主旨問題: 1問
5. 文の順序入れかえ問題: 1問（4つの文を並び替え）

【要件】
- 問題文は、小学生が理解しやすい簡潔な日本語で
- 選択問題は4択、本文に基づいた正解を1つ、本文と矛盾しない誤答を3つ
- 抜き出し問題は、本文から15文字以内で抜き出せる箇所を指定
- 順序入れかえ問題は、4つの文を並び替える形式

【出力形式】JSON形式
{
  "questions": [
    {
      "text": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "answer": 0,
      "type": "who",
      "format": "choice"
    },
    {
      "text": "問題文",
      "correctAnswer": "抜き出す文字列",
      "type": "extract",
      "format": "extract",
      "sourceText": "本文の該当箇所"
    },
    {
      "text": "問題文",
      "sentences": ["文1", "文2", "文3", "文4"],
      "correctOrder": [2, 0, 1, 3],
      "type": "order",
      "format": "order"
    }
  ]
}
`;

  // API呼び出し
  const response = await fetch('/api/reading-comprehension/llm-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, grade: 'high' })
  });

  const data = await response.json();
  return data.questions;
}
```

---

## 5. A4横・縦書きレイアウトとの相性

### 5.1 問題数の制御

```typescript
// 学年・レイアウトに応じた問題数制御
function getOptimalQuestionCount(grade: Grade, isVertical: boolean): number {
  if (isVertical) {
    // 縦書き: 問題数はやや少なめ
    return grade === 'low' ? 4 : grade === 'mid' ? 5 : 6;
  } else {
    // 横書き: 問題数はやや多め
    return grade === 'low' ? 5 : grade === 'mid' ? 6 : 7;
  }
}
```

### 5.2 文字量制御

```typescript
// 1問あたりの文字数制限
function validateQuestionLength(question: Question, isVertical: boolean): boolean {
  const maxLength = isVertical ? 80 : 100; // 縦書きはやや短め
  
  if (question.format === 'choice') {
    const totalLength = question.text.length + 
      question.choices.reduce((sum, c) => sum + c.length, 0);
    return totalLength <= maxLength;
  }
  
  if (question.format === 'extract') {
    return question.text.length <= maxLength;
  }
  
  return true;
}
```

---

## 6. 実装の優先順位

1. **Phase 1**: 型定義の拡張（`QuestionType`, `StoryMetadata`など）
2. **Phase 2**: 低学年向けルールベース生成器の実装
3. **Phase 3**: LLM API統合（中学年・高学年用）
4. **Phase 4**: メタ情報自動抽出機能（LLM活用）
5. **Phase 5**: UI改善（問題タイプ表示、メタ情報編集など）

---

## 7. まとめ

- **型定義**: `QuestionType`, `StoryMetadata`を導入し、学年に応じた問題生成を可能に
- **低学年**: ルールベースで「基本5問」を安定生成
- **中・高学年**: LLMを活用して多様な問題形式を生成
- **レイアウト**: 縦書き・横書きに応じた問題数・文字量制御
- **拡張性**: 段階的に機能追加可能な設計

