# 英検AI問題生成システム - 最終実装計画書

## 📊 3つのAIアドバイスの分析結果

### 共通する推奨事項（全員一致）

1. **プロンプト設計**: Option D (システムプロンプト強化) + Few-shot Learning
2. **語彙検証**: 方式A (D1データベース検索) + 活用形対応
3. **文法制御**: Few-shot Examples + 禁止パターンリスト
4. **コスト最適化**: gpt-4o-mini優先 + Prompt Caching
5. **実装順序**: データファースト（語彙DB構築が最優先）

### 重要な独自提案

#### ChatGPTの提案
- **軽量レマ化**: 規則ベースの簡易lemmatization（Workers適合）
- **KVキャッシュ**: 語彙検証結果を24時間キャッシュ
- **自動リライト**: 違反語のみをgpt-4o-miniで置換

#### GenSparkの提案
- **バッチ生成**: 10問まとめて生成してコスト削減
- **二軸検証**: CEFR level + Zipf頻度スコアの併用
- **エスカレーション戦略**: mini失敗時のみgpt-4o使用

#### Geminiの提案
- **データ前処理**: 活用形展開をバッチで事前実行
- **Cron Trigger**: ユーザーリクエストとAI生成を完全分離
- **非同期生成**: 承認済み問題プールから即座に返答

---

## 🎯 採用する最終戦略

### アーキテクチャ: ハイブリッド型

```
┌─────────────────────────────────────────────────────────┐
│                    ユーザーAPI                            │
│  GET /api/eiken/generate?grade=5&section=vocabulary     │
│  → D1から承認済み問題を即座に返答（10-50ms）              │
└─────────────────────────────────────────────────────────┘
                             ▲
                             │ 承認済み問題を格納
                             │
┌─────────────────────────────────────────────────────────┐
│               Cron Trigger Worker（10分毎）               │
│  1. gpt-4o-miniで問題生成（バッチ10問）                   │
│  2. 語彙・文法検証（D1 + KVキャッシュ）                    │
│  3. 違反あり→自動リライト（mini）                         │
│  4. リライト失敗→gpt-4oでエスカレーション                 │
│  5. 承認済み問題をD1に保存                                │
└─────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    D1 Database                           │
│  - eiken_vocabulary_lexicon (活用形展開済み100万語)       │
│  - eiken_generated_questions (承認済み問題プール)         │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 実装ステップ（Week-by-Week）

### Week 1: データ基盤構築

#### Day 1-2: CEFR-J語彙の活用形展開パイプライン

**目標**: 25万語 → 100万語（活用形含む）

```typescript
// scripts/expand-vocabulary.ts

interface VocabEntry {
  word: string;
  pos: string;      // 品詞
  cefr_level: string;
  frequency_rank?: number;
  topic_category?: string;
}

interface ExpandedEntry extends VocabEntry {
  lemma: string;    // 原形
  inflection?: string; // 活用の種類
}

class VocabularyExpander {
  // 動詞活用規則
  private expandVerb(base: string): ExpandedEntry[] {
    const results: ExpandedEntry[] = [];
    
    // 原形
    results.push({ word: base, lemma: base, pos: 'verb' });
    
    // 三人称単数
    if (base.endsWith('s') || base.endsWith('sh') || base.endsWith('ch') || 
        base.endsWith('x') || base.endsWith('o')) {
      results.push({ word: base + 'es', lemma: base, pos: 'verb', inflection: '3sg' });
    } else if (base.endsWith('y') && !this.isVowel(base[base.length - 2])) {
      results.push({ word: base.slice(0, -1) + 'ies', lemma: base, pos: 'verb', inflection: '3sg' });
    } else {
      results.push({ word: base + 's', lemma: base, pos: 'verb', inflection: '3sg' });
    }
    
    // 進行形
    if (this.shouldDoubleConsonant(base)) {
      results.push({ word: base + base[base.length - 1] + 'ing', lemma: base, pos: 'verb', inflection: 'gerund' });
    } else if (base.endsWith('e') && base.length > 2) {
      results.push({ word: base.slice(0, -1) + 'ing', lemma: base, pos: 'verb', inflection: 'gerund' });
    } else {
      results.push({ word: base + 'ing', lemma: base, pos: 'verb', inflection: 'gerund' });
    }
    
    // 過去形・過去分詞（規則動詞）
    if (base.endsWith('e')) {
      results.push({ word: base + 'd', lemma: base, pos: 'verb', inflection: 'past' });
    } else if (base.endsWith('y') && !this.isVowel(base[base.length - 2])) {
      results.push({ word: base.slice(0, -1) + 'ied', lemma: base, pos: 'verb', inflection: 'past' });
    } else if (this.shouldDoubleConsonant(base)) {
      results.push({ word: base + base[base.length - 1] + 'ed', lemma: base, pos: 'verb', inflection: 'past' });
    } else {
      results.push({ word: base + 'ed', lemma: base, pos: 'verb', inflection: 'past' });
    }
    
    return results;
  }
  
  // 不規則動詞マッピング
  private readonly irregularVerbs: Record<string, string[]> = {
    'be': ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
    'have': ['has', 'had', 'having'],
    'do': ['does', 'did', 'done', 'doing'],
    'go': ['goes', 'went', 'gone', 'going'],
    'eat': ['eats', 'ate', 'eaten', 'eating'],
    'drink': ['drinks', 'drank', 'drunk', 'drinking'],
    'see': ['sees', 'saw', 'seen', 'seeing'],
    'come': ['comes', 'came', 'coming'],
    'take': ['takes', 'took', 'taken', 'taking'],
    'get': ['gets', 'got', 'gotten', 'getting'],
    'make': ['makes', 'made', 'making'],
    'know': ['knows', 'knew', 'known', 'knowing'],
    'think': ['thinks', 'thought', 'thinking'],
    'say': ['says', 'said', 'saying'],
    'find': ['finds', 'found', 'finding'],
    'give': ['gives', 'gave', 'given', 'giving'],
    'tell': ['tells', 'told', 'telling'],
    'become': ['becomes', 'became', 'becoming'],
    'leave': ['leaves', 'left', 'leaving'],
    'feel': ['feels', 'felt', 'feeling'],
    'bring': ['brings', 'brought', 'bringing'],
    'begin': ['begins', 'began', 'begun', 'beginning'],
    'keep': ['keeps', 'kept', 'keeping'],
    'hold': ['holds', 'held', 'holding'],
    'write': ['writes', 'wrote', 'written', 'writing'],
    'stand': ['stands', 'stood', 'standing'],
    'hear': ['hears', 'heard', 'hearing'],
    'let': ['lets', 'letting'],
    'mean': ['means', 'meant', 'meaning'],
    'set': ['sets', 'setting'],
    'meet': ['meets', 'met', 'meeting'],
    'run': ['runs', 'ran', 'running'],
    'pay': ['pays', 'paid', 'paying'],
    'sit': ['sits', 'sat', 'sitting'],
    'speak': ['speaks', 'spoke', 'spoken', 'speaking'],
    'lie': ['lies', 'lay', 'lain', 'lying'],
    'lead': ['leads', 'led', 'leading'],
    'read': ['reads', 'reading'], // 過去形も'read'だが発音異なる
    'grow': ['grows', 'grew', 'grown', 'growing'],
    'lose': ['loses', 'lost', 'losing'],
    'fall': ['falls', 'fell', 'fallen', 'falling'],
    'send': ['sends', 'sent', 'sending'],
    'build': ['builds', 'built', 'building'],
    'understand': ['understands', 'understood', 'understanding'],
    'draw': ['draws', 'drew', 'drawn', 'drawing'],
    'break': ['breaks', 'broke', 'broken', 'breaking'],
    'spend': ['spends', 'spent', 'spending'],
    'cut': ['cuts', 'cutting'],
    'rise': ['rises', 'rose', 'risen', 'rising'],
    'drive': ['drives', 'drove', 'driven', 'driving'],
    'buy': ['buys', 'bought', 'buying'],
    'wear': ['wears', 'wore', 'worn', 'wearing'],
    'choose': ['chooses', 'chose', 'chosen', 'choosing'],
    'seek': ['seeks', 'sought', 'seeking'],
    'throw': ['throws', 'threw', 'thrown', 'throwing'],
    'catch': ['catches', 'caught', 'catching'],
    'deal': ['deals', 'dealt', 'dealing'],
    'win': ['wins', 'won', 'winning'],
    'forget': ['forgets', 'forgot', 'forgotten', 'forgetting'],
    'sell': ['sells', 'sold', 'selling'],
    'fight': ['fights', 'fought', 'fighting'],
    'teach': ['teaches', 'taught', 'teaching'],
    'fly': ['flies', 'flew', 'flown', 'flying'],
    'sleep': ['sleeps', 'slept', 'sleeping'],
    'sing': ['sings', 'sang', 'sung', 'singing']
  };
  
  // 名詞複数形
  private expandNoun(base: string): ExpandedEntry[] {
    const results: ExpandedEntry[] = [];
    
    results.push({ word: base, lemma: base, pos: 'noun', inflection: 'singular' });
    
    // 複数形
    if (base.endsWith('s') || base.endsWith('ss') || base.endsWith('sh') || 
        base.endsWith('ch') || base.endsWith('x') || base.endsWith('o')) {
      results.push({ word: base + 'es', lemma: base, pos: 'noun', inflection: 'plural' });
    } else if (base.endsWith('y') && !this.isVowel(base[base.length - 2])) {
      results.push({ word: base.slice(0, -1) + 'ies', lemma: base, pos: 'noun', inflection: 'plural' });
    } else if (base.endsWith('f')) {
      results.push({ word: base.slice(0, -1) + 'ves', lemma: base, pos: 'noun', inflection: 'plural' });
    } else if (base.endsWith('fe')) {
      results.push({ word: base.slice(0, -2) + 'ves', lemma: base, pos: 'noun', inflection: 'plural' });
    } else {
      results.push({ word: base + 's', lemma: base, pos: 'noun', inflection: 'plural' });
    }
    
    return results;
  }
  
  // 不規則名詞
  private readonly irregularNouns: Record<string, string> = {
    'child': 'children',
    'person': 'people',
    'man': 'men',
    'woman': 'women',
    'tooth': 'teeth',
    'foot': 'feet',
    'mouse': 'mice',
    'goose': 'geese',
    'ox': 'oxen',
    'sheep': 'sheep',
    'deer': 'deer',
    'fish': 'fish'
  };
  
  // 形容詞比較級・最上級
  private expandAdjective(base: string): ExpandedEntry[] {
    const results: ExpandedEntry[] = [];
    
    results.push({ word: base, lemma: base, pos: 'adjective', inflection: 'positive' });
    
    // 1音節または2音節（-y終わり）
    if (base.length <= 4 || base.endsWith('y')) {
      if (base.endsWith('e')) {
        results.push({ word: base + 'r', lemma: base, pos: 'adjective', inflection: 'comparative' });
        results.push({ word: base + 'st', lemma: base, pos: 'adjective', inflection: 'superlative' });
      } else if (base.endsWith('y')) {
        results.push({ word: base.slice(0, -1) + 'ier', lemma: base, pos: 'adjective', inflection: 'comparative' });
        results.push({ word: base.slice(0, -1) + 'iest', lemma: base, pos: 'adjective', inflection: 'superlative' });
      } else if (this.shouldDoubleConsonant(base)) {
        results.push({ word: base + base[base.length - 1] + 'er', lemma: base, pos: 'adjective', inflection: 'comparative' });
        results.push({ word: base + base[base.length - 1] + 'est', lemma: base, pos: 'adjective', inflection: 'superlative' });
      } else {
        results.push({ word: base + 'er', lemma: base, pos: 'adjective', inflection: 'comparative' });
        results.push({ word: base + 'est', lemma: base, pos: 'adjective', inflection: 'superlative' });
      }
    }
    
    return results;
  }
  
  // 不規則形容詞
  private readonly irregularAdjectives: Record<string, string[]> = {
    'good': ['better', 'best'],
    'bad': ['worse', 'worst'],
    'little': ['less', 'least'],
    'much': ['more', 'most'],
    'many': ['more', 'most'],
    'far': ['farther', 'farthest', 'further', 'furthest']
  };
  
  private isVowel(char: string): boolean {
    return ['a', 'e', 'i', 'o', 'u'].includes(char?.toLowerCase());
  }
  
  private shouldDoubleConsonant(word: string): boolean {
    if (word.length < 3) return false;
    const last = word[word.length - 1];
    const secondLast = word[word.length - 2];
    const thirdLast = word[word.length - 3];
    
    return !this.isVowel(last) && 
           this.isVowel(secondLast) && 
           !this.isVowel(thirdLast) &&
           !['w', 'x', 'y'].includes(last);
  }
  
  async expandAndSave(
    inputCsv: string,
    db: D1Database
  ): Promise<void> {
    // 1. CEFR-J Wordlistを読み込み
    const entries: VocabEntry[] = await this.parseCsv(inputCsv);
    
    // 2. 各単語を展開
    const expanded: ExpandedEntry[] = [];
    
    for (const entry of entries) {
      if (entry.pos === 'verb') {
        // 不規則動詞チェック
        if (this.irregularVerbs[entry.word]) {
          expanded.push({ ...entry, lemma: entry.word });
          for (const form of this.irregularVerbs[entry.word]) {
            expanded.push({ 
              ...entry, 
              word: form, 
              lemma: entry.word,
              inflection: 'irregular'
            });
          }
        } else {
          expanded.push(...this.expandVerb(entry.word).map(e => ({ ...entry, ...e })));
        }
      } else if (entry.pos === 'noun') {
        // 不規則名詞チェック
        if (this.irregularNouns[entry.word]) {
          expanded.push({ ...entry, lemma: entry.word, inflection: 'singular' });
          expanded.push({ 
            ...entry, 
            word: this.irregularNouns[entry.word],
            lemma: entry.word,
            inflection: 'plural'
          });
        } else {
          expanded.push(...this.expandNoun(entry.word).map(e => ({ ...entry, ...e })));
        }
      } else if (entry.pos === 'adjective') {
        // 不規則形容詞チェック
        if (this.irregularAdjectives[entry.word]) {
          expanded.push({ ...entry, lemma: entry.word, inflection: 'positive' });
          const [comp, superl] = this.irregularAdjectives[entry.word];
          expanded.push({ 
            ...entry, 
            word: comp,
            lemma: entry.word,
            inflection: 'comparative'
          });
          if (superl) {
            expanded.push({ 
              ...entry, 
              word: superl,
              lemma: entry.word,
              inflection: 'superlative'
            });
          }
        } else {
          expanded.push(...this.expandAdjective(entry.word).map(e => ({ ...entry, ...e })));
        }
      } else {
        // その他の品詞は原形のみ
        expanded.push({ ...entry, lemma: entry.word });
      }
    }
    
    // 3. D1にバッチインサート
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO eiken_vocabulary_lexicon 
      (word, lemma, pos, cefr_level, frequency_rank, topic_category, inflection)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const batches = [];
    for (const entry of expanded) {
      batches.push(
        stmt.bind(
          entry.word.toLowerCase(),
          entry.lemma.toLowerCase(),
          entry.pos,
          entry.cefr_level,
          entry.frequency_rank || null,
          entry.topic_category || null,
          entry.inflection || null
        )
      );
    }
    
    // D1のbatchは500件まで
    for (let i = 0; i < batches.length; i += 500) {
      await db.batch(batches.slice(i, i + 500));
    }
    
    console.log(`✅ Expanded ${entries.length} entries to ${expanded.length} forms`);
  }
  
  private async parseCsv(path: string): Promise<VocabEntry[]> {
    // CSV parsing logic here
    return [];
  }
}
```

#### Day 3-4: D1テーブル設計と最適化

```sql
-- eiken_vocabulary_lexicon テーブル（改良版）
CREATE TABLE IF NOT EXISTS eiken_vocabulary_lexicon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,                -- 活用形を含む実際の単語
  lemma TEXT NOT NULL,               -- 原形（見出し語）
  pos TEXT NOT NULL,                 -- 品詞
  cefr_level TEXT NOT NULL,          -- A1, A2, B1, B2, C1, C2
  grade_equivalent TEXT,             -- 英検級（5, 4, 3, pre-2, 2, pre-1, 1）
  frequency_rank INTEGER,            -- 頻度ランク（小さいほど頻出）
  zipf_score REAL,                   -- Zipfスコア（1.0-7.0）
  topic_category TEXT,               -- トピックカテゴリー
  inflection TEXT,                   -- 活用の種類（3sg, past, plural等）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(word, pos)                  -- 同じ単語でも品詞が違えば別エントリー
);

-- 高速検索用インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_word_pos ON eiken_vocabulary_lexicon(word, pos);
CREATE INDEX IF NOT EXISTS idx_lemma ON eiken_vocabulary_lexicon(lemma);
CREATE INDEX IF NOT EXISTS idx_cefr_level ON eiken_vocabulary_lexicon(cefr_level);
CREATE INDEX IF NOT EXISTS idx_grade ON eiken_vocabulary_lexicon(grade_equivalent);

-- eiken_generated_questions テーブル（改良版）
CREATE TABLE IF NOT EXISTS eiken_generated_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade TEXT NOT NULL,
  section TEXT NOT NULL,
  question_type TEXT NOT NULL,
  answer_type TEXT DEFAULT 'mcq',
  question_text TEXT NOT NULL,
  choices_json TEXT,                 -- JSON配列
  correct_answer_index INTEGER,
  explanation TEXT,
  explanation_ja TEXT,               -- 日本語解説
  translation_ja TEXT,               -- 問題文の日本語訳
  difficulty_score REAL,
  
  -- 検証結果
  vocab_validation_passed INTEGER DEFAULT 0,
  vocab_violation_ratio REAL,
  vocab_violations_json TEXT,        -- 違反語のリスト
  grammar_validation_passed INTEGER DEFAULT 0,
  grammar_violations_json TEXT,
  
  -- ステータス管理
  review_status TEXT DEFAULT 'pending', -- pending, approved, rejected
  generation_attempt INTEGER DEFAULT 1,
  model_used TEXT,                   -- gpt-4o-mini, gpt-4o
  
  -- メタデータ
  similarity_score REAL,
  copyright_safe INTEGER DEFAULT 1,
  generated_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_grade_section_status 
  ON eiken_generated_questions(grade, section, review_status);
CREATE INDEX IF NOT EXISTS idx_review_status 
  ON eiken_generated_questions(review_status);
```

#### Day 5-7: 語彙検証ロジック実装

```typescript
// src/eiken/services/vocabulary-validator.ts

interface ValidationResult {
  passed: boolean;
  violationRatio: number;
  violations: VocabViolation[];
  stats: {
    totalWords: number;
    uniqueWords: number;
    knownWords: number;
    unknownWords: number;
  };
}

interface VocabViolation {
  word: string;
  lemma?: string;
  actualLevel: string;
  targetLevel: string;
  zipfScore?: number;
}

export class VocabularyValidator {
  private db: D1Database;
  private kv?: KVNamespace; // オプショナル（キャッシュ用）
  
  constructor(db: D1Database, kv?: KVNamespace) {
    this.db = db;
    this.kv = kv;
  }
  
  async validate(
    text: string,
    targetGrade: string,
    options: {
      strictMode?: boolean;      // true = 0%違反許容, false = 5%違反許容
      useZipf?: boolean;          // Zipfスコアも考慮
      cacheDuration?: number;     // KVキャッシュ期間（秒）
    } = {}
  ): Promise<ValidationResult> {
    const { 
      strictMode = false, 
      useZipf = true,
      cacheDuration = 86400  // 24時間
    } = options;
    
    // 1. テキストをトークン化
    const tokens = this.tokenize(text);
    const uniqueTokens = Array.from(new Set(tokens));
    
    // 2. KVキャッシュチェック
    if (this.kv && cacheDuration > 0) {
      const cacheKey = `vocab:${targetGrade}:${uniqueTokens.sort().join(',')}`;
      const cached = await this.kv.get(cacheKey, 'json');
      if (cached) {
        return cached as ValidationResult;
      }
    }
    
    // 3. D1で一括検索（500件ずつチャンク）
    const chunks = this.chunkArray(uniqueTokens, 500);
    const allResults: Map<string, any> = new Map();
    
    for (const chunk of chunks) {
      const placeholders = chunk.map(() => '?').join(',');
      const result = await this.db.prepare(`
        SELECT word, lemma, pos, cefr_level, zipf_score
        FROM eiken_vocabulary_lexicon
        WHERE word IN (${placeholders})
      `).bind(...chunk).all();
      
      for (const row of result.results) {
        allResults.set(row.word as string, row);
      }
    }
    
    // 4. レベル判定
    const targetCefr = this.gradeToCefr(targetGrade);
    const violations: VocabViolation[] = [];
    const knownWords: string[] = [];
    const unknownWords: string[] = [];
    
    for (const token of uniqueTokens) {
      const entry = allResults.get(token);
      
      if (!entry) {
        // 機能語（a, the, I等）はスキップ
        if (this.isFunctionWord(token)) {
          knownWords.push(token);
          continue;
        }
        unknownWords.push(token);
        continue;
      }
      
      knownWords.push(token);
      
      // CEFRレベルチェック
      const isLevelOk = this.isLevelAllowed(entry.cefr_level, targetCefr);
      
      // Zipfスコアチェック（オプション）
      const isZipfOk = !useZipf || 
        !entry.zipf_score || 
        entry.zipf_score >= this.getMinZipf(targetGrade);
      
      if (!isLevelOk || !isZipfOk) {
        violations.push({
          word: token,
          lemma: entry.lemma,
          actualLevel: entry.cefr_level,
          targetLevel: targetCefr,
          zipfScore: entry.zipf_score
        });
      }
    }
    
    // 5. 合格判定
    const violationRatio = violations.length / uniqueTokens.length;
    const threshold = strictMode ? 0.0 : 0.05; // 5%許容
    
    const result: ValidationResult = {
      passed: violationRatio <= threshold && unknownWords.length === 0,
      violationRatio,
      violations,
      stats: {
        totalWords: tokens.length,
        uniqueWords: uniqueTokens.length,
        knownWords: knownWords.length,
        unknownWords: unknownWords.length
      }
    };
    
    // 6. KVキャッシュに保存
    if (this.kv && cacheDuration > 0) {
      const cacheKey = `vocab:${targetGrade}:${uniqueTokens.sort().join(',')}`;
      await this.kv.put(cacheKey, JSON.stringify(result), { expirationTtl: cacheDuration });
    }
    
    return result;
  }
  
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/['']/g, "'")     // スマートクオート正規化
      .replace(/[""]/g, '"')
      .replace(/[^\w\s'-]/g, ' ') // 記号除去
      .split(/\s+/)
      .filter(w => w.length > 0);
  }
  
  private isFunctionWord(word: string): boolean {
    const functionWords = new Set([
      'a', 'an', 'the',
      'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'my', 'your', 'his', 'her', 'its', 'our', 'their',
      'me', 'him', 'her', 'us', 'them',
      'this', 'that', 'these', 'those',
      'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'about',
      'and', 'or', 'but', 'so', 'because', 'if', 'when',
      'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
      'do', 'does', 'did', 'done', 'doing',
      'have', 'has', 'had', 'having',
      'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must',
      'not', "n't", 'no', 'yes',
      'what', 'where', 'when', 'why', 'who', 'how',
      'all', 'some', 'any', 'many', 'much', 'few', 'little',
      'more', 'most', 'other', 'another', 'such'
    ]);
    
    return functionWords.has(word);
  }
  
  private gradeToCefr(grade: string): string {
    const map: Record<string, string> = {
      '5': 'A1',
      '4': 'A1',
      '3': 'A2',
      'pre-2': 'A2',
      '2': 'B1',
      'pre-1': 'B2',
      '1': 'C1'
    };
    return map[grade] || 'A1';
  }
  
  private isLevelAllowed(actualLevel: string, targetLevel: string): boolean {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const actualIndex = levels.indexOf(actualLevel);
    const targetIndex = levels.indexOf(targetLevel);
    return actualIndex <= targetIndex;
  }
  
  private getMinZipf(grade: string): number {
    // Zipfスコア: 高頻度語ほど高い（1.0-7.0）
    const thresholds: Record<string, number> = {
      '5': 4.0,   // 頻出語のみ
      '4': 3.5,
      '3': 3.0,
      'pre-2': 2.5,
      '2': 2.0,
      'pre-1': 1.5,
      '1': 1.0
    };
    return thresholds[grade] || 4.0;
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

---

### Week 2: プロンプト強化と問題生成

#### Day 8-10: システムプロンプト + Few-shot実装

```typescript
// src/eiken/services/prompt-builder.ts

interface PromptConfig {
  grade: string;
  section: string;
  topicHint?: string;
  difficulty: number;
}

export class EikenPromptBuilder {
  private db: D1Database;
  
  async build(config: PromptConfig): Promise<{ system: string; user: string }> {
    // 1. 語彙サンプル取得（頻出50語）
    const vocabSample = await this.getTopVocabulary(config.grade, 50);
    
    // 2. Few-shot Examples取得（承認済み問題から）
    const examples = await this.getFewShotExamples(config.grade, config.section, 3);
    
    // 3. 文法制約取得
    const grammarRules = this.getGrammarRules(config.grade);
    
    return {
      system: this.buildSystemPrompt(config.grade, vocabSample, grammarRules),
      user: this.buildUserPrompt(config, examples)
    };
  }
  
  private buildSystemPrompt(
    grade: string,
    vocabSample: string[],
    grammarRules: string[]
  ): string {
    const levelInfo = this.getLevelInfo(grade);
    
    return `You are an expert EIKEN (英検) test creator specializing in Grade ${grade}.

# TARGET AUDIENCE
- Japanese students: ${levelInfo.targetAge}
- CEFR level: ${levelInfo.cefrLevel}
- Vocabulary size: ${levelInfo.vocabSize} words
- Description: ${levelInfo.description}

# CRITICAL VOCABULARY CONSTRAINTS
You MUST use ONLY ${levelInfo.cefrLevel}-level vocabulary.

✅ ALLOWED vocabulary examples (${levelInfo.cefrLevel} - most common words):
${vocabSample.slice(0, 30).join(', ')}

❌ ABSOLUTELY FORBIDDEN vocabulary (above ${levelInfo.cefrLevel}):
delighted, promotion, anxious, confused, enhance, remarkable, sophisticated, 
contemporary, inevitable, substantial, magnificent, elaborate, comprehensive

⚠️ GOLDEN RULE: If you're unsure about a word's level, always choose a simpler alternative.

# GRAMMAR CONSTRAINTS
ONLY use these grammar structures:
${grammarRules.map(r => `- ${r}`).join('\n')}

❌ NEVER use:
- Perfect tenses (have/has/had + past participle)
- Conditional perfect (would have + past participle)
- Complex relative clauses
- Passive voice (except simple present/past)
- Subjunctive mood

# QUALITY STANDARDS
1. Natural, realistic contexts relevant to Japanese learners
2. Topics: daily life, school, family, food, hobbies, sports
3. Culturally appropriate content
4. Clear, unambiguous correct answers
5. Plausible distractors (tempting but wrong choices)
6. Simple, direct sentences (max 12 words per sentence for Grade 5)

# OUTPUT FORMAT
Respond ONLY with valid JSON (no markdown, no explanations):
{
  "question_text": "...",
  "choices": ["A", "B", "C", "D"],
  "correct_answer_index": 0,
  "explanation": "...",
  "explanation_ja": "...",
  "translation_ja": "...",
  "vocabulary_used": ["word1", "word2", ...]
}`;
  }
  
  private buildUserPrompt(config: PromptConfig, examples: any[]): string {
    return `Generate ONE ${config.section} question for EIKEN Grade ${config.grade}.

${config.topicHint ? `Topic hint: ${config.topicHint}` : ''}
Difficulty: ${Math.round(config.difficulty * 100)}%

# EXAMPLES OF CORRECT QUESTIONS (Grade ${config.grade})
${examples.map((ex, i) => `
Example ${i + 1}:
Question: ${ex.question_text}
Choices: ${ex.choices.join(' / ')}
Correct: ${ex.correct_answer_index} (${ex.choices[ex.correct_answer_index]})
Explanation: ${ex.explanation}

Why this is good:
- Uses only A1 vocabulary: ${ex.vocabulary_used?.slice(0, 5).join(', ') || 'basic words'}
- Simple grammar: ${ex.grammar_note || 'present simple'}
- Clear context: ${ex.context_note || 'daily life'}
`).join('\n')}

Now create a COMPLETELY NEW question following these examples.
Remember: Use ONLY ${this.getLevelInfo(config.grade).cefrLevel}-level vocabulary!`;
  }
  
  private async getTopVocabulary(grade: string, limit: number): Promise<string[]> {
    const cefr = this.gradeToCefr(grade);
    
    const result = await this.db.prepare(`
      SELECT DISTINCT lemma
      FROM eiken_vocabulary_lexicon
      WHERE cefr_level = ?
        AND frequency_rank IS NOT NULL
      ORDER BY frequency_rank ASC
      LIMIT ?
    `).bind(cefr, limit).all();
    
    return result.results.map(r => r.lemma as string);
  }
  
  private async getFewShotExamples(
    grade: string,
    section: string,
    count: number
  ): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT 
        question_text,
        choices_json,
        correct_answer_index,
        explanation,
        explanation_ja
      FROM eiken_generated_questions
      WHERE grade = ?
        AND section = ?
        AND review_status = 'approved'
        AND vocab_validation_passed = 1
        AND grammar_validation_passed = 1
      ORDER BY RANDOM()
      LIMIT ?
    `).bind(grade, section, count).all();
    
    return result.results.map(r => ({
      question_text: r.question_text,
      choices: JSON.parse(r.choices_json as string),
      correct_answer_index: r.correct_answer_index,
      explanation: r.explanation,
      explanation_ja: r.explanation_ja
    }));
  }
  
  private getGrammarRules(grade: string): string[] {
    const grammarMap: Record<string, string[]> = {
      '5': [
        'Present simple (I eat, She eats)',
        'Past simple (I ate, She went)',
        'Future with "will" (I will go)',
        'Present continuous for now (I am eating)',
        'Basic questions (Do you...? Is she...?)',
        'Simple negatives (I don\'t like, She isn\'t happy)',
        'Basic prepositions (in, on, at, to, from)',
        'Simple conjunctions (and, but, or)',
        'Imperative (Please sit down, Don\'t run)'
      ],
      '4': [
        'All Grade 5 grammar',
        'Future with "be going to" (I am going to study)',
        'Comparative and superlative adjectives (bigger, biggest)',
        'Present perfect (basic: I have seen)',
        'Modal verbs (can, should, must)',
        'Basic relative clauses (The book that I read)',
        'There is/are constructions'
      ],
      '3': [
        'All Grade 4 grammar',
        'Present perfect continuous (I have been studying)',
        'Past continuous (I was eating)',
        'Passive voice (present/past: is made, was built)',
        'Conditional sentences Type 1 (If I study, I will pass)',
        'Relative pronouns (who, which, that, where)',
        'Indirect questions (I don\'t know where he is)'
      ]
    };
    
    return grammarMap[grade] || grammarMap['5'];
  }
  
  private getLevelInfo(grade: string) {
    const infoMap: Record<string, any> = {
      '5': {
        cefrLevel: 'A1',
        targetAge: '12-13 years (7th grade)',
        vocabSize: '600',
        description: 'Beginner level - First year of English study'
      },
      '4': {
        cefrLevel: 'A1-A2',
        targetAge: '13-14 years (8th grade)',
        vocabSize: '1,300',
        description: 'Elementary level - Second year of English study'
      },
      '3': {
        cefrLevel: 'A2',
        targetAge: '14-15 years (9th grade)',
        vocabSize: '2,100',
        description: 'Pre-intermediate level - Third year of English study'
      }
    };
    
    return infoMap[grade] || infoMap['5'];
  }
  
  private gradeToCefr(grade: string): string {
    const map: Record<string, string> = {
      '5': 'A1',
      '4': 'A1',
      '3': 'A2',
      'pre-2': 'A2',
      '2': 'B1',
      'pre-1': 'B2',
      '1': 'C1'
    };
    return map[grade] || 'A1';
  }
}
```

#### Day 11-14: Cron Trigger問題生成Worker実装

```typescript
// src/workers/eiken-generator.ts

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  OPENAI_API_KEY: string;
}

export default {
  // Cron Trigger: 10分毎に実行
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('🚀 Eiken Generator Cron triggered');
    
    try {
      const generator = new BatchQuestionGenerator(env);
      await generator.generate();
    } catch (error) {
      console.error('❌ Cron execution failed:', error);
    }
  }
};

class BatchQuestionGenerator {
  private env: Env;
  private validator: VocabularyValidator;
  private grammarChecker: GrammarValidator;
  private promptBuilder: EikenPromptBuilder;
  
  constructor(env: Env) {
    this.env = env;
    this.validator = new VocabularyValidator(env.DB, env.KV);
    this.grammarChecker = new GrammarValidator();
    this.promptBuilder = new EikenPromptBuilder(env.DB);
  }
  
  async generate() {
    // 1. 現在の問題プールを確認
    const needs = await this.checkInventory();
    
    if (needs.length === 0) {
      console.log('✅ Inventory is sufficient');
      return;
    }
    
    console.log(`📊 Need to generate: ${JSON.stringify(needs)}`);
    
    // 2. 各不足分に対して生成
    for (const need of needs) {
      await this.generateBatch(need.grade, need.section, need.count);
    }
  }
  
  // 問題プールの在庫チェック
  private async checkInventory(): Promise<Array<{grade: string; section: string; count: number}>> {
    const targets = [
      { grade: '5', section: 'vocabulary' },
      { grade: '5', section: 'grammar' },
      { grade: '4', section: 'vocabulary' },
      { grade: '4', section: 'grammar' }
    ];
    
    const needs: Array<{grade: string; section: string; count: number}> = [];
    
    for (const target of targets) {
      const result = await this.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM eiken_generated_questions
        WHERE grade = ?
          AND section = ?
          AND review_status = 'approved'
      `).bind(target.grade, target.section).first();
      
      const current = result?.count || 0;
      const minimum = 50; // 最低在庫
      
      if (current < minimum) {
        needs.push({
          ...target,
          count: minimum - current
        });
      }
    }
    
    return needs;
  }
  
  // バッチ生成（10問まとめて）
  private async generateBatch(
    grade: string,
    section: string,
    totalCount: number
  ) {
    const batchSize = 10;
    const batches = Math.ceil(totalCount / batchSize);
    
    for (let i = 0; i < batches; i++) {
      const count = Math.min(batchSize, totalCount - i * batchSize);
      
      try {
        await this.generateSingleBatch(grade, section, count);
      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error);
      }
      
      // レート制限対策（60 RPM）
      if (i < batches - 1) {
        await this.sleep(1000);
      }
    }
  }
  
  private async generateSingleBatch(
    grade: string,
    section: string,
    count: number
  ) {
    console.log(`🔄 Generating ${count} questions for Grade ${grade}, Section: ${section}`);
    
    // 1. プロンプト構築
    const prompts = await this.promptBuilder.build({
      grade,
      section,
      difficulty: 0.6
    });
    
    // 2. OpenAI API呼び出し（gpt-4o-mini）
    const batchPrompt = `${prompts.user}

Generate ${count} UNIQUE questions.
Each question must be COMPLETELY DIFFERENT from others.

Output format:
{
  "questions": [
    { "question_text": "...", "choices": [...], ... },
    { "question_text": "...", "choices": [...], ... },
    ...
  ]
}`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: prompts.system,
            // Prompt Caching有効化
            cache_control: { type: 'ephemeral' }
          },
          {
            role: 'user',
            content: batchPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);
    const questions = parsed.questions || [];
    
    console.log(`✅ Generated ${questions.length} questions`);
    
    // 3. 各問題を検証・保存
    for (const question of questions) {
      await this.validateAndSave(question, grade, section, 'gpt-4o-mini');
    }
  }
  
  private async validateAndSave(
    question: any,
    grade: string,
    section: string,
    model: string
  ) {
    const questionText = question.question_text || question.question || '';
    const choices = question.choices || [];
    const correctIndex = question.correct_answer_index ?? question.correctAnswerIndex;
    
    // 1. 語彙検証
    const fullText = `${questionText} ${choices.join(' ')}`;
    const vocabResult = await this.validator.validate(fullText, grade, {
      strictMode: false, // 5%許容
      useZipf: true
    });
    
    // 2. 文法検証
    const grammarResult = await this.grammarChecker.validate(questionText, grade);
    
    // 3. 検証結果に基づく処理
    let finalQuestion = question;
    let finalVocabResult = vocabResult;
    let finalGrammarResult = grammarResult;
    
    // 語彙違反があれば自動リライト
    if (!vocabResult.passed && vocabResult.violations.length > 0) {
      console.log(`⚠️ Vocab violations found, attempting rewrite...`);
      
      try {
        finalQuestion = await this.rewriteQuestion(
          question,
          vocabResult.violations.map(v => v.word)
        );
        
        // 再検証
        const rewrittenText = `${finalQuestion.question_text} ${finalQuestion.choices.join(' ')}`;
        finalVocabResult = await this.validator.validate(rewrittenText, grade, {
          strictMode: false,
          useZipf: true
        });
      } catch (error) {
        console.error('❌ Rewrite failed:', error);
      }
    }
    
    // 4. D1に保存
    const reviewStatus = 
      finalVocabResult.passed && finalGrammarResult.passed ? 'approved' : 'rejected';
    
    await this.env.DB.prepare(`
      INSERT INTO eiken_generated_questions (
        grade,
        section,
        question_type,
        answer_type,
        question_text,
        choices_json,
        correct_answer_index,
        explanation,
        explanation_ja,
        translation_ja,
        difficulty_score,
        vocab_validation_passed,
        vocab_violation_ratio,
        vocab_violations_json,
        grammar_validation_passed,
        grammar_violations_json,
        review_status,
        model_used,
        generated_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      grade,
      section,
      section,
      'mcq',
      finalQuestion.question_text,
      JSON.stringify(finalQuestion.choices),
      finalQuestion.correct_answer_index,
      finalQuestion.explanation || '',
      finalQuestion.explanation_ja || '',
      finalQuestion.translation_ja || '',
      0.6,
      finalVocabResult.passed ? 1 : 0,
      finalVocabResult.violationRatio,
      JSON.stringify(finalVocabResult.violations),
      finalGrammarResult.passed ? 1 : 0,
      JSON.stringify(finalGrammarResult.violations),
      reviewStatus,
      model,
    ).run();
    
    console.log(`${reviewStatus === 'approved' ? '✅' : '❌'} Question ${reviewStatus}`);
  }
  
  // 違反語のみを自動リライト
  private async rewriteQuestion(
    question: any,
    violationWords: string[]
  ): Promise<any> {
    const prompt = `Rewrite this question to replace ONLY the problematic words with simpler A1-level synonyms.
Do NOT change the grammar structure or meaning.

Problematic words: ${violationWords.join(', ')}

Original question:
${JSON.stringify(question)}

Return rewritten question in the same JSON format.`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });
    
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### Week 3: ユーザーAPI実装とテスト

#### Day 15-17: ユーザー向けAPI実装

```typescript
// src/eiken/routes/generate.ts（改良版）

const generate = new Hono<{ Bindings: EikenEnv }>();

/**
 * GET /api/eiken/generate?grade=5&section=vocabulary&count=5
 * 
 * 承認済み問題プールからランダムに問題を取得
 * （AIを呼び出さない高速API）
 */
generate.get('/', async (c) => {
  try {
    const grade = c.req.query('grade') || '5';
    const section = c.req.query('section') || 'vocabulary';
    const count = parseInt(c.req.query('count') || '5', 10);
    
    if (count < 1 || count > 20) {
      return c.json({
        success: false,
        error: 'Count must be between 1 and 20'
      }, 400);
    }
    
    // D1から承認済み問題を取得
    const result = await c.env.DB.prepare(`
      SELECT 
        id,
        question_text,
        choices_json,
        correct_answer_index,
        explanation,
        explanation_ja,
        translation_ja,
        difficulty_score
      FROM eiken_generated_questions
      WHERE grade = ?
        AND section = ?
        AND review_status = 'approved'
      ORDER BY RANDOM()
      LIMIT ?
    `).bind(grade, section, count).all();
    
    const questions = result.results.map(r => ({
      questionNumber: r.id,
      questionText: r.question_text,
      choices: JSON.parse(r.choices_json as string),
      correctAnswerIndex: r.correct_answer_index,
      explanation: r.explanation,
      explanationJa: r.explanation_ja,
      translationJa: r.translation_ja,
      difficulty: r.difficulty_score,
      copyrightSafe: true,
      copyrightScore: 100
    }));
    
    return c.json({
      success: true,
      generated: questions,
      questions, // 後方互換性
      rejected: 0,
      totalAttempts: count,
      saved: questions.length,
      source: 'pre-approved-pool'
    });
    
  } catch (error) {
    console.error('❌ API error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/generate/inventory
 * 
 * 現在の問題プール在庫状況
 */
generate.get('/inventory', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        grade,
        section,
        COUNT(*) as count,
        AVG(difficulty_score) as avg_difficulty,
        AVG(vocab_violation_ratio) as avg_violation_ratio
      FROM eiken_generated_questions
      WHERE review_status = 'approved'
      GROUP BY grade, section
      ORDER BY grade, section
    `).all();
    
    return c.json({
      success: true,
      inventory: result.results
    });
    
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default generate;
```

#### Day 18-21: 統合テストと品質チェック

```typescript
// tests/integration/eiken-generation.test.ts

describe('Eiken Generation System', () => {
  let db: D1Database;
  let kv: KVNamespace;
  
  beforeAll(async () => {
    // テスト用D1とKVのセットアップ
  });
  
  describe('Vocabulary Validation', () => {
    it('should pass A1 vocabulary', async () => {
      const text = 'I eat breakfast every morning. My mother cooks it.';
      const validator = new VocabularyValidator(db, kv);
      
      const result = await validator.validate(text, '5', { strictMode: false });
      
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
    
    it('should reject B1+ vocabulary', async () => {
      const text = 'I was delighted to receive the promotion.';
      const validator = new VocabularyValidator(db, kv);
      
      const result = await validator.validate(text, '5', { strictMode: false });
      
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.word === 'delighted')).toBe(true);
    });
  });
  
  describe('Question Generation', () => {
    it('should generate valid Grade 5 questions', async () => {
      const generator = new BatchQuestionGenerator({ DB: db, KV: kv, OPENAI_API_KEY: process.env.OPENAI_API_KEY! });
      
      await generator.generateSingleBatch('5', 'vocabulary', 3);
      
      const result = await db.prepare(`
        SELECT * FROM eiken_generated_questions
        WHERE grade = '5'
          AND review_status = 'approved'
        LIMIT 3
      `).all();
      
      expect(result.results.length).toBeGreaterThan(0);
      
      for (const q of result.results) {
        expect(q.vocab_validation_passed).toBe(1);
        expect(q.grammar_validation_passed).toBe(1);
        expect(q.vocab_violation_ratio).toBeLessThan(0.05);
      }
    });
  });
  
  describe('User API', () => {
    it('should return questions quickly', async () => {
      const start = Date.now();
      
      const response = await fetch('http://localhost:8787/api/eiken/generate?grade=5&section=vocabulary&count=5');
      const data = await response.json();
      
      const elapsed = Date.now() - start;
      
      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.generated.length).toBe(5);
      expect(elapsed).toBeLessThan(100); // 100ms以内
    });
  });
});
```

---

## 📈 期待される成果

### パフォーマンス目標

| 指標 | 目標値 | 実測予想 |
|------|--------|----------|
| ユーザーAPI応答時間 | <100ms | 20-50ms |
| 語彙検証精度 | >95% | 98% |
| 文法検証精度 | >90% | 85-90% |
| 承認率（初回生成） | >70% | 75% |
| API呼び出しコスト（100問） | <$0.50 | $0.15 |

### コスト削減効果

| 項目 | 従来方式 | 最適化後 | 削減率 |
|------|---------|---------|--------|
| モデル | gpt-4o | gpt-4o-mini | 90% |
| 生成方式 | 個別1問ずつ | バッチ10問 | 80% |
| キャッシュ | なし | あり | 50% |
| **総合** | **$3.00/100問** | **$0.15/100問** | **95%** |

---

## 🚀 次のステップ

1. **今週末**: 
   - CEFR-J WordlistのExcelをダウンロード
   - 活用形展開スクリプトのプロトタイプ作成

2. **Week 1開始時**:
   - D1テーブル作成
   - 語彙データインポート
   - 検証ロジック実装

3. **Week 2**:
   - プロンプト完成
   - Cron Worker実装

4. **Week 3**:
   - テスト・デバッグ
   - 5級完全リリース

---

## ✅ 成功の鍵

1. **データファースト**: 語彙DBの品質がすべて
2. **予防>治療**: プロンプトで80%防ぐ、検証で15%改善
3. **非同期分離**: ユーザーとAI生成を完全分離
4. **段階的改善**: 5級で完璧にしてから他級に展開

この計画に従えば、**高品質・低コスト・高速**な英検問題生成システムが実現できます！

ご質問や実装中の困りごとがあれば、いつでもお声がけください。🙇‍♂️
