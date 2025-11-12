# 英検AI問題生成システム - 技術アドバイス依頼

## 📋 プロジェクト概要

日本の英語検定試験（英検）のAI問題生成システムを開発しています。
GPT-4oを使用して、各級（5級〜1級）に適した練習問題を自動生成します。

**技術スタック:**
- **バックエンド**: Cloudflare Workers + Hono
- **AI**: OpenAI GPT-4o
- **データベース**: Cloudflare D1 (SQLite)
- **フロントエンド**: React + TypeScript
- **語彙基準**: CEFR-J Wordlist (A1〜B2レベル)

---

## 🔴 現在の問題点

### 問題1: 語彙レベルの制御が不十分

**現象:**
- 英検5級（中1レベル、CEFR A1相当）の問題を生成しているが、実際には準1級レベルの難しい単語が多数出現している
- 例: `delighted`, `promotion`, `confused` など（これらはB1〜B2レベル）

**原因:**
現在のプロンプトには具体的な語彙制約が含まれていない

```typescript
const prompt = `You are an expert English test creator for Japanese students preparing for the EIKEN (英検) test.

Generate ONE UNIQUE ${section} question for EIKEN Grade ${grade}.

${topicHint ? `Topic hint: ${topicHint}` : ''}
Difficulty level: ${Math.round(difficulty * 100)}%

Requirements:
1. Question must be appropriate for EIKEN Grade ${grade} level
2. Provide 4 multiple-choice options
3. Include correct answer index (0-3)
...`;
```

**問題点:**
- 「appropriate for EIKEN Grade ${grade} level」という指示だけでは不十分
- CEFR-J語彙リストへの参照がない
- 具体的な語彙制約がない

---

### 問題2: 文法レベルの制御が不明確

**現象:**
- 5級には中1で習わない文法構造が含まれることがある
- 複雑な文構造や高度な時制が出現する

**原因:**
文法制約が全く指定されていない

---

## 📊 英検5級の正しいレベル定義

### 語彙レベル
- **CEFR-J**: A1レベル
- **語彙数**: 約600語
- **基本単語例:**
  - 動詞: eat, drink, sleep, walk, run, like, want, have, go, come
  - 名詞: cat, dog, apple, book, pen, school, mother, father
  - 形容詞: happy, sad, big, small, good, bad, new, old
  - 曜日: Monday, Tuesday, Wednesday...
  - 月: January, February, March...

### 文法レベル
- be動詞（am, is, are）の現在形・過去形
- 一般動詞の現在形・過去形
- 未来形（will, be going to）の基本
- 簡単な疑問文・否定文
- 単純な接続詞（and, but, or）
- 基本的な前置詞（in, on, at, to, from）

### ❌ 5級で使用してはいけない単語/文法の例
- **単語**: delighted (B1), promotion (B2), confused (A2-B1), anxious (B1)
- **文法**: 完了形、仮定法、関係代名詞の複雑な用法

---

## 🎯 目指したいゴール

1. **正確な語彙レベル制御**: 各級のCEFR-J語彙リストに厳密に準拠した問題生成
2. **適切な文法レベル**: 各級で学習する文法事項のみを使用
3. **実装の現実性**: Cloudflare Workersの制約（CPU時間、メモリ）内で実行可能
4. **コスト効率**: OpenAI APIの呼び出しコストを抑える

---

## 💾 利用可能なリソース

### 1. CEFR-J Wordlist
- A1〜B2レベルの約25万エントリー
- 各単語の品詞、レベル、トピックカテゴリーを含む
- Excel形式（D1データベースにインポート可能）

### 2. CEFR-J Grammar Profile
- A1〜B2レベルの文法項目リスト
- 各文法項目の使用頻度、教科書での出現頻度
- 複数のPDFドキュメント

### 3. 既存のD1データベーステーブル
```sql
CREATE TABLE eiken_vocabulary_lexicon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  pos TEXT,
  cefr_level TEXT,
  grade_equivalent TEXT,
  frequency_rank INTEGER,
  topic_category TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eiken_generated_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade TEXT NOT NULL,
  section TEXT NOT NULL,
  question_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  choices_json TEXT,
  correct_answer_index INTEGER,
  explanation TEXT,
  difficulty_score REAL,
  similarity_score REAL,
  review_status TEXT DEFAULT 'pending',
  generated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🤔 具体的な質問とアドバイス依頼

### Question 1: プロンプト設計のベストプラクティス
**現在の課題:**
- 単に「Grade 5 level」と指定するだけでは不十分
- 語彙リストをどのようにプロンプトに組み込むべきか？

**選択肢を検討中:**

**Option A: プロンプト内に許可単語リストを直接埋め込む**
```typescript
const allowedWords = await getA1Vocabulary(db); // 約600語取得
const prompt = `
Only use these A1-level words: ${allowedWords.slice(0, 100).join(', ')}...
Create a question using ONLY these words.
`;
```
**懸念点:**
- プロンプトが長くなりすぎる（トークン数増加）
- 600語全てを含めるとプロンプトが巨大化

**Option B: 段階的検証アプローチ**
```typescript
// Step 1: GPT-4oで問題生成（制約は緩め）
const question = await generateQuestion(grade);

// Step 2: 語彙レベルをチェック
const validation = await validateVocabulary(question, allowedWords);

// Step 3: NGなら再生成 or 修正依頼
if (!validation.passed) {
  return await regenerateWithFeedback(question, validation.violations);
}
```
**懸念点:**
- API呼び出し回数が増える（コスト増）
- 生成と検証の往復で時間がかかる

**Option C: Few-shot Learning（例示ベース）**
```typescript
const prompt = `
Here are examples of appropriate Grade 5 questions:

Example 1:
Question: I ____ breakfast every morning.
Choices: eat, eats, eating, ate
Correct: 0 (eat)

Example 2:
Question: My mother is a ____.
Choices: teacher, teaching, teaches, taught
Correct: 0 (teacher)

Now create a similar question using A1-level vocabulary like: 
${basicWords.join(', ')}
`;
```
**懸念点:**
- 例題が少ないと効果が薄い
- 多すぎるとトークン数が増える

**Option D: システムプロンプトで厳格なルールを設定**
```typescript
const systemPrompt = `
You are an English test creator specialized in EIKEN Grade 5 (CEFR A1).

STRICT RULES:
1. Use ONLY A1-level vocabulary (approx. 600 basic words)
2. A1 vocabulary includes: eat, drink, sleep, like, want, go, come, cat, dog, book, pen, happy, sad, big, small, etc.
3. NEVER use words above A1 level such as: delighted, promotion, anxious, confused, enhance, etc.
4. Use only simple grammar: present/past tense, basic questions, simple sentences
5. If unsure about a word level, choose a simpler alternative

Target students: 12-year-old Japanese students (7th grade, beginner level)
`;
```

**❓ どのアプローチが最も効果的ですか？**
- 複数を組み合わせるべきか？
- Cloudflare Workersの制約を考慮するとどれが現実的か？
- 他により良いアプローチはありますか？

---

### Question 2: 語彙検証の実装方法

**現在検討中のアプローチ:**

**方式A: 事前DB検索（高速だが不完全）**
```typescript
async function validateVocabulary(questionText: string, db: D1Database, targetLevel: string) {
  // 単語を抽出
  const words = questionText.toLowerCase().match(/\b[a-z]+\b/g) || [];
  
  // D1で語彙レベルをバッチ検索
  const results = await db.prepare(`
    SELECT word, cefr_level 
    FROM eiken_vocabulary_lexicon 
    WHERE word IN (${words.map(() => '?').join(',')})
  `).bind(...words).all();
  
  // レベル違反をチェック
  const violations = results.filter(r => r.cefr_level > targetLevel);
  
  return {
    passed: violations.length === 0,
    violations
  };
}
```
**問題点:**
- 活用形に対応できない（eating, ate, eatenなど）
- 複合語に対応できない

**方式B: Lemmatization（見出し語化）**
```typescript
import { lemmatize } from 'some-lemmatizer-library';

// eating → eat, went → go に変換してから検索
const lemmas = words.map(w => lemmatize(w));
const results = await db.prepare(`...`).bind(...lemmas).all();
```
**問題点:**
- Cloudflare Workersで動作する軽量なLemmatizerが必要
- npmパッケージのサイズ制約

**方式C: GPT-4oに検証させる**
```typescript
const validationPrompt = `
Analyze this question and identify any words above A1 (beginner) level:
"${questionText}"

A1 words: eat, drink, sleep, book, cat, dog, happy, sad...
Above A1: delighted, promotion, anxious, enhance...

List any problematic words and their levels.
`;
```
**問題点:**
- 追加のAPI呼び出しが必要（コスト増）
- 速度低下

**❓ どの方式が最もバランスが良いですか？**
- 精度とパフォーマンスのトレードオフをどう取るべきか？
- Cloudflare Workersで現実的に実装できる方法は？

---

### Question 3: 文法レベルの制御方法

文法レベルの制御は語彙よりも難しいと考えています。

**現在の考え:**
- プロンプトに許可する文法項目を列挙する
- 例文を多く示して学習させる

**❓ 文法レベルを効果的に制御する方法は？**
- Few-shot Learningが有効か？
- 文法チェックツールを併用すべきか？
- GPT-4oにとって文法制約はどの程度守られるか？

---

### Question 4: コスト最適化

**現在の課題:**
- 1問生成あたりGPT-4o API呼び出し: 1回
- 検証で再生成が発生: 追加1〜2回
- 20問生成する場合: 20〜60回の呼び出し

**❓ コストを抑えつつ品質を保つ方法は？**
- Prompt Cachingは効果的か？
- gpt-4o-miniで代替できる部分は？
- バッチ生成で効率化できるか？

---

### Question 5: 実装の優先順位

**現在のシステム状態:**
- ✅ フロントエンド完成（React）
- ✅ 基本的なAPI構造完成
- ✅ D1データベース設計完了
- ❌ 語彙データ未投入
- ❌ 語彙/文法制御未実装
- ❌ 検証ロジック未実装

**❓ 実装する順番のおすすめは？**

**Option A: データファースト**
1. CEFR-J WordlistをD1にインポート
2. 語彙検証ロジック実装
3. プロンプト改善

**Option B: プロンプトファースト**
1. プロンプトを詳細化（語彙リスト埋め込み）
2. 生成テスト
3. 問題があれば検証ロジック追加

**Option C: ハイブリッド**
1. システムプロンプトを強化（ルール明記）
2. 基本的な語彙リストをD1に投入
3. 簡易検証ロジック実装
4. 段階的に精度を向上

---

## 📚 参考情報

### 英検各級のレベル対応表
| 英検級 | CEFR-J | 対象学年 | 語彙数目安 | 文法レベル |
|--------|--------|----------|------------|------------|
| 5級 | A1 | 中1 | 約600語 | 基本的な現在形・過去形 |
| 4級 | A1-A2 | 中2 | 約1,300語 | 未来形、比較級 |
| 3級 | A2 | 中3 | 約2,100語 | 完了形の基礎 |
| 準2級 | A2-B1 | 高1〜2 | 約3,600語 | 受動態、関係代名詞 |
| 2級 | B1 | 高3 | 約5,100語 | 仮定法、複雑な構文 |
| 準1級 | B2 | 大学 | 約7,500語 | 高度な語彙・構文 |
| 1級 | C1 | 大学〜 | 約10,000語+ | ネイティブレベル |

### 既存の類似システムの例
- Duolingo: CEFR準拠の語彙・文法制御
- TOEFL iBT練習問題生成システム
- Cambridge English練習問題

---

## 🙏 アドバイスをお願いしたい点

1. **プロンプト設計**: 語彙・文法レベルを確実に制御するプロンプト設計のベストプラクティス
2. **検証ロジック**: 効率的で精度の高い語彙/文法レベル検証方法
3. **実装戦略**: Cloudflare Workersの制約下で最も現実的な実装アプローチ
4. **コスト最適化**: GPT-4o API呼び出しを抑えつつ品質を保つ方法
5. **優先順位**: 段階的に実装する場合の推奨順序

---

## 💭 現在の考察

**自分なりの仮説:**
- Option D（システムプロンプトの詳細化）+ Option B（段階的検証）の組み合わせが最もバランスが良いのではないか
- 語彙検証は方式Aを基本とし、活用形対応は簡易なマッピングテーブルで対処
- Few-shot Learningで文法レベルを制御
- 最初は5級のみ完璧にし、他の級に展開

**しかし懸念点:**
- プロンプトが長くなりすぎないか？
- 検証の往復でレスポンスが遅くならないか？
- Cloudflare Workersのタイムアウト（30秒）に収まるか？

---

## 🎯 期待する回答

以下のような具体的なアドバイスをいただけると助かります：

1. ✅ **推奨するアプローチ**: どの方式が最も効果的か、理由とともに
2. ✅ **実装の具体例**: 可能であればコードスニペットや疑似コード
3. ✅ **ピットフォール**: 避けるべき落とし穴や失敗パターン
4. ✅ **代替案**: より良いアプローチがあれば提案
5. ✅ **実装順序**: 段階的に進める場合の推奨ステップ

---

## 📎 追加コンテキスト

**現在のコードベース:**
- `/src/eiken/routes/generate.ts` - 問題生成APIエンドポイント
- `/src/components/eiken/QuestionGenerator.tsx` - フロントエンドUI
- `/src/eiken/types.ts` - TypeScript型定義

**制約条件:**
- Cloudflare Workers: CPU時間制限、メモリ制限
- OpenAI API: gpt-4oを使用（コスト考慮）
- D1 Database: SQLiteベース、クエリパフォーマンスに注意

**プロジェクトの目標:**
- 学習者が自宅で無制限に練習問題を解ける環境を提供
- 著作権フリーのオリジナル問題を自動生成
- 級別に正確なレベル調整された高品質な問題

---

**どのようなアドバイスでも歓迎します。よろしくお願いします！** 🙇‍♂️
