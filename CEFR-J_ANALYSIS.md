# CEFR-J Wordlist Ver1.6 データ分析

## 📊 基本情報

### ファイル概要
- **ファイル名**: CEFR-J Wordlist Ver1.6.xlsx
- **総行数**: 254,016行
- **作成者**: 東京外国語大学 投野由紀夫研究室
- **ライセンス**: 研究教育・商用利用可能（適切な引用が必要）

### シート構成
1. **説明シート** (約1-1000行): 語彙表の説明、改訂履歴
2. **ALL シート** (約1000-30000行): 全レベルの語彙統合
3. **A1 シート**: A1レベルのみ
4. **A2 シート**: A2レベルのみ
5. **B1 シート**: B1レベルのみ
6. **B2 シート**: B2レベルのみ
7. **ALL_sep シート**: 複数見出し語を分割した全体表
8. **A1_sep ~ B2_sep シート**: 各レベルの分割版

---

## 📈 語彙数統計

| CEFR Level | 項目数 (品詞別) | 見出し語数 | 日本の学年 | 英検級相当 |
|-----------|---------------|-----------|----------|----------|
| **A1** | **1,166** | **1,068** | 小学校〜中1 | **5級** |
| A2 | 1,411 | 1,352 | 中2〜高1 | 4級・3級 |
| B1 | 2,445 | 2,353 | 高2〜大学受験 | 準2級・2級 |
| B2 | 2,779 | 2,692 | 大学受験〜教養 | 準1級 |
| **全レベル** | **7,801** | **6,868** | - | - |

**重要な発見:**
- A1レベルは **1,166項目** (品詞別カウント)
- 実際の **見出し語数は1,068語**
- これは同じ単語でも品詞が異なると別項目としてカウントされるため
- 例: `book` (noun) と `book` (verb) は2項目

---

## 🗂️ データ構造

### カラム構成 (ALLシート)

| カラム番号 | カラム名 | 説明 | 例 |
|----------|---------|------|---|
| 1 | headword | 見出し語 | eat, book, happy |
| 2 | pos | 品詞 | noun, verb, adjective |
| 3 | **CEFR Level** | **CEFRレベル** | **A1, A2, B1, B2** |
| 4 | CoreInventory1 | 名詞の大分類カテゴリー | Food and drink |
| 5 | CoreInventory2 | 名詞の詳細カテゴリー | (空白が多い) |
| 6 | Threshold | Threshold Levelカテゴリー | (空白が多い) |

### 品詞 (pos) の種類
- `noun`: 名詞
- `verb`: 動詞
- `adjective`: 形容詞
- `adverb`: 副詞
- `preposition`: 前置詞
- `conjunction`: 接続詞
- `pronoun`: 代名詞
- `determiner`: 限定詞
- `be-verb`: be動詞
- `auxiliary verb`: 助動詞
- `interjection`: 間投詞
- `number`: 数詞

---

## 🔍 A1レベルの実例

### 確認できたA1単語のサンプル

| 単語 | 品詞 | カテゴリー |
|------|------|-----------|
| always | adverb | - |
| am | be-verb | - |
| awake | adjective | - |

### A1レベルの特徴
1. **基本的な日常語彙**
   - 家族: mother, father, brother, sister
   - 学校: school, teacher, student
   - 食べ物: eat, drink, food
   - 曜日・月: Monday, January
   
2. **基本動詞**
   - be動詞: am, is, are
   - 一般動詞: go, come, eat, drink, sleep

3. **基本形容詞**
   - big, small, happy, sad, good, bad

---

## ⚠️ 実装上の重要な発見

### 1. 活用形は含まれていない
- リストに含まれるのは **原形 (見出し語) のみ**
- `eat` はあるが、`eats`, `eating`, `ate`, `eaten` はリストにない
- **活用形展開が必須**

### 2. 不規則変化形の記載なし
- 不規則動詞の過去形・過去分詞は別途記載なし
- 例: `go` はあるが、`went`, `gone` の記載はない
- **不規則動詞マッピングが必須**

### 3. 複数形の記載なし
- 名詞の複数形は記載なし
- 例: `cat` はあるが、`cats` はない
- **複数形展開が必須**

### 4. 品詞が重複している
- 同じ単語でも品詞が異なると別エントリー
- 例: `book` (名詞) と `book` (動詞) は2エントリー
- **検証時は品詞を考慮する必要がある**

### 5. 頻度ランク情報がない
- `frequency_rank` や `zipf_score` の列は存在しない
- 頻度情報が必要な場合は別途追加が必要

---

## 📋 実装計画への影響

### 必須作業

1. **活用形展開パイプライン**
   - 規則動詞: eat → eats, eating, ate, eaten
   - 不規則動詞: go → goes, going, went, gone
   - 名詞複数形: cat → cats
   - 形容詞比較級: big → bigger, biggest

2. **不規則変化マッピング**
   - 不規則動詞約60個のリスト作成
   - 不規則名詞約12個のリスト作成
   - 不規則形容詞約6個のリスト作成

3. **D1テーブル設計**
   ```sql
   CREATE TABLE eiken_vocabulary_lexicon (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     word TEXT NOT NULL,           -- 実際の単語 (活用形含む)
     lemma TEXT NOT NULL,          -- 原形 (見出し語)
     pos TEXT NOT NULL,            -- 品詞
     cefr_level TEXT NOT NULL,     -- A1, A2, B1, B2
     inflection TEXT,              -- 活用の種類 (3sg, past, plural等)
     topic_category TEXT,          -- トピックカテゴリー
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(word, pos)
   );
   ```

4. **語彙数の見積もり**
   - 原形: 約7,800語
   - 活用形展開後: 約100,000〜150,000語 (推定)
   - A1のみ: 約1,200語 → 約10,000〜15,000語 (推定)

---

## 🎯 次のステップ

1. ✅ **CEFR-J Wordlistの構造確認** ← 完了
2. ⏳ **A1レベルの全単語リストを抽出する**
3. ⏳ **不規則動詞・名詞・形容詞のリスト作成**
4. ⏳ **活用形展開スクリプトのプロトタイプ作成**
5. ⏳ **D1テーブル作成とデータインポート**

---

## 📝 引用情報

```
『CEFR-J Wordlist Version 1.6』 
東京外国語大学投野由紀夫研究室
(Hub ファイルより取得 2025年11月)
```
