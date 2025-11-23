/**
 * Phase 4A: SM-2 Spaced Repetition Algorithm
 * 
 * Implementation of SuperMemo-2 (SM-2) algorithm for vocabulary learning
 * Based on Piotr Wozniak's research (1987)
 * 
 * Initial intervals: 1 day → 3 days → 7 days → 14 days → 30 days
 * With age-based and exam-driven adjustments
 */

import {
  SM2Card,
  SM2Review,
  EikenGrade,
  DEFAULT_VOCABULARY_CONFIG
} from '../types/vocabulary';

export class SM2Algorithm {
  
  // Default parameters from research
  private static readonly DEFAULT_EASINESS = DEFAULT_VOCABULARY_CONFIG.sm2.defaultEasinessFactor;
  private static readonly MIN_EASINESS = DEFAULT_VOCABULARY_CONFIG.sm2.minEasinessFactor;
  private static readonly INITIAL_INTERVAL = DEFAULT_VOCABULARY_CONFIG.sm2.initialInterval;
  
  /**
   * Create initial card for a new vocabulary word
   */
  public static createInitialCard(): SM2Card {
    const now = new Date();
    const nextReview = new Date(now);
    nextReview.setDate(nextReview.getDate() + SM2Algorithm.INITIAL_INTERVAL);
    
    return {
      easinessFactor: SM2Algorithm.DEFAULT_EASINESS,
      intervalDays: SM2Algorithm.INITIAL_INTERVAL,
      repetitions: 0,
      nextReviewDate: nextReview
    };
  }
  
  /**
   * Update card based on review result using SM-2 algorithm
   * 
   * @param card Current card state
   * @param review Review result (quality 0-5, optional response time)
   * @param ageMultiplier Age-based adjustment (0.5-1.0)
   * @param examMultiplier Exam-driven adjustment (0.3-1.0)
   * @returns Updated card state
   */
  public static updateCard(
    card: SM2Card,
    review: SM2Review,
    ageMultiplier: number = 1.0,
    examMultiplier: number = 1.0
  ): SM2Card {
    
    // Adjust quality based on response time if available
    let quality = review.quality;
    if (review.responseTimeMs !== undefined) {
      quality = SM2Algorithm.adjustQualityByResponseTime(
        quality,
        review.responseTimeMs
      );
    }
    
    // 1. Calculate new Easiness Factor (EF)
    // Formula: EF' = EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))
    let newEasinessFactor = card.easinessFactor + (
      0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );
    
    // EF must be at least 1.3
    newEasinessFactor = Math.max(SM2Algorithm.MIN_EASINESS, newEasinessFactor);
    
    // 2. Calculate new interval and repetitions
    let newInterval: number;
    let newRepetitions: number;
    
    if (quality < 3) {
      // Failed review (quality 0-2): Reset to beginning
      newRepetitions = 0;
      newInterval = SM2Algorithm.INITIAL_INTERVAL;
    } else {
      // Successful review (quality 3-5): Increase interval
      newRepetitions = card.repetitions + 1;
      
      if (newRepetitions === 1) {
        // First successful review: 1 day
        newInterval = 1;
      } else if (newRepetitions === 2) {
        // Second successful review: 3 days
        newInterval = 3;
      } else {
        // Subsequent reviews: interval = previous interval × EF
        newInterval = Math.round(card.intervalDays * newEasinessFactor);
      }
      
      // Apply age-based multiplier (e.g., 0.6 for elementary students)
      newInterval *= ageMultiplier;
      
      // Apply exam-driven multiplier (e.g., 0.3 for 1 week before exam)
      newInterval *= examMultiplier;
      
      // Round to nearest day
      newInterval = Math.max(1, Math.round(newInterval));
    }
    
    // 3. Calculate next review date
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
    
    return {
      easinessFactor: newEasinessFactor,
      intervalDays: newInterval,
      repetitions: newRepetitions,
      nextReviewDate
    };
  }
  
  /**
   * Adjust quality score based on response time
   * 
   * Response time benchmarks:
   * - ≤300ms: Native-like (+1.0)
   * - ≤500ms: Fluent (+0.5)
   * - ≤1000ms: Intermediate (±0)
   * - ≤2000ms: Beginner (-0.5)
   * - >2000ms: Struggling (-1.0)
   */
  public static adjustQualityByResponseTime(
    baseQuality: number,
    responseTimeMs: number
  ): number {
    let adjustment = 0;
    
    if (responseTimeMs <= 300) {
      adjustment = 1.0; // Native-like speed
    } else if (responseTimeMs <= 500) {
      adjustment = 0.5; // Fluent
    } else if (responseTimeMs <= 1000) {
      adjustment = 0; // Intermediate (no adjustment)
    } else if (responseTimeMs <= 2000) {
      adjustment = -0.5; // Beginner
    } else {
      adjustment = -1.0; // Struggling
    }
    
    // Clamp to valid range [0, 5]
    return Math.max(0, Math.min(5, baseQuality + adjustment));
  }
  
  /**
   * Get age-based interval multiplier
   * 
   * @param userAge User's age (optional)
   * @param eikenGrade User's Eiken grade (used if age unknown)
   * @returns Multiplier (0.5-1.0)
   */
  public static getAgeMultiplier(
    userAge?: number,
    eikenGrade?: EikenGrade
  ): number {
    const { ageMultipliers } = DEFAULT_VOCABULARY_CONFIG;
    
    // If age unknown, estimate from Eiken grade
    if (!userAge && eikenGrade) {
      const gradeAgeMap: Record<EikenGrade, number> = {
        [EikenGrade.GRADE_5]: 10,    // Elementary 4-5
        [EikenGrade.GRADE_4]: 11,    // Elementary 5-6
        [EikenGrade.GRADE_3]: 13,    // Junior high 1-2
        [EikenGrade.GRADE_PRE2]: 15, // Junior high 3 - High 1
        [EikenGrade.GRADE_2]: 16,    // High school
        [EikenGrade.GRADE_PRE1]: 18, // High school - University
        [EikenGrade.GRADE_1]: 20     // University - Adult
      };
      userAge = gradeAgeMap[eikenGrade] || 15;
    }
    
    if (!userAge) return ageMultipliers.highSchoolAndUp; // Default
    
    // Age-based multiplier
    if (userAge <= 12) {
      return ageMultipliers.elementary; // 0.6 (shorter intervals)
    } else if (userAge <= 15) {
      return ageMultipliers.juniorHigh; // 0.8 (slightly shorter)
    } else {
      return ageMultipliers.highSchoolAndUp; // 1.0 (standard)
    }
  }
  
  /**
   * Get exam-driven interval multiplier
   * 
   * Adjusts review frequency based on proximity to exam date
   * 
   * @param daysUntilExam Days until Eiken exam (optional)
   * @returns Multiplier (0.3-1.0)
   */
  public static getExamDrivenMultiplier(daysUntilExam?: number): number {
    if (!daysUntilExam) return 1.0; // No exam scheduled
    
    const { examModeThresholdDays } = DEFAULT_VOCABULARY_CONFIG.scheduling;
    
    if (daysUntilExam <= 7) {
      // 1 week before: Intensive review mode
      return 0.3; // 30% of normal interval
    } else if (daysUntilExam <= 30) {
      // 1 month before: Accelerated review mode
      return 0.5; // 50% of normal interval
    } else if (daysUntilExam <= 60) {
      // 2 months before: Moderate acceleration
      return 0.7; // 70% of normal interval
    } else {
      // Normal study mode
      return 1.0; // 100% of normal interval
    }
  }
  
  /**
   * Calculate mastery level (0-10) based on card state
   * 
   * Mastery level criteria:
   * - 0: Unknown (repetitions = 0)
   * - 1-2: Seen (repetitions = 1-2)
   * - 3-4: Recognized (repetitions = 3-4, interval < 7)
   * - 5-6: Recalled (repetitions ≥ 5, interval ≥ 7)
   * - 7-8: Used (repetitions ≥ 8, interval ≥ 30)
   * - 9-10: Mastered (repetitions ≥ 12, interval ≥ 60)
   */
  public static calculateMasteryLevel(card: SM2Card): number {
    const { repetitions, intervalDays, easinessFactor } = card;
    
    // Unknown
    if (repetitions === 0) return 0;
    
    // Seen (just started learning)
    if (repetitions <= 2) return Math.min(2, repetitions);
    
    // Recognized (can identify)
    if (repetitions <= 4 && intervalDays < 7) {
      return 3 + (repetitions - 3);
    }
    
    // Recalled (can remember)
    if (repetitions <= 7 && intervalDays >= 7) {
      return 5 + Math.min(1, (repetitions - 5) * 0.5);
    }
    
    // Used (comfortable with usage)
    if (repetitions <= 11 && intervalDays >= 30) {
      return 7 + Math.min(1, (repetitions - 8) * 0.33);
    }
    
    // Mastered (near-native)
    if (repetitions >= 12 && intervalDays >= 60) {
      // Factor in easiness (high EF = stronger mastery)
      return 9 + Math.min(1, (easinessFactor - 2.0) * 2);
    }
    
    // Fallback: gradual progression
    return Math.min(10, 5 + repetitions * 0.5);
  }
  
  /**
   * Filter cards that are due for review today
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
   * Check if card is considered "mastered"
   * 
   * Criteria:
   * - Minimum 5 consecutive correct reviews
   * - Interval of at least 30 days
   * - Easiness factor above 2.0
   */
  public static isMastered(card: SM2Card): boolean {
    return (
      card.repetitions >= 5 &&
      card.intervalDays >= 30 &&
      card.easinessFactor >= 2.0
    );
  }
  
  /**
   * Estimate days until mastery for a card
   * 
   * Based on current progress and typical learning curve
   */
  public static estimateDaysUntilMastery(card: SM2Card): number {
    if (SM2Algorithm.isMastered(card)) return 0;
    
    // Rough estimate: need ~5 successful reviews to reach 30-day interval
    const reviewsRemaining = Math.max(0, 5 - card.repetitions);
    const avgIntervalGrowth = 2.5; // Average EF
    
    let estimatedDays = card.intervalDays;
    for (let i = 0; i < reviewsRemaining; i++) {
      estimatedDays = estimatedDays * avgIntervalGrowth;
    }
    
    return Math.round(estimatedDays);
  }
  
  /**
   * Get quality label for display
   */
  public static getQualityLabel(quality: number): string {
    const labels = [
      '完全に忘れた',      // 0: Complete blackout
      'ほぼ忘れた',        // 1: Incorrect, but familiar
      '思い出せない',      // 2: Incorrect, seems easy
      '難しかったが正解',  // 3: Correct, with difficulty
      '正解',              // 4: Correct, after hesitation
      '即答'               // 5: Perfect response
    ];
    return labels[Math.max(0, Math.min(5, Math.round(quality)))] || labels[4];
  }
}

/**
 * Helper class for managing multiple cards
 */
export class SM2CardManager {
  
  /**
   * Batch update multiple cards
   */
  public batchUpdate(
    cards: SM2Card[],
    reviews: Map<string, SM2Review>,
    ageMultiplier: number = 1.0,
    examMultiplier: number = 1.0
  ): Map<string, SM2Card> {
    const updatedCards = new Map<string, SM2Card>();
    
    cards.forEach((card, index) => {
      const cardId = `card-${index}`;
      const review = reviews.get(cardId);
      
      if (review) {
        const updatedCard = SM2Algorithm.updateCard(
          card,
          review,
          ageMultiplier,
          examMultiplier
        );
        updatedCards.set(cardId, updatedCard);
      }
    });
    
    return updatedCards;
  }
  
  /**
   * Get statistics for a collection of cards
   */
  public getStats(cards: SM2Card[]): {
    total: number;
    dueToday: number;
    mastered: number;
    avgEasinessFactor: number;
    avgInterval: number;
  } {
    const dueCards = SM2Algorithm.filterDueCards(cards);
    const masteredCards = cards.filter(SM2Algorithm.isMastered);
    
    const totalEF = cards.reduce((sum, card) => sum + card.easinessFactor, 0);
    const totalInterval = cards.reduce((sum, card) => sum + card.intervalDays, 0);
    
    return {
      total: cards.length,
      dueToday: dueCards.length,
      mastered: masteredCards.length,
      avgEasinessFactor: cards.length > 0 ? totalEF / cards.length : 0,
      avgInterval: cards.length > 0 ? totalInterval / cards.length : 0
    };
  }
}

/**
 * Export singleton instances
 */
export const sm2CardManager = new SM2CardManager();
