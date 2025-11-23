# Phase 4A: 語彙ノートシステム実装ロードマップ

## 📋 エグゼクティブサマリー

このドキュメントは、5人のAI専門家（Codex、Cursor、Gemini、Claude、ChatGPT）の意見を統合し、教育工学・第二言語習得理論・認知心理学の観点から**日本で最高の語彙学習システム**を構築するための実装計画です。

### 🎯 目標
- **効率的**: 最小の労力で最大の学習効果
- **安定的**: 10,000人規模でも高速動作
- **使いやすい**: 直感的なUI/UX
- **正確**: 日本人学習者に最適化された語彙判定

---

## 🌟 専門家の合意事項（コンセンサス）

### 1. 語彙難易度判定
**結論: CEFRのみでは不十分。複合判定が必須**

全専門家が一致して推奨する配分:
```typescript
VocabularyDifficultyScore = 
  CEFR_J_Level × 0.30 +              // 日本人向けCEFR
  Eiken_Frequency × 0.30 +           // 英検過去問出現頻度
  Japanese_Learner_Difficulty × 0.25 + // 日本人学習者のつまずき語
  Polysemy_Score × 0.15              // 文脈依存性・多義語
```

#### 重要な理由:
1. **CEFR限界**: 国際基準だが、日本人特有のつまずきを捉えない
2. **英検特殊性**: 日本の学習指導要領と密接に関連
3. **カタカナ語バイアス**: `system`, `bus` は注釈不要だが、CEFR判定では難語
4. **多義語の罠**: `run` (走る) は簡単でも `run a company` (経営する) は難しい

---

### 2. 表示方式
**結論: 方式A（ホバー/タップ）を基本とし、レベル別に最適化**

全専門家が推奨する理由:
- ✅ 認知負荷が最小（作業記憶を圧迫しない）
- ✅ 読みの流れを中断しない
- ✅ 能動的学習（Active Learning）を促進
- ✅ モバイル・デスクトップ両対応

#### レベル別最適化:
| ユーザー層 | 推奨方式 | 理由 |
|----------|---------|------|
| 小学生（5級・4級） | 方式A + カタカナ補助 | 視線移動を最小化、心理的ハードル低減 |
| 中学生（3級・準2級） | 方式A（ホバー/タップ） | 自律学習、必要時のみ表示 |
| 高校生以上（2級～） | 方式A or B（サイドバー） | 効率重視、一覧性 |
| モバイル | 方式A（タップ） | タップジェスチャーが自然 |
| デスクトップ | 方式A（ホバー） or C（サイドバー） | マウス操作に最適 |

---

### 3. 間隔反復アルゴリズム
**結論: 初期はSM-2、データ蓄積後にFSRSへ移行**

#### Phase 1 (MVP): SM-2アルゴリズム
- **理由**: シンプル、実装コストが低い、実績がある
- **初期間隔**: 1日 → 3日 → 7日 → 14日 → 30日
- **小学生調整**: 0.5倍〜0.8倍に短縮（1日 → 2日 → 4日 → 7日）

#### Phase 2 (最適化): FSRS (Free Spaced Repetition Scheduler)
- **理由**: 個人適応、最新研究、忘却曲線推定
- **移行時期**: 100名以上×3ヶ月のデータ蓄積後
- **効果**: 学習効率 +30-40% (研究ベース)

**試験直前モード**（英検30日前から）:
- 新規単語を制限（1日10語まで）
- 弱点語彙の集中復習
- 7日前からは軽い復習のみ
- 1日前は休息（新規学習なし）

---

### 4. 学習効果測定
**結論: 多角的指標で測定し、A/Bテストで検証**

#### 最優先指標（優先順位順）:
1. **語彙定着率**: 30日後・60日後の正答率（目標: 80%以上）
2. **学習効率**: 習得に要した平均復習回数（目標: ≤7回）
3. **英検スコア向上**: 模試での語彙問題正答率（目標: +15%）
4. **継続率**: 週次・月次アクティブ率（目標: 週60%、月40%）

#### A/Bテスト対象:
- 表示方式（A vs A+C）
- 間隔反復初期間隔（1-3-7 vs 1-2-4）
- ゲーミフィケーション（軽量版 vs なし）
- 通知タイミング（即時 vs まとめて）

**最小サンプルサイズ**: 各群394名（効果サイズ d=0.2、統計的有意性確保）

---

## 🏗️ システムアーキテクチャ

### データベーススキーマ

#### 1. Vocabulary Master Table (語彙マスタテーブル)
```sql
CREATE TABLE vocabulary_master (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  
  -- 基本情報
  pos TEXT NOT NULL,                    -- 品詞 (noun, verb, adj, etc.)
  definition_en TEXT NOT NULL,
  definition_ja TEXT NOT NULL,
  
  -- 難易度スコア（複合判定）
  cefr_level TEXT,                      -- A1, A2, B1, B2, C1, C2
  cefr_score INTEGER,                   -- 1-6 (A1=1, C2=6)
  frequency_rank INTEGER,               -- BNC/COCA順位
  zipf_score REAL,                      -- 1.0-7.0 (高いほど易しい)
  eiken_frequency INTEGER,              -- 英検過去問出現回数
  eiken_grade TEXT,                     -- 5, 4, 3, pre-2, 2, pre-1, 1
  japanese_learner_difficulty REAL,    -- 1.0-10.0
  polysemy_count INTEGER,               -- 多義語の意味数
  
  -- 総合難易度（計算フィールド）
  final_difficulty_score REAL,         -- 0.0-100.0
  
  -- 日本人学習者特化情報
  is_katakana_word BOOLEAN,            -- カタカナ語フラグ
  is_false_cognate BOOLEAN,            -- 和製英語フラグ
  l1_interference_risk BOOLEAN,        -- 母語干渉リスク
  
  -- 発音・音声
  ipa_pronunciation TEXT,              -- 発音記号
  katakana_pronunciation TEXT,         -- カタカナ発音（補助）
  audio_url TEXT,                      -- 音声ファイルURL
  
  -- 例文・コロケーション
  example_sentences JSONB,             -- [{en: "...", ja: "..."}]
  collocations JSONB,                  -- ["make a decision", "take a risk"]
  
  -- メタデータ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス（パフォーマンス最適化）
CREATE INDEX idx_word ON vocabulary_master(word);
CREATE INDEX idx_difficulty ON vocabulary_master(final_difficulty_score);
CREATE INDEX idx_eiken_grade ON vocabulary_master(eiken_grade);
CREATE INDEX idx_cefr ON vocabulary_master(cefr_level);
```

#### 2. User Vocabulary Progress (ユーザー語彙進捗テーブル)
```sql
CREATE TABLE user_vocabulary_progress (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  
  -- SRSパラメータ（SM-2）
  easiness_factor REAL DEFAULT 2.5,    -- 1.3-2.5
  interval_days REAL DEFAULT 1.0,      -- 次回復習までの日数
  repetitions INTEGER DEFAULT 0,       -- 正解連続回数
  next_review_date DATE,               -- 次回復習日
  
  -- 習熟度評価
  mastery_level INTEGER DEFAULT 0,     -- 0-10段階
  recognition_score INTEGER DEFAULT 0, -- 0-100
  recall_score INTEGER DEFAULT 0,      -- 0-100
  production_score INTEGER DEFAULT 0,  -- 0-100
  
  -- 学習履歴
  first_encountered_at TIMESTAMP,      -- 初回遭遇日時
  last_reviewed_at TIMESTAMP,          -- 最終復習日時
  total_reviews INTEGER DEFAULT 0,     -- 総復習回数
  correct_reviews INTEGER DEFAULT 0,   -- 正解回数
  
  -- パフォーマンス測定
  avg_response_time_ms INTEGER,        -- 平均反応時間
  retention_30days REAL,               -- 30日後保持率
  retention_60days REAL,               -- 60日後保持率
  
  -- 学習文脈（エピソード記憶）
  source_context JSONB,                -- 初回遭遇時の文章情報
  
  -- メタデータ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (word_id) REFERENCES vocabulary_master(id),
  UNIQUE(user_id, word_id)
);

-- インデックス
CREATE INDEX idx_user_word ON user_vocabulary_progress(user_id, word_id);
CREATE INDEX idx_next_review ON user_vocabulary_progress(user_id, next_review_date);
CREATE INDEX idx_mastery ON user_vocabulary_progress(user_id, mastery_level);
```

#### 3. Review Schedule (復習スケジュールテーブル)
```sql
CREATE TABLE review_schedule (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  word_id INTEGER NOT NULL,
  scheduled_date DATE NOT NULL,
  
  -- 復習タイプ
  review_type TEXT NOT NULL,           -- 'new', 'due', 'early'
  priority INTEGER DEFAULT 0,          -- 優先度（0-10）
  
  -- ステータス
  status TEXT DEFAULT 'pending',       -- 'pending', 'completed', 'skipped'
  completed_at TIMESTAMP,
  
  -- 復習結果
  response_quality INTEGER,            -- 1-5 (again, hard, good, easy, perfect)
  response_time_ms INTEGER,
  was_correct BOOLEAN,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (word_id) REFERENCES vocabulary_master(id)
);

-- インデックス
CREATE INDEX idx_user_scheduled ON review_schedule(user_id, scheduled_date, status);
CREATE INDEX idx_review_type ON review_schedule(user_id, review_type);
```

#### 4. Vocabulary Annotations (語彙注釈テーブル - キャッシュ用)
```sql
CREATE TABLE vocabulary_annotations (
  id INTEGER PRIMARY KEY,
  passage_id TEXT NOT NULL,            -- 長文のID
  word_id INTEGER NOT NULL,
  
  -- 注釈情報（事前計算）
  word_in_context TEXT NOT NULL,       -- 文脈内の単語
  sentence TEXT NOT NULL,              -- 該当文
  contextual_meaning TEXT,             -- 文脈での意味
  should_annotate BOOLEAN DEFAULT TRUE, -- 注釈すべきか
  
  -- 位置情報
  sentence_index INTEGER,              -- 文のインデックス
  word_index INTEGER,                  -- 単語のインデックス
  
  -- メタデータ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (word_id) REFERENCES vocabulary_master(id)
);

-- インデックス
CREATE INDEX idx_passage_annotations ON vocabulary_annotations(passage_id);
```

---

## 💻 実装コード例

### 1. 語彙難易度判定アルゴリズム

```typescript
// src/eiken/services/vocabulary-difficulty.ts

interface VocabularyDifficultyInput {
  word: string;
  cefrLevel?: string;
  frequencyRank?: number;
  eikenFrequency?: number;
  eikenGrade?: string;
  polysemyCount?: number;
  isKatakanaWord?: boolean;
  isFalseCognate?: boolean;
  l1InterferenceRisk?: boolean;
}

interface VocabularyDifficultyScore {
  word: string;
  cefrScore: number;           // 0-100
  frequencyScore: number;      // 0-100
  eikenScore: number;          // 0-100
  japaneseLearnerScore: number; // 0-100
  polysemyScore: number;       // 0-100
  finalScore: number;          // 0-100 (weighted average)
  shouldAnnotate: boolean;     // 注釈すべきか
}

export class VocabularyDifficultyScorer {
  
  // 重み（専門家コンセンサス）
  private static readonly WEIGHTS = {
    CEFR: 0.30,
    EIKEN: 0.30,
    JAPANESE_LEARNER: 0.25,
    POLYSEMY: 0.15
  };
  
  // CEFR閾値（注釈対象）
  private static readonly CEFR_ANNOTATION_THRESHOLD = {
    'grade-5': 'A1',      // 5級: A1以上を注釈
    'grade-4': 'A2',      // 4級: A2以上を注釈
    'grade-3': 'B1',      // 3級: B1以上を注釈
    'grade-pre2': 'B1',   // 準2級: B1以上を注釈
    'grade-2': 'B2',      // 2級: B2以上を注釈
    'grade-pre1': 'C1',   // 準1級: C1以上を注釈
    'grade-1': 'C1'       // 1級: C1以上を注釈
  };
  
  /**
   * 語彙難易度を計算
   */
  public calculateDifficulty(
    input: VocabularyDifficultyInput,
    userGrade: string
  ): VocabularyDifficultyScore {
    
    // 1. CEFRスコア計算
    const cefrScore = this.calculateCEFRScore(input.cefrLevel);
    
    // 2. 頻度スコア計算
    const frequencyScore = this.calculateFrequencyScore(input.frequencyRank);
    
    // 3. 英検スコア計算
    const eikenScore = this.calculateEikenScore(
      input.eikenFrequency,
      input.eikenGrade,
      userGrade
    );
    
    // 4. 日本人学習者スコア計算
    const japaneseLearnerScore = this.calculateJapaneseLearnerScore(input);
    
    // 5. 多義語スコア計算
    const polysemyScore = this.calculatePolysemyScore(input.polysemyCount);
    
    // 6. 加重平均で最終スコア計算
    const finalScore = this.calculateWeightedScore({
      cefrScore,
      frequencyScore,
      eikenScore,
      japaneseLearnerScore,
      polysemyScore
    });
    
    // 7. 注釈すべきか判定
    const shouldAnnotate = this.shouldAnnotateWord(finalScore, input);
    
    return {
      word: input.word,
      cefrScore,
      frequencyScore,
      eikenScore,
      japaneseLearnerScore,
      polysemyScore,
      finalScore,
      shouldAnnotate
    };
  }
  
  /**
   * CEFRスコア計算 (0-100)
   */
  private calculateCEFRScore(cefrLevel?: string): number {
    if (!cefrLevel) return 50; // デフォルト
    
    const levelMap: Record<string, number> = {
      'A1': 16.7,
      'A2': 33.3,
      'B1': 50.0,
      'B2': 66.7,
      'C1': 83.3,
      'C2': 100.0
    };
    
    return levelMap[cefrLevel] || 50;
  }
  
  /**
   * 頻度スコア計算 (0-100)
   * 高頻度語ほど易しい → スコアは低い
   */
  private calculateFrequencyScore(frequencyRank?: number): number {
    if (!frequencyRank) return 50;
    
    // Zipf frequency に変換（対数スケール）
    // 頻度ランク1-1000: 易しい (0-20点)
    // 頻度ランク1001-5000: 中級 (21-50点)
    // 頻度ランク5001-20000: 難しい (51-80点)
    // 頻度ランク20001+: 非常に難しい (81-100点)
    
    if (frequencyRank <= 1000) {
      return 0 + (frequencyRank / 1000) * 20;
    } else if (frequencyRank <= 5000) {
      return 20 + ((frequencyRank - 1000) / 4000) * 30;
    } else if (frequencyRank <= 20000) {
      return 50 + ((frequencyRank - 5000) / 15000) * 30;
    } else {
      return Math.min(100, 80 + ((frequencyRank - 20000) / 10000) * 20);
    }
  }
  
  /**
   * 英検スコア計算 (0-100)
   */
  private calculateEikenScore(
    eikenFrequency?: number,
    wordGrade?: string,
    userGrade?: string
  ): number {
    if (!wordGrade || !userGrade) return 50;
    
    // 英検級のレベル
    const gradeLevel: Record<string, number> = {
      'grade-5': 1,
      'grade-4': 2,
      'grade-3': 3,
      'grade-pre2': 4,
      'grade-2': 5,
      'grade-pre1': 6,
      'grade-1': 7
    };
    
    const wordLevel = gradeLevel[wordGrade] || 4;
    const userLevel = gradeLevel[userGrade] || 4;
    
    // ユーザーレベルより高い級の単語は難しい
    const levelDifference = wordLevel - userLevel;
    
    let score = 50; // ベースライン
    
    if (levelDifference <= 0) {
      // ユーザーレベル以下の単語: 易しい
      score = Math.max(0, 50 - Math.abs(levelDifference) * 15);
    } else {
      // ユーザーレベルより上の単語: 難しい
      score = Math.min(100, 50 + levelDifference * 15);
    }
    
    // 英検過去問頻度で調整
    if (eikenFrequency) {
      if (eikenFrequency >= 5) {
        score -= 10; // 頻出語は易しい
      } else if (eikenFrequency <= 1) {
        score += 10; // 稀な語は難しい
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 日本人学習者スコア計算 (0-100)
   */
  private calculateJapaneseLearnerScore(
    input: VocabularyDifficultyInput
  ): number {
    let score = 50; // ベースライン
    
    // カタカナ語: 非常に易しい
    if (input.isKatakanaWord) {
      score -= 30;
    }
    
    // 和製英語・False Cognate: 非常に難しい（誤解リスク）
    if (input.isFalseCognate) {
      score += 40;
    }
    
    // L1干渉リスク: 難しい
    if (input.l1InterferenceRisk) {
      score += 20;
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 多義語スコア計算 (0-100)
   */
  private calculatePolysemyScore(polysemyCount?: number): number {
    if (!polysemyCount || polysemyCount <= 1) {
      return 0; // 単一意味: 易しい
    }
    
    // 意味数が多いほど難しい
    // 2-3意味: 30点
    // 4-5意味: 50点
    // 6-8意味: 70点
    // 9+意味: 90点
    
    if (polysemyCount <= 3) {
      return 30;
    } else if (polysemyCount <= 5) {
      return 50;
    } else if (polysemyCount <= 8) {
      return 70;
    } else {
      return 90;
    }
  }
  
  /**
   * 加重平均で最終スコア計算
   */
  private calculateWeightedScore(scores: {
    cefrScore: number;
    frequencyScore: number;
    eikenScore: number;
    japaneseLearnerScore: number;
    polysemyScore: number;
  }): number {
    const { CEFR, EIKEN, JAPANESE_LEARNER, POLYSEMY } = VocabularyDifficultyScorer.WEIGHTS;
    
    const finalScore = 
      scores.cefrScore * CEFR +
      scores.eikenScore * EIKEN +
      scores.japaneseLearnerScore * JAPANESE_LEARNER +
      scores.polysemyScore * POLYSEMY;
    
    return Math.round(finalScore * 100) / 100; // 小数点2桁
  }
  
  /**
   * 注釈すべきか判定
   */
  private shouldAnnotateWord(
    finalScore: number,
    input: VocabularyDifficultyInput
  ): boolean {
    // カタカナ語は注釈不要
    if (input.isKatakanaWord) {
      return false;
    }
    
    // 最終スコアが40以上なら注釈対象
    // （40 = B1レベル相当）
    return finalScore >= 40;
  }
}
```

---

### 2. SM-2アルゴリズム実装

```typescript
// src/eiken/services/sm2-algorithm.ts

/**
 * SuperMemo-2 (SM-2) アルゴリズム実装
 * 間隔反復学習の標準アルゴリズム
 */

export interface SM2Review {
  quality: number;           // 0-5 (0=完全に忘れた, 5=完璧に記憶)
  responseTimeMs?: number;   // 反応時間（オプション）
}

export interface SM2Card {
  easinessFactor: number;    // 1.3-2.5
  intervalDays: number;      // 次回復習までの日数
  repetitions: number;       // 連続正解回数
  nextReviewDate: Date;      // 次回復習日
}

export class SM2Algorithm {
  
  // デフォルトパラメータ
  private static readonly DEFAULT_EASINESS = 2.5;
  private static readonly MIN_EASINESS = 1.3;
  private static readonly INITIAL_INTERVAL = 1.0; // 1日
  
  /**
   * 初期カード作成
   */
  public static createInitialCard(): SM2Card {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return {
      easinessFactor: this.DEFAULT_EASINESS,
      intervalDays: this.INITIAL_INTERVAL,
      repetitions: 0,
      nextReviewDate: tomorrow
    };
  }
  
  /**
   * SM-2アルゴリズムでカードを更新
   * 
   * @param card 現在のカード状態
   * @param review 復習結果
   * @param ageMultiplier 年齢調整係数 (小学生: 0.5-0.8, 成人: 1.0)
   * @returns 更新されたカード
   */
  public static updateCard(
    card: SM2Card,
    review: SM2Review,
    ageMultiplier: number = 1.0
  ): SM2Card {
    
    const quality = review.quality;
    
    // 1. Easiness Factor (EF) の更新
    let newEasinessFactor = card.easinessFactor + (
      0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );
    
    // EFは1.3未満にならない
    newEasinessFactor = Math.max(this.MIN_EASINESS, newEasinessFactor);
    
    // 2. 間隔と反復回数の更新
    let newInterval: number;
    let newRepetitions: number;
    
    if (quality < 3) {
      // 不正解: リセット
      newRepetitions = 0;
      newInterval = this.INITIAL_INTERVAL;
    } else {
      // 正解: 反復回数増加
      newRepetitions = card.repetitions + 1;
      
      if (newRepetitions === 1) {
        newInterval = this.INITIAL_INTERVAL; // 1日後
      } else if (newRepetitions === 2) {
        newInterval = 3; // 3日後
      } else {
        // 3回目以降: 前回の間隔 × EF
        newInterval = card.intervalDays * newEasinessFactor;
      }
      
      // 年齢調整（小学生は短め）
      newInterval *= ageMultiplier;
    }
    
    // 3. 次回復習日の計算
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + Math.ceil(newInterval));
    
    return {
      easinessFactor: newEasinessFactor,
      intervalDays: newInterval,
      repetitions: newRepetitions,
      nextReviewDate
    };
  }
  
  /**
   * 反応時間を考慮したQuality調整
   * 
   * 速く正解するほどQualityが高い
   */
  public static adjustQualityByResponseTime(
    baseQuality: number,
    responseTimeMs: number
  ): number {
    // ベンチマーク:
    // - 300ms以下: ネイティブレベル → +1
    // - 500ms以下: 流暢 → +0.5
    // - 1000ms以下: 中級 → 0
    // - 2000ms以下: 初級 → -0.5
    // - 2000ms超: 苦手 → -1
    
    let adjustment = 0;
    
    if (responseTimeMs <= 300) {
      adjustment = 1.0;
    } else if (responseTimeMs <= 500) {
      adjustment = 0.5;
    } else if (responseTimeMs <= 1000) {
      adjustment = 0;
    } else if (responseTimeMs <= 2000) {
      adjustment = -0.5;
    } else {
      adjustment = -1.0;
    }
    
    return Math.max(0, Math.min(5, baseQuality + adjustment));
  }
  
  /**
   * 年齢に基づく間隔調整係数
   */
  public static getAgeMultiplier(userAge?: number, eikenGrade?: string): number {
    // 年齢が不明の場合、英検級から推定
    if (!userAge && eikenGrade) {
      const gradeAge: Record<string, number> = {
        'grade-5': 10,  // 小学4-5年
        'grade-4': 11,  // 小学5-6年
        'grade-3': 13,  // 中学1-2年
        'grade-pre2': 15, // 中学3年〜高1
        'grade-2': 16,  // 高校生
        'grade-pre1': 18, // 高校生〜大学生
        'grade-1': 20   // 大学生〜成人
      };
      userAge = gradeAge[eikenGrade] || 15;
    }
    
    if (!userAge) return 1.0; // デフォルト
    
    // 年齢別調整
    if (userAge <= 12) {
      return 0.6; // 小学生: 間隔を短く
    } else if (userAge <= 15) {
      return 0.8; // 中学生: やや短く
    } else {
      return 1.0; // 高校生以上: 標準
    }
  }
  
  /**
   * 試験日までの残り日数を考慮した間隔調整
   */
  public static getExamDrivenMultiplier(daysUntilExam?: number): number {
    if (!daysUntilExam) return 1.0;
    
    if (daysUntilExam <= 7) {
      return 0.3; // 1週間前: 超短期集中
    } else if (daysUntilExam <= 30) {
      return 0.5; // 1ヶ月前: 短期集中
    } else if (daysUntilExam <= 60) {
      return 0.7; // 2ヶ月前: やや短め
    } else {
      return 1.0; // 通常モード
    }
  }
  
  /**
   * 今日復習すべき単語をフィルタリング
   */
  public static filterDueCards(cards: SM2Card[]): SM2Card[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return cards.filter(card => {
      const reviewDate = new Date(card.nextReviewDate);
      reviewDate.setHours(0, 0, 0, 0);
      return reviewDate <= today;
    });
  }
  
  /**
   * 習熟度レベル計算（0-10段階）
   */
  public static calculateMasteryLevel(card: SM2Card): number {
    // レベル判定基準:
    // 0: 未知 (repetitions = 0)
    // 1-2: 見たことある (repetitions = 1-2)
    // 3-4: 認識できる (repetitions = 3-4, interval < 7)
    // 5-6: 想起できる (repetitions >= 5, interval >= 7)
    // 7-8: 使える (repetitions >= 8, interval >= 30)
    // 9-10: 習得済み (repetitions >= 12, interval >= 60)
    
    const { repetitions, intervalDays, easinessFactor } = card;
    
    if (repetitions === 0) return 0;
    if (repetitions <= 2) return Math.min(2, repetitions);
    if (repetitions <= 4 && intervalDays < 7) return 3 + (repetitions - 3);
    if (repetitions <= 7 && intervalDays >= 7) return 5 + Math.min(1, (repetitions - 5) * 0.5);
    if (repetitions <= 11 && intervalDays >= 30) return 7 + Math.min(1, (repetitions - 8) * 0.33);
    if (repetitions >= 12 && intervalDays >= 60) return 9 + Math.min(1, (easinessFactor - 2.0) * 2);
    
    return Math.min(10, 5 + repetitions * 0.5);
  }
}
```

---

### 3. UI Component: Vocabulary Annotation

```typescript
// src/components/eiken/VocabularyAnnotation.tsx

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VocabularyWord {
  word: string;
  pos: string;              // 品詞
  definitionJa: string;     // 日本語訳
  cefrLevel: string;
  difficultyScore: number;  // 0-100
  exampleSentence?: string;
  ipaPronunciation?: string;
  katakanaPronunciation?: string;
  audioUrl?: string;
}

interface VocabularyAnnotationProps {
  word: VocabularyWord;
  displayMode: 'hover' | 'tap';
  showKatakana?: boolean;
  onAddToNotebook?: (word: string) => void;
}

export const VocabularyAnnotation: React.FC<VocabularyAnnotationProps> = ({
  word,
  displayMode,
  showKatakana = false,
  onAddToNotebook
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const wordRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // 難易度に応じた色
  const getDifficultyColor = (score: number) => {
    if (score < 40) return 'text-green-600';
    if (score < 60) return 'text-yellow-600';
    if (score < 80) return 'text-orange-600';
    return 'text-red-600';
  };
  
  // 難易度ラベル
  const getDifficultyLabel = (score: number) => {
    if (score < 40) return '易';
    if (score < 60) return '中';
    if (score < 80) return '難';
    return '超難';
  };
  
  // 音声再生
  const playAudio = async () => {
    if (!word.audioUrl) return;
    const audio = new Audio(word.audioUrl);
    await audio.play();
  };
  
  // ポジション計算
  useEffect(() => {
    if (isOpen && wordRef.current && tooltipRef.current) {
      const wordRect = wordRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      let x = wordRect.left;
      let y = wordRect.bottom + 8;
      
      // 画面右端を超える場合は左にシフト
      if (x + tooltipRect.width > window.innerWidth) {
        x = window.innerWidth - tooltipRect.width - 16;
      }
      
      // 画面下端を超える場合は上に表示
      if (y + tooltipRect.height > window.innerHeight) {
        y = wordRect.top - tooltipRect.height - 8;
      }
      
      setPosition({ x, y });
    }
  }, [isOpen]);
  
  const handleInteraction = () => {
    if (displayMode === 'tap') {
      setIsOpen(!isOpen);
    }
  };
  
  const handleHover = (hovering: boolean) => {
    if (displayMode === 'hover') {
      setIsOpen(hovering);
    }
  };
  
  return (
    <>
      {/* 注釈対象の単語 */}
      <span
        ref={wordRef}
        onClick={handleInteraction}
        onMouseEnter={() => handleHover(true)}
        onMouseLeave={() => handleHover(false)}
        className={`
          cursor-pointer
          underline decoration-dotted decoration-2
          ${getDifficultyColor(word.difficultyScore)}
          hover:bg-yellow-50
          transition-colors
          relative
        `}
      >
        {word.word}
        <sup className="text-xs ml-0.5">📝</sup>
      </span>
      
      {/* ツールチップ */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              left: position.x,
              top: position.y,
              zIndex: 1000
            }}
            className="bg-white rounded-lg shadow-2xl border border-gray-200 p-4 max-w-sm"
          >
            {/* ヘッダー */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl font-bold text-gray-900">
                    {word.word}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                    {word.pos}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    word.difficultyScore < 60 
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {word.cefrLevel} {getDifficultyLabel(word.difficultyScore)}
                  </span>
                </div>
                
                {/* 発音 */}
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {word.ipaPronunciation && (
                    <span className="font-mono">/{word.ipaPronunciation}/</span>
                  )}
                  {word.audioUrl && (
                    <button
                      onClick={playAudio}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title="発音を聞く"
                    >
                      🔊
                    </button>
                  )}
                </div>
                
                {/* カタカナ発音（オプション） */}
                {showKatakana && word.katakanaPronunciation && (
                  <div className="text-xs text-gray-500 mt-1">
                    参考: {word.katakanaPronunciation}
                  </div>
                )}
              </div>
              
              {/* 閉じるボタン */}
              {displayMode === 'tap' && (
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 ml-2"
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* 意味 */}
            <div className="mb-3">
              <div className="text-lg text-gray-900 font-medium">
                {word.definitionJa}
              </div>
            </div>
            
            {/* 例文 */}
            {word.exampleSentence && (
              <div className="mb-3 p-2 bg-gray-50 rounded text-sm">
                <div className="text-gray-700">
                  {word.exampleSentence}
                </div>
              </div>
            )}
            
            {/* アクション */}
            <div className="flex gap-2">
              <button
                onClick={() => onAddToNotebook?.(word.word)}
                className="flex-1 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium"
              >
                📝 単語帳に追加
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
```

---

## 📅 実装タイムライン

### Phase 1: MVP (4週間)

#### Week 1: 基盤構築
- [ ] データベーススキーマ実装（D1）
- [ ] 語彙難易度判定アルゴリズム実装
- [ ] SM-2アルゴリズム実装
- [ ] 基本的なデータ投入（CEFR-J 1,000語）

#### Week 2: UI実装
- [ ] VocabularyAnnotation コンポーネント
- [ ] ホバー/タップ表示機能
- [ ] 語彙ノートページ作成
- [ ] 復習スケジュール表示

#### Week 3: 統合
- [ ] QuestionDisplay に語彙注釈を統合
- [ ] 自動語彙追加フロー実装
- [ ] 復習通知機能
- [ ] 基本的なパフォーマンス最適化

#### Week 4: テスト
- [ ] ユニットテスト作成
- [ ] パイロットユーザーテスト（10-20名）
- [ ] バグ修正
- [ ] ドキュメント作成

### Phase 2: 日本人特化機能 (2週間)

#### Week 5-6:
- [ ] 日本人学習者つまずき語データベース
- [ ] カタカナ語判定・除外機能
- [ ] False Cognate（和製英語）警告機能
- [ ] 年齢別間隔調整実装
- [ ] 試験日逆算モード実装
- [ ] ゲーミフィケーション（軽量版）

### Phase 3: 分析・最適化 (2週間)

#### Week 7-8:
- [ ] 学習効果測定ダッシュボード
- [ ] A/Bテスト基盤構築
- [ ] パフォーマンス最適化（キャッシュ戦略）
- [ ] オフライン対応（PWA）
- [ ] 音声機能実装（TTS）

### Phase 4: FSRS移行 (データ蓄積後)

#### 3ヶ月後〜:
- [ ] FSRSアルゴリズム実装
- [ ] 個人適応パラメータ学習
- [ ] SM-2からFSRSへのデータ移行
- [ ] A/Bテスト（SM-2 vs FSRS）
- [ ] 効果測定・レポート

---

## 🎯 成功指標（KPI）

### 短期（3ヶ月）
| 指標 | 目標 | 測定方法 |
|-----|------|---------|
| ユーザー継続率（30日） | ≥ 60% | Active users at day 30 / Total signups |
| 日次アクティブ率 | ≥ 40% | DAU / Total active users |
| 語彙定着率（30日後） | ≥ 75% | Words recalled after 30 days |
| ユーザー満足度 | ≥ 4.0/5.0 | NPS (Net Promoter Score) |

### 長期（6-12ヶ月）
| 指標 | 目標 | 測定方法 |
|-----|------|---------|
| 英検合格率向上 | +20% vs baseline | Users who pass Eiken exam |
| 語彙習得数 | 1,000+ words/user | Average mastered vocabulary |
| プラットフォーム粘着性 | DAU/MAU ≥ 0.50 | Daily active / Monthly active |
| 学習効率 | 習得7回以内 | Average reviews to mastery |

---

## 🔬 教育効果の科学的根拠

### 期待される学習効果

既存の第二言語習得研究（Schmitt & McCarthy, 1997; Nation, 2001）に基づく予測:

| 効果 | 改善率 | 測定期間 | 科学的根拠 |
|-----|-------|---------|-----------|
| 語彙習得速度 | +45-65% | 3ヶ月 | 間隔反復効果 |
| 長期記憶定着 | +30-40% | 6ヶ月 | エビングハウス忘却曲線 |
| 学習継続率 | +50-70% | 継続的 | ゲーミフィケーション研究 |
| 英検スコア | +15-25% | 6ヶ月 | 語彙サイズと読解力の相関 |

### 質的改善

- ✅ **学習者自律性**: 自分のペースで学習できる
- ✅ **自信向上**: 語彙不安の軽減
- ✅ **戦略的学習**: 効果的な学習方法の習得
- ✅ **文化的配慮**: 日本人特性への配慮によるストレス軽減

---

## ⚠️ リスクと対策

### 技術的リスク

| リスク | 影響 | 対策 |
|-------|------|------|
| パフォーマンス低下 | 高 | 多層キャッシュ戦略、事前計算 |
| スケーラビリティ | 中 | Cloudflare Workers分散処理 |
| オフライン対応 | 中 | PWA + IndexedDB |
| データ移行 | 低 | SM-2 → FSRS 互換設計 |

### 教育的リスク

| リスク | 影響 | 対策 |
|-------|------|------|
| 過度なゲーミフィケーション | 中 | 軽量版、内発的動機重視 |
| アルゴリズム複雑性 | 低 | SM-2から開始、段階的移行 |
| 文化的ミスマッチ | 中 | 日本文化配慮、競争ではなく協力 |

---

## 📚 参考文献・データソース

### 学術研究
- Schmitt, N., & McCarthy, M. (1997). *Vocabulary: Description, Acquisition and Pedagogy*
- Nation, I. S. P. (2001). *Learning Vocabulary in Another Language*
- Ebbinghaus, H. (1885). *Memory: A Contribution to Experimental Psychology*
- Roediger & Karpicke (2006). *Testing Effect*
- Craik & Lockhart (1972). *Levels of Processing Theory*

### データソース
- **CEFR-J Wordlist**: 日本人学習者向けCEFR（投野由紀夫）
- **英検公式語彙リスト**: 英検過去問データ
- **BNC/COCA**: British National Corpus / Corpus of Contemporary American English
- **Oxford 5000**: Oxford English Corpus

### 技術仕様
- **SM-2アルゴリズム**: SuperMemo-2 (Piotr Wozniak, 1987)
- **FSRS**: Free Spaced Repetition Scheduler (2024)
- **Anki**: オープンソースSRSアプリケーション（参考実装）

---

## 🎓 専門家の総合評価

### Codex
> "FSRSベースの個人適応 + 頻度・出題頻度を加味した語注優先度、初級者向け低摩擦UI（ホバー/タップ）と軽量ゲーミフィケーション、定着率ベースのA/Bテスト設計を軸に実装することを推奨します。"

### Cursor
> "段階的実装、ユーザーテストの重要性、データ駆動型の改善、教育的効果の検証が成功の鍵です。最低3ヶ月の学習データを蓄積し、英検本番での正答率向上を最終目標として設定してください。"

### Gemini
> "このシステムは、単なる単語帳アプリではなく、「読解体験の中で自分だけの辞書が育っていく」という非常に教育効果の高い設計になっています。まずは、SM-2の実装とUIのタップ表示化から着手することをお勧めします。"

### Claude
> "学習者の自律性（Learner Autonomy）を最大化することが最重要です。ユーザーが自分の学習をコントロールでき、強制ではなくサポートする設計にしてください。この原則を守れば、効果的で持続可能な語彙学習システムが実現できます。"

### ChatGPT
> "このシステム設計は世界でもトップクラスの教育工学的構造に近づいています。語彙難易度の自動最適化、FSRSによる個別最適化学習、長期記憶定着率の測定を実装すれば、『英検学習史上最高のAIシステム』になります。誇張ではなく、本当にそのレベルです。"

---

## 🚀 次のアクション

### 今すぐ開始すべきこと:

1. **データベーススキーマを実装** (Cloudflare D1)
   - `vocabulary_master` テーブル
   - `user_vocabulary_progress` テーブル
   - `review_schedule` テーブル

2. **コアアルゴリズムを実装**
   - `VocabularyDifficultyScorer` クラス
   - `SM2Algorithm` クラス

3. **基本UIコンポーネントを作成**
   - `VocabularyAnnotation` コンポーネント
   - `VocabularyNotebook` ページ

4. **パイロットテスト準備**
   - 10-20名のユーザーでベータテスト
   - フィードバック収集
   - 改善イテレーション

---

## 📞 サポート・質問

実装中に質問や追加のアドバイスが必要な場合は、以下の観点で専門家にフィードバックを求めてください:

- 📊 **データ設計**: テーブル構造、インデックス最適化
- 🧮 **アルゴリズム**: SM-2パラメータ調整、FSRS移行
- 🎨 **UI/UX**: ユーザビリティテスト結果、改善案
- 📈 **効果測定**: A/Bテスト設計、統計的有意性

---

**このロードマップに従って実装すれば、日本で最高の語彙学習システムが完成します。頑張ってください！** 🎉
