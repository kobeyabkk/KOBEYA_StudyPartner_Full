# Week 2 効果測定レポート - 10問生成テスト

**実施日**: 2025-11-12  
**テスト対象**: 語彙レベルA1制約付き10問生成  
**本番URL**: https://72aadd19.kobeyabkk-studypartner.pages.dev

---

## 📊 実行結果サマリー

### 全体統計

| 指標 | 値 | 目標 | 達成度 |
|------|-----|------|--------|
| **問題生成成功率** | 100% (10/10) | 100% | ✅ 達成 |
| **語彙違反発生率** | **90% (9/10)** | <40% | ❌ 未達 |
| **自動リライト成功率** | N/A | >95% | - |
| **最終却下率** | **90%** | <2% | ❌ 大幅未達 |
| **総実行時間** | 35秒 | <60秒 | ✅ 達成 |

### 重大な発見

⚠️ **語彙バリデーションロジックに重大な問題を発見**

**問題**: データベースクエリが品詞を考慮せず、最初に見つかったエントリのみを返す

**影響**:
- 同じ単語で複数の品詞エントリがある場合、誤判定が発生
- 例: "good" (形容詞A1) が "good" (名詞B2) として判定される
- 例: "like" (動詞A1) が "like" (接続詞B1) として判定される

---

## 📋 10問の詳細分析

### Question 1: ❌ 語彙違反（3件）

**問題文**:
> Tom has a new _____ for carrying his books to school.

**検出された違反**:
- `tom` → C2（誤判定：固有名詞）
- `carrying` → C2（要確認）
- `books` → C2（誤判定：正しくはA1）

**分析**:
- 固有名詞が語彙レベルとして判定されている（除外すべき）
- "books"はA1レベルのはずだが、誤判定されている

---

### Question 2: ❌ 語彙違反（3件）

**問題文**:
> Tom likes to _____ books at the school library.

**検出された違反**:
- `tom` → C2（誤判定：固有名詞）
- `likes` → C2（誤判定：正しくはA1）
- `books` → C2（誤判定：正しくはA1）

**データベース確認結果**:
```json
{
  "word_lemma": "like",
  "pos": "conj",
  "cefr_level": "B1"
}
```

**問題**: 接続詞としてのエントリが返されている。動詞（A1）のエントリがあるはずだが選択されていない。

---

### Question 3: ✅ 違反なし

**問題文**:
> What do you use to write on the blackboard?

**分析**: 唯一の成功例。すべての単語がA1レベルとして認識された。

---

### Question 4: ❌ 語彙違反（5件）

**問題文**:
> Tom's mother asked him to _____ his room before the guests arrived.

**検出された違反**:
- `tom's` → C2（誤判定：固有名詞）
- `asked` → C2（誤判定：正しくはA1-A2）
- `room` → B1（要確認）
- `guests` → C2（要確認）
- `arrived` → C2（要確認）

**データベース確認結果**:
```json
{
  "word_lemma": "ask",
  "pos": "verb",
  "cefr_level": "A1"
}
```

**問題**: データベースではA1だが、バリデーションでC2判定。活用形の問題か？

---

### Question 5: ❌ 語彙違反（2件）

**問題文**:
> Tom forgot to bring his _____ to art class.

**検出された違反**:
- `tom` → C2（誤判定：固有名詞）
- `forgot` → C2（要確認）

---

### Question 6: ❌ 語彙違反（3件）

**問題文**:
> Tommy's grandmother is very _____. She likes gardening every weekend.

**検出された違反**:
- `tommy's` → C2（誤判定：固有名詞）
- `likes` → C2（誤判定：正しくはA1）
- `gardening` → B1（要確認）

---

### Question 7: ❌ 語彙違反（2件）

**問題文**:
> Tom always helps his _____ with their homework.

**検出された違反**:
- `tom` → C2（誤判定：固有名詞）
- `helps` → C2（誤判定：正しくはA1）

**データベース確認結果**:
```json
{
  "word_lemma": "help",
  "pos": "noun",
  "cefr_level": "A2"
}
```

**問題**: 名詞としてのエントリが返されている。動詞（A1）のエントリがあるはずだが選択されていない。

---

### Question 8: ❌ 語彙違反（3件）

**問題文**:
> Lisa's brother is very good at playing the piano. He is a _____.

**検出された違反**:
- `lisa's` → C2（誤判定：固有名詞）
- `good` → B2（誤判定：正しくはA1）
- `playing` → C2（要確認）

**データベース確認結果**:
```json
{
  "word_lemma": "good",
  "pos": "adj",
  "cefr_level": "A1"
}
```

**問題**: データベースでは形容詞としてA1だが、バリデーションでB2判定。複数エントリの選択ロジックに問題。

---

### Question 9: ❌ 語彙違反（3件）

**問題文**:
> In the classroom, the teacher asked the students to write their names on the _____.

**検出された違反**:
- `asked` → C2（誤判定：正しくはA1）
- `students` → C2（要確認）
- `names` → C2（要確認）

---

### Question 10: ❌ 語彙違反（1件）

**問題文**:
> In the art class, we use _____ to draw pictures.

**検出された違反**:
- `pictures` → C2（要確認）

---

## 🔍 根本原因分析

### 問題1: データベースクエリのLIMIT 1問題

**場所**: `src/eiken/lib/vocabulary-validator.ts:255`

**現在のコード**:
```typescript
const stmt = db.prepare(
  'SELECT * FROM eiken_vocabulary_lexicon WHERE word_lemma = ? LIMIT 1'
).bind(normalized);
```

**問題点**:
- 複数の品詞エントリがある場合、どのエントリが返されるか不定
- 最も簡単なレベル（A1）ではなく、最初に見つかったエントリが返される
- 結果として、"good"(形容詞A1)ではなく"good"(名詞B2)が選択される

**修正案**:
```typescript
const stmt = db.prepare(`
  SELECT * FROM eiken_vocabulary_lexicon 
  WHERE word_lemma = ? 
  ORDER BY 
    CASE cefr_level
      WHEN 'A1' THEN 1
      WHEN 'A2' THEN 2
      WHEN 'B1' THEN 3
      WHEN 'B2' THEN 4
      WHEN 'C1' THEN 5
      WHEN 'C2' THEN 6
      ELSE 7
    END ASC
  LIMIT 1
`).bind(normalized);
```

---

### 問題2: 固有名詞の判定

**問題点**:
- "Tom", "Tommy", "Lisa" などの固有名詞がC2と判定される
- 固有名詞は語彙レベル判定から除外すべき

**修正案**:
```typescript
function shouldIgnoreWord(word: string): boolean {
  // 固有名詞（大文字で始まる）を無視
  if (word[0] === word[0].toUpperCase()) {
    return true;
  }
  // その他の除外ロジック...
}
```

---

### 問題3: 活用形の処理

**問題点**:
- "likes", "asked", "carrying" などの活用形が正しく原型に変換されていない可能性
- 現在は簡易的な語尾処理のみ

**確認が必要**:
- レマタイゼーション（lemmatization）が正しく機能しているか
- 活用形→原型の変換精度

---

## 📈 期待値 vs 実測値

### シナリオ: 10問生成

| 指標 | 実装前（予測） | 実装後（目標） | 実測値 | 達成度 |
|------|---------------|---------------|--------|--------|
| 生成成功率 | 100% | 100% | **100%** | ✅ 100% |
| 語彙違反率 | 40% | <2% | **90%** | ❌ 0% |
| リライト成功率 | - | >95% | **N/A** | - |
| 最終却下率 | 40% | <2% | **90%** | ❌ 0% |
| 手作業時間 | 1.5時間 | ~0時間 | **N/A** | - |

### コスト分析

**実測値（バリデーションのみ）**:
- 10問生成: ~35秒
- バリデーション: 10問 × 0.3秒 = 3秒
- リライト: 0問（違反が多すぎて未実行）

**リライトが機能した場合の予測**:
- 9問リライト × 1.8秒 × 1,275トークン = 約16秒
- リライトAPIコスト: 9問 × 1,275トークン × ¥0.0044/1k = **¥50.5**

**結論**: 
- ❌ コスト削減目標未達（むしろ増加）
- ❌ 却下率削減目標未達（90% vs 目標<2%）

---

## 🎯 改善アクションプラン

### 優先度: 最高 - データベースクエリの修正

**タスク1**: 品詞を考慮した最小CEFRレベル選択

**実装**:
```typescript
// vocabulary-validator.ts
export async function lookupWord(
  word: string,
  db: D1Database
): Promise<VocabularyEntry | null> {
  const normalized = word.toLowerCase();
  
  // 最も低いCEFRレベルのエントリを選択
  const stmt = db.prepare(`
    SELECT * FROM eiken_vocabulary_lexicon 
    WHERE word_lemma = ? 
    ORDER BY 
      CASE cefr_level
        WHEN 'A1' THEN 1
        WHEN 'A2' THEN 2
        WHEN 'B1' THEN 3
        WHEN 'B2' THEN 4
        WHEN 'C1' THEN 5
        WHEN 'C2' THEN 6
        ELSE 7
      END ASC
    LIMIT 1
  `).bind(normalized);
  
  const result = await stmt.first<VocabularyEntry>();
  return result || null;
}
```

**影響範囲**:
- vocabulary-validator.ts
- vocabulary-cache.ts

**予想効果**:
- 誤判定率を50%以上削減
- 最終却下率を90% → 20-30%に改善

---

### 優先度: 高 - 固有名詞の除外

**タスク2**: 固有名詞を語彙チェックから除外

**実装**:
```typescript
function extractWords(text: string): Array<{word: string; position: number}> {
  // ... existing code ...
  
  return words.filter(item => {
    const word = item.word;
    
    // 固有名詞（大文字で始まる）を除外
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      return false;
    }
    
    return true;
  });
}
```

**予想効果**:
- 固有名詞による誤判定を100%削減
- 違反検出精度の向上

---

### 優先度: 中 - レマタイゼーションの改善

**タスク3**: 活用形処理の精度向上

**オプション**:
1. より高度な語尾処理ルール
2. 外部レマタイゼーションライブラリの導入（例: compromise.js）
3. データベースに活用形テーブルを追加

**予想効果**:
- "likes" → "like"の変換精度向上
- 活用形による誤判定の削減

---

## 📊 再テスト計画

### 修正後の再テスト手順

1. **ステップ1**: データベースクエリを修正
2. **ステップ2**: 固有名詞除外を実装
3. **ステップ3**: 同じ10問で再バリデーション
4. **ステップ4**: 新規10問を生成してテスト
5. **ステップ5**: 自動リライト機能のテスト
6. **ステップ6**: 最終効果測定

### 予想される改善結果

| 指標 | 現在 | 修正後（予測） |
|------|------|----------------|
| 語彙違反率 | 90% | 20-30% |
| 固有名詞誤判定 | 100% | 0% |
| 品詞誤判定 | ~60% | <5% |
| 最終却下率 | 90% | <5% |

---

## 🎓 学んだこと

### 技術的な学び

1. **データベース設計の重要性**
   - 複数品詞のエントリがある場合の取り扱いを事前に考慮すべき
   - `LIMIT 1`は便利だが、危険な場合もある

2. **バリデーションロジックの複雑性**
   - 固有名詞、活用形、品詞など、多くの要素を考慮する必要がある
   - 単純なルールでは不十分

3. **テストの重要性**
   - 本番環境での実テストで初めて発見される問題が多い
   - 単体テストだけでは不十分

### プロセスの学び

1. **段階的なテスト**
   - 小規模テスト（1-3問）→中規模テスト（10問）→大規模テスト（100問）の順が重要
   - 早期に問題を発見できる

2. **データ品質の重要性**
   - 語彙データベースの品質が最終結果に直結
   - データのクリーニングと検証が必須

3. **現実的な目標設定**
   - 95%削減という目標は達成可能だが、前提条件が重要
   - 品詞の問題、固有名詞の問題など、細部の詰めが必要

---

## 🔮 次のステップ

### 即座に実施すべきこと

1. ✅ **問題の文書化**（完了）
2. ⏳ **データベースクエリの修正**
3. ⏳ **固有名詞除外の実装**
4. ⏳ **10問で再テスト**

### Week 2完了のための条件

- [ ] 語彙違反率を30%以下に削減
- [ ] 自動リライト機能が正常動作
- [ ] 最終却下率を5%以下に削減
- [ ] 効果測定レポートの完成

### Week 3への移行条件

- Week 2の目標が80%以上達成
- 本番環境が安定稼働
- コスト効率が証明される

---

## 📝 結論

### 現状評価

⚠️ **Week 2は未完了** - 重大なバグを発見

**良かった点**:
- ✅ 自動リライト機能は単体で完璧に動作（信頼度0.95）
- ✅ 本番環境デプロイは成功
- ✅ 問題生成自体は正常に機能

**問題点**:
- ❌ 語彙バリデーションロジックに重大なバグ
- ❌ 90%の問題が誤って違反と判定
- ❌ コスト削減目標が未達成

### 提言

**即座に修正すべき**:
1. データベースクエリの品詞・CEFR レベル選択ロジック
2. 固有名詞の除外ロジック
3. 活用形処理の精度向上

**修正完了後の予測**:
- 却下率: 90% → **<5%**
- コスト削減: 0% → **>90%**
- Week 2目標: **達成可能**

---

**レポート作成日**: 2025-11-12  
**作成者**: AI Assistant  
**ステータス**: ⚠️ Week 2未完了（バグ修正必要）  
**次のアクション**: データベースクエリ修正の実装
