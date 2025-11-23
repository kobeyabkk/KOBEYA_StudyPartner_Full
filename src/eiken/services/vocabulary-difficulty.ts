/**
 * Phase 4A: Vocabulary Difficulty Scorer
 * 
 * Multi-dimensional vocabulary difficulty assessment based on:
 * - CEFR-J Level (30%)
 * - Eiken Frequency (30%)
 * - Japanese Learner Difficulty (25%)
 * - Polysemy/Context Dependency (15%)
 * 
 * Based on expert consensus from 5 AI specialists
 */

import {
  VocabularyDifficultyInput,
  VocabularyDifficultyScore,
  CEFRLevel,
  EikenGrade,
  DEFAULT_VOCABULARY_CONFIG
} from '../types/vocabulary';

export class VocabularyDifficultyScorer {
  
  // Weights from expert consensus
  private static readonly WEIGHTS = DEFAULT_VOCABULARY_CONFIG.weights;
  
  // CEFR to numeric score mapping
  private static readonly CEFR_SCORE_MAP: Record<CEFRLevel, number> = {
    [CEFRLevel.A1]: 16.7,
    [CEFRLevel.A2]: 33.3,
    [CEFRLevel.B1]: 50.0,
    [CEFRLevel.B2]: 66.7,
    [CEFRLevel.C1]: 83.3,
    [CEFRLevel.C2]: 100.0
  };
  
  // Eiken grade to numeric level mapping
  private static readonly EIKEN_LEVEL_MAP: Record<EikenGrade, number> = {
    [EikenGrade.GRADE_5]: 1,
    [EikenGrade.GRADE_4]: 2,
    [EikenGrade.GRADE_3]: 3,
    [EikenGrade.GRADE_PRE2]: 4,
    [EikenGrade.GRADE_2]: 5,
    [EikenGrade.GRADE_PRE1]: 6,
    [EikenGrade.GRADE_1]: 7
  };
  
  /**
   * Calculate comprehensive vocabulary difficulty score
   * 
   * @param input Vocabulary data
   * @param userGrade User's current Eiken grade
   * @returns Difficulty score breakdown and final score
   */
  public calculateDifficulty(
    input: VocabularyDifficultyInput,
    userGrade: EikenGrade = EikenGrade.GRADE_3
  ): VocabularyDifficultyScore {
    
    // Calculate component scores
    const cefrScore = this.calculateCEFRScore(input.cefrLevel);
    const frequencyScore = this.calculateFrequencyScore(input.frequencyRank);
    const eikenScore = this.calculateEikenScore(
      input.eikenFrequency,
      input.eikenGrade,
      userGrade
    );
    const japaneseLearnerScore = this.calculateJapaneseLearnerScore(input);
    const polysemyScore = this.calculatePolysemyScore(input.polysemyCount);
    
    // Calculate weighted final score
    const finalScore = this.calculateWeightedScore({
      cefrScore,
      frequencyScore,
      eikenScore,
      japaneseLearnerScore,
      polysemyScore
    });
    
    // Determine if word should be annotated
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
   * Calculate CEFR-based difficulty score (0-100)
   * Higher CEFR level = higher difficulty
   */
  private calculateCEFRScore(cefrLevel?: CEFRLevel): number {
    if (!cefrLevel) return 50; // Default to B1 level
    
    return VocabularyDifficultyScorer.CEFR_SCORE_MAP[cefrLevel] || 50;
  }
  
  /**
   * Calculate frequency-based difficulty score (0-100)
   * Lower frequency rank = easier word
   * 
   * Frequency bands:
   * - Rank 1-1000: Very common (0-20 points)
   * - Rank 1001-5000: Common (21-50 points)
   * - Rank 5001-20000: Uncommon (51-80 points)
   * - Rank 20001+: Rare (81-100 points)
   */
  private calculateFrequencyScore(frequencyRank?: number): number {
    if (!frequencyRank) return 50; // Default
    
    // Very common words (high frequency = low difficulty)
    if (frequencyRank <= 1000) {
      return 0 + (frequencyRank / 1000) * 20;
    }
    // Common words
    else if (frequencyRank <= 5000) {
      return 20 + ((frequencyRank - 1000) / 4000) * 30;
    }
    // Uncommon words
    else if (frequencyRank <= 20000) {
      return 50 + ((frequencyRank - 5000) / 15000) * 30;
    }
    // Rare words (low frequency = high difficulty)
    else {
      return Math.min(100, 80 + ((frequencyRank - 20000) / 10000) * 20);
    }
  }
  
  /**
   * Calculate Eiken-specific difficulty score (0-100)
   * Compares word's grade level with user's grade level
   */
  private calculateEikenScore(
    eikenFrequency?: number,
    wordGrade?: EikenGrade,
    userGrade?: EikenGrade
  ): number {
    // If no grade info, default to medium difficulty
    if (!wordGrade || !userGrade) return 50;
    
    const wordLevel = VocabularyDifficultyScorer.EIKEN_LEVEL_MAP[wordGrade] || 4;
    const userLevel = VocabularyDifficultyScorer.EIKEN_LEVEL_MAP[userGrade] || 4;
    
    // Calculate level difference
    const levelDifference = wordLevel - userLevel;
    
    let score = 50; // Baseline
    
    if (levelDifference <= 0) {
      // Word is at or below user's level = easier
      score = Math.max(0, 50 - Math.abs(levelDifference) * 15);
    } else {
      // Word is above user's level = harder
      score = Math.min(100, 50 + levelDifference * 15);
    }
    
    // Adjust based on Eiken past exam frequency
    if (eikenFrequency !== undefined) {
      if (eikenFrequency >= 5) {
        // Very frequent in exams = easier
        score -= 10;
      } else if (eikenFrequency <= 1) {
        // Rare in exams = harder
        score += 10;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Calculate Japanese learner-specific difficulty score (0-100)
   * Accounts for:
   * - Katakana words (very easy for Japanese learners)
   * - False cognates (very difficult - misleading)
   * - L1 interference (difficult - confusion with Japanese)
   */
  private calculateJapaneseLearnerScore(
    input: VocabularyDifficultyInput
  ): number {
    let score = 50; // Baseline
    
    // Katakana loanwords: Very easy for Japanese learners
    if (input.isKatakanaWord) {
      score -= 30; // Significant reduction
    }
    
    // False cognates (和製英語): Very difficult due to misleading similarity
    if (input.isFalseCognate) {
      score += 40; // Significant increase
    }
    
    // L1 (Japanese) interference: Difficult due to confusion
    if (input.l1InterferenceRisk) {
      score += 20; // Moderate increase
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Calculate polysemy-based difficulty score (0-100)
   * More meanings = higher difficulty
   */
  private calculatePolysemyScore(polysemyCount?: number): number {
    if (!polysemyCount || polysemyCount <= 1) {
      return 0; // Single meaning = easy
    }
    
    // Difficulty increases with number of meanings
    // 2-3 meanings: 30 points
    // 4-5 meanings: 50 points
    // 6-8 meanings: 70 points
    // 9+ meanings: 90 points
    
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
   * Calculate weighted final score using expert consensus weights
   * 
   * Final Score = 
   *   CEFR (30%) + 
   *   Eiken (30%) + 
   *   Japanese Learner (25%) + 
   *   Polysemy (15%)
   */
  private calculateWeightedScore(scores: {
    cefrScore: number;
    frequencyScore: number; // Note: Not used in final score, but informative
    eikenScore: number;
    japaneseLearnerScore: number;
    polysemyScore: number;
  }): number {
    const { WEIGHTS } = VocabularyDifficultyScorer;
    
    const finalScore = 
      scores.cefrScore * WEIGHTS.cefr +
      scores.eikenScore * WEIGHTS.eiken +
      scores.japaneseLearnerScore * WEIGHTS.japaneseLearner +
      scores.polysemyScore * WEIGHTS.polysemy;
    
    // Round to 2 decimal places
    return Math.round(finalScore * 100) / 100;
  }
  
  /**
   * Determine if word should be annotated
   * 
   * Rules:
   * 1. Katakana words: Never annotate (too easy)
   * 2. Final score ≥ 40: Annotate (B1 level or harder)
   * 3. Final score < 40: Don't annotate (too easy)
   */
  private shouldAnnotateWord(
    finalScore: number,
    input: VocabularyDifficultyInput
  ): boolean {
    const { annotation } = DEFAULT_VOCABULARY_CONFIG;
    
    // Rule 1: Never annotate katakana words
    if (annotation.excludeKatakana && input.isKatakanaWord) {
      return false;
    }
    
    // Rule 2: Annotate if difficulty exceeds threshold
    return finalScore >= annotation.difficultyThreshold;
  }
  
  /**
   * Get difficulty label for display
   */
  public static getDifficultyLabel(score: number): string {
    if (score < 40) return '易';
    if (score < 60) return '中';
    if (score < 80) return '難';
    return '超難';
  }
  
  /**
   * Get difficulty color for UI display
   */
  public static getDifficultyColor(score: number): string {
    if (score < 40) return 'text-green-600';
    if (score < 60) return 'text-yellow-600';
    if (score < 80) return 'text-orange-600';
    return 'text-red-600';
  }
  
  /**
   * Get difficulty background color for UI display
   */
  public static getDifficultyBgColor(score: number): string {
    if (score < 40) return 'bg-green-100';
    if (score < 60) return 'bg-yellow-100';
    if (score < 80) return 'bg-orange-100';
    return 'bg-red-100';
  }
  
  /**
   * Batch calculate difficulty for multiple words
   */
  public batchCalculateDifficulty(
    inputs: VocabularyDifficultyInput[],
    userGrade: EikenGrade = EikenGrade.GRADE_3
  ): VocabularyDifficultyScore[] {
    return inputs.map(input => this.calculateDifficulty(input, userGrade));
  }
}

/**
 * Singleton instance
 */
export const vocabularyDifficultyScorer = new VocabularyDifficultyScorer();
