# 📋 不規則変化データセット完成報告

**作成日**: 2025-11-11  
**作業フェーズ**: Step 1 (不規則変化リスト作成) - **完了✅**

---

## ✅ 完成したファイル

### 1. `/data/irregular-verbs.json`
- **総数**: 62個の不規則動詞
- **ファイルサイズ**: 16KB (15,741 bytes)
- **構造**: 各動詞に `base`, `forms[]`, `cefr_level`, `eiken_grade`, `frequency`, `meanings`, `note` を含む

**優先度別分類**:
- **A1 (Grade 5)**: 33個 - 最重要動詞（be, have, do, go, come, see, get, make, take, eat など）
- **A2 (Grade 4)**: 28個 - 重要動詞（tell, speak, feel, find, leave, begin, bring など）
- **B1 (Grade Pre-2)**: 1個 - rise

**特殊ケース**:
- `be`: 7つの形（am, is, are, was, were, been, being）
- `read`: 過去形も'read'だが発音が異なる
- `put`, `let`, `cut`: 過去形が基本形と同じ
- `learn`: 過去形は learned/learnt の両方

---

### 2. `/data/irregular-nouns.json`
- **総数**: 23個の不規則名詞
- **ファイルサイズ**: 6.1KB (5,842 bytes)
- **構造**: 各名詞に `base`, `forms[]`, `cefr_level`, `eiken_grade`, `frequency`, `meanings`, `note` を含む

**カテゴリ別分類**:

#### A. 完全不規則変化（7個）
- `child → children`
- `person → people`
- `man → men`
- `woman → women`
- `tooth → teeth`
- `foot → feet`
- `mouse → mice`
- `goose → geese`

#### B. 単複同形（3個）
- `sheep → sheep`
- `deer → deer`
- `fish → fish` (種類を指す場合は'fishes')

#### C. f/fe → ves 変化（6個）
- `life → lives`
- `wife → wives`
- `knife → knives`
- `leaf → leaves`
- `half → halves`
- `shelf → shelves`

#### D. y → ies 変化（6個）
- `city → cities`
- `baby → babies`
- `country → countries`
- `family → families`
- `story → stories`

#### E. その他
- `ox → oxen`

---

### 3. `/data/irregular-adjectives.json`
- **総数**: 8個の不規則形容詞
- **ファイルサイズ**: 3.0KB (2,518 bytes)
- **構造**: 各形容詞に `base`, `forms[]`, `cefr_level`, `eiken_grade`, `frequency`, `meanings`, `note` を含む

**完全不規則変化（5個）**:
1. `good → better → best` (A1)
2. `bad → worse → worst` (A1)
3. `many → more → most` (A1, 可算名詞用)
4. `much → more → most` (A1, 不可算名詞用)
5. `little → less → least` (A1)

**複数形を持つもの（3個）**:
6. `far → farther/further → farthest/furthest` (A2)
   - farther/farthest = 距離
   - further/furthest = 程度・追加
7. `old → older/elder → oldest/eldest` (A1)
   - older/oldest = 一般的な年齢
   - elder/eldest = 家族の年齢順のみ
8. `late → later/latter → latest/last` (A1)
   - later/latest = 時間
   - latter/last = 順序

---

## 📊 統計サマリー

| カテゴリ | 総数 | A1 (Grade 5) | A2 (Grade 4) | B1+ |
|---------|------|--------------|--------------|-----|
| 不規則動詞 | 62 | 33 | 28 | 1 |
| 不規則名詞 | 23 | 17 | 5 | 1 |
| 不規則形容詞 | 8 | 6 | 1 | 0 |
| **合計** | **93** | **56** | **34** | **2** |

**展開見込み**:
- 不規則動詞 62個 → 約 **310個** の形（平均5形/動詞）
- 不規則名詞 23個 → 約 **46個** の形（複数形）
- 不規則形容詞 8個 → 約 **20個** の形（比較級・最上級）
- **合計**: 93個 → **約376個の活用形**

---

## 🎯 設計上の特徴

### 1. 優先度順の配置
- 各ファイルで **A1 (Grade 5)** を最初に配置
- 学習者に最重要な語彙へ優先アクセス可能

### 2. 詳細なメタデータ
各エントリーに以下を含む:
```json
{
  "base": "基本形",
  "forms": ["変化形1", "変化形2", ...],
  "cefr_level": "A1/A2/B1/B2",
  "eiken_grade": "5/4/pre-2/2/pre-1",
  "frequency": "highest/high/medium/low",
  "meanings": {
    "ja": "日本語の意味",
    "en": "English meaning"
  },
  "note": "特記事項（必要に応じて）"
}
```

### 3. 特殊ケースの明記
- 同形異音（read/read）
- 複数の変化形（far → farther/further）
- 使用場面の違い（elder/older）

---

## ⚙️ 技術的な意図

このデータセットは以下のために設計されました:

### 1. 活用形展開パイプラインの基礎
```typescript
// 不規則動詞の処理例
const irregularVerbs = require('./data/irregular-verbs.json');

function expandVerb(baseForm: string): string[] {
  const irregular = irregularVerbs.irregular_verbs.find(
    v => v.base === baseForm
  );
  
  if (irregular) {
    return [irregular.base, ...irregular.forms];
  } else {
    // 規則変化のロジックにフォールバック
    return regularVerbExpansion(baseForm);
  }
}
```

### 2. 語彙バリデーション時の逆引き
```typescript
// 活用形から基本形へのマッピング例
function lemmatize(word: string): string {
  // 不規則動詞から検索
  for (const verb of irregularVerbs.irregular_verbs) {
    if (verb.forms.includes(word)) {
      return verb.base;
    }
  }
  
  // 不規則名詞から検索
  for (const noun of irregularNouns.irregular_nouns) {
    if (noun.forms.includes(word)) {
      return noun.base;
    }
  }
  
  // 規則変化の処理
  return regularLemmatization(word);
}
```

### 3. D1データベースへのインポート
```sql
-- 不規則変化の専用テーブル
CREATE TABLE eiken_irregular_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_form TEXT NOT NULL,
  inflected_form TEXT NOT NULL,
  pos TEXT NOT NULL, -- 'verb', 'noun', 'adjective'
  cefr_level TEXT NOT NULL,
  eiken_grade TEXT NOT NULL,
  frequency TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inflected_form ON eiken_irregular_forms(inflected_form);
CREATE INDEX idx_base_form ON eiken_irregular_forms(base_form);
```

---

## 📝 次のステップ

✅ **Step 1: 不規則変化リスト作成** - **完了**

⏳ **Step 2: 活用形展開スクリプトのプロトタイプ作成**
1. 小規模テスト（A1動詞10個程度）
2. 規則動詞の展開ルール実装
   - 3人称単数: add -s/-es
   - 現在分詞: add -ing (doubling rules)
   - 過去形/過去分詞: add -ed (doubling rules)
3. 規則名詞の複数形ルール実装
   - add -s/-es
   - y → ies
   - f/fe → ves
4. 規則形容詞の比較級・最上級ルール実装
   - short words: -er/-est
   - long words: more/most
5. 不規則形との統合テスト

⏳ **Step 3: A1語彙の完全抽出**
- CEFR-J Wordlist Ver1.6.xlsx から A1 全1,166語を抽出
- CSV形式で出力
- 品詞別に整理

⏳ **Step 4: D1データベース設計とインポート**

---

## 🔧 使用方法（実装例）

### TypeScript/Honoでの読み込み
```typescript
import irregularVerbs from './data/irregular-verbs.json';
import irregularNouns from './data/irregular-nouns.json';
import irregularAdjectives from './data/irregular-adjectives.json';

// A1レベルの不規則動詞のみを取得
const a1Verbs = irregularVerbs.irregular_verbs.filter(
  v => v.cefr_level === 'A1'
);

// 英検5級の不規則名詞のみを取得
const grade5Nouns = irregularNouns.irregular_nouns.filter(
  n => n.eiken_grade === '5'
);

// 最頻出の不規則形容詞のみを取得
const highestFreqAdjs = irregularAdjectives.irregular_adjectives.filter(
  a => a.frequency === 'highest'
);
```

---

## 📚 参考資料

- **CEFR-J Wordlist Ver1.6**: 基準となる語彙レベル分類
- **英検公式語彙リスト**: 各級の出題語彙範囲
- **Oxford English Dictionary**: 不規則変化の確認
- **Cambridge Grammar**: 活用ルールの確認

---

**作成者**: Claude AI (Claude Code)  
**レビュー状態**: 初版完成、検証待ち  
**バージョン**: 1.0.0  
**最終更新**: 2025-11-11
