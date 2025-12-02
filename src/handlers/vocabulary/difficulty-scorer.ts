/**
 * Vocabulary Difficulty Scorer
 * 語彙難易度判定アルゴリズム
 * 
 * 専門家コンセンサスに基づく複合判定:
 * - CEFR-J Level: 30%
 * - Eiken Frequency: 30%
 * - Japanese Learner Difficulty: 25%
 * - Polysemy Score: 15%
 */

export interface VocabularyDifficultyInput {
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

export interface VocabularyDifficultyScore {
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
  private static readonly CEFR_ANNOTATION_THRESHOLD: Record<string, string> = {
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
    userGrade: string = 'grade-3'
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
    const shouldAnnotate = this.shouldAnnotateWord(finalScore, input, userGrade);
    
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
    input: VocabularyDifficultyInput,
    userGrade: string
  ): boolean {
    // カタカナ語は注釈不要
    if (input.isKatakanaWord) {
      return false;
    }
    
    // 最終スコアが40以上なら注釈対象
    // （40 = B1レベル相当）
    return finalScore >= 40;
  }
  
  /**
   * バッチ処理: 複数の単語を一括で判定
   */
  public batchCalculateDifficulty(
    inputs: VocabularyDifficultyInput[],
    userGrade: string = 'grade-3'
  ): VocabularyDifficultyScore[] {
    return inputs.map(input => this.calculateDifficulty(input, userGrade));
  }
}
