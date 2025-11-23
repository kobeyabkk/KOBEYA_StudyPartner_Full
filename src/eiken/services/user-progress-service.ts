/**
 * Phase 4A: User Progress Service
 * 
 * Manages user's vocabulary learning progress
 * Handles user_vocabulary_progress table interactions
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  UserVocabularyProgress,
  LearningSourceContext,
  LearningStatus,
  SM2Card,
  SM2Review
} from '../types/vocabulary';
import { SM2Algorithm } from './sm2-algorithm';

export class UserProgressService {
  constructor(private db: D1Database) {}
  
  /**
   * Get user's progress for a specific word
   */
  async getProgress(userId: string, wordId: number): Promise<UserVocabularyProgress | null> {
    const result = await this.db
      .prepare('SELECT * FROM user_vocabulary_progress WHERE user_id = ? AND word_id = ?')
      .bind(userId, wordId)
      .first();
    
    if (!result) return null;
    return this.mapToUserProgress(result);
  }
  
  /**
   * Get all progress for a user
   */
  async getAllProgress(
    userId: string,
    filters?: {
      status?: LearningStatus;
      minMasteryLevel?: number;
      maxMasteryLevel?: number;
    }
  ): Promise<UserVocabularyProgress[]> {
    let sql = 'SELECT * FROM user_vocabulary_progress WHERE user_id = ?';
    const params: any[] = [userId];
    
    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters?.minMasteryLevel !== undefined) {
      sql += ' AND mastery_level >= ?';
      params.push(filters.minMasteryLevel);
    }
    
    if (filters?.maxMasteryLevel !== undefined) {
      sql += ' AND mastery_level <= ?';
      params.push(filters.maxMasteryLevel);
    }
    
    sql += ' ORDER BY last_reviewed_at DESC';
    
    const results = await this.db
      .prepare(sql)
      .bind(...params)
      .all();
    
    return results.results.map(r => this.mapToUserProgress(r));
  }
  
  /**
   * Add new word to user's vocabulary notebook
   */
  async addWord(
    userId: string,
    wordId: number,
    sourceContext?: LearningSourceContext
  ): Promise<number> {
    
    // Check if already exists
    const existing = await this.getProgress(userId, wordId);
    if (existing) {
      return existing.id;
    }
    
    // Create initial SM-2 card
    const initialCard = SM2Algorithm.createInitialCard();
    
    const result = await this.db
      .prepare(`
        INSERT INTO user_vocabulary_progress (
          user_id, word_id,
          easiness_factor, interval_days, repetitions, next_review_date,
          mastery_level,
          first_encountered_at,
          source_context,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        userId,
        wordId,
        initialCard.easinessFactor,
        initialCard.intervalDays,
        initialCard.repetitions,
        initialCard.nextReviewDate.toISOString(),
        0, // Initial mastery level
        new Date().toISOString(),
        sourceContext ? JSON.stringify(sourceContext) : null,
        'learning'
      )
      .run();
    
    return result.meta.last_row_id;
  }
  
  /**
   * Submit review result and update progress
   */
  async submitReview(
    userId: string,
    wordId: number,
    review: SM2Review,
    ageMultiplier: number = 1.0,
    examMultiplier: number = 1.0
  ): Promise<UserVocabularyProgress> {
    
    // Get current progress
    const progress = await this.getProgress(userId, wordId);
    if (!progress) {
      throw new Error('Word not found in user vocabulary');
    }
    
    // Create current SM-2 card state
    const currentCard: SM2Card = {
      easinessFactor: progress.easinessFactor,
      intervalDays: progress.intervalDays,
      repetitions: progress.repetitions,
      nextReviewDate: progress.nextReviewDate
    };
    
    // Update card using SM-2 algorithm
    const updatedCard = SM2Algorithm.updateCard(
      currentCard,
      review,
      ageMultiplier,
      examMultiplier
    );
    
    // Calculate new mastery level
    const newMasteryLevel = SM2Algorithm.calculateMasteryLevel(updatedCard);
    
    // Update review counts
    const totalReviews = progress.totalReviews + 1;
    const correctReviews = review.quality >= 3 ? progress.correctReviews + 1 : progress.correctReviews;
    
    // Update response time stats
    let avgResponseTime = progress.avgResponseTimeMs;
    let fastestTime = progress.fastestResponseTimeMs;
    let slowestTime = progress.slowestResponseTimeMs;
    
    if (review.responseTimeMs !== undefined) {
      if (avgResponseTime === undefined) {
        avgResponseTime = review.responseTimeMs;
      } else {
        avgResponseTime = Math.round(
          (avgResponseTime * (totalReviews - 1) + review.responseTimeMs) / totalReviews
        );
      }
      
      if (fastestTime === undefined || review.responseTimeMs < fastestTime) {
        fastestTime = review.responseTimeMs;
      }
      
      if (slowestTime === undefined || review.responseTimeMs > slowestTime) {
        slowestTime = review.responseTimeMs;
      }
    }
    
    // Calculate performance scores
    const recognitionScore = this.calculateRecognitionScore(review.quality, totalReviews);
    const recallScore = this.calculateRecallScore(updatedCard, totalReviews);
    const productionScore = this.calculateProductionScore(updatedCard);
    
    // Determine status
    const status = SM2Algorithm.isMastered(updatedCard) ? 'mastered' : 'learning';
    
    // Update database
    await this.db
      .prepare(`
        UPDATE user_vocabulary_progress SET
          easiness_factor = ?,
          interval_days = ?,
          repetitions = ?,
          next_review_date = ?,
          mastery_level = ?,
          recognition_score = ?,
          recall_score = ?,
          production_score = ?,
          last_reviewed_at = ?,
          total_reviews = ?,
          correct_reviews = ?,
          avg_response_time_ms = ?,
          fastest_response_time_ms = ?,
          slowest_response_time_ms = ?,
          status = ?
        WHERE user_id = ? AND word_id = ?
      `)
      .bind(
        updatedCard.easinessFactor,
        updatedCard.intervalDays,
        updatedCard.repetitions,
        updatedCard.nextReviewDate.toISOString(),
        newMasteryLevel,
        recognitionScore,
        recallScore,
        productionScore,
        new Date().toISOString(),
        totalReviews,
        correctReviews,
        avgResponseTime || null,
        fastestTime || null,
        slowestTime || null,
        status,
        userId,
        wordId
      )
      .run();
    
    // Get updated progress
    const updated = await this.getProgress(userId, wordId);
    if (!updated) throw new Error('Failed to retrieve updated progress');
    
    return updated;
  }
  
  /**
   * Get words due for review today
   */
  async getDueWords(userId: string): Promise<UserVocabularyProgress[]> {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    const results = await this.db
      .prepare(`
        SELECT * FROM user_vocabulary_progress
        WHERE user_id = ?
          AND status = 'learning'
          AND next_review_date <= ?
        ORDER BY next_review_date ASC, mastery_level ASC
      `)
      .bind(userId, today.toISOString())
      .all();
    
    return results.results.map(r => this.mapToUserProgress(r));
  }
  
  /**
   * Get mastered words
   */
  async getMasteredWords(userId: string): Promise<UserVocabularyProgress[]> {
    const results = await this.db
      .prepare(`
        SELECT * FROM user_vocabulary_progress
        WHERE user_id = ? AND status = 'mastered'
        ORDER BY last_reviewed_at DESC
      `)
      .bind(userId)
      .all();
    
    return results.results.map(r => this.mapToUserProgress(r));
  }
  
  /**
   * Update user note
   */
  async updateNote(userId: string, wordId: number, note: string): Promise<void> {
    await this.db
      .prepare('UPDATE user_vocabulary_progress SET user_note = ? WHERE user_id = ? AND word_id = ?')
      .bind(note, userId, wordId)
      .run();
  }
  
  /**
   * Update mnemonic
   */
  async updateMnemonic(userId: string, wordId: number, mnemonic: string): Promise<void> {
    await this.db
      .prepare('UPDATE user_vocabulary_progress SET mnemonic = ? WHERE user_id = ? AND word_id = ?')
      .bind(mnemonic, userId, wordId)
      .run();
  }
  
  /**
   * Archive word
   */
  async archiveWord(userId: string, wordId: number): Promise<void> {
    await this.db
      .prepare(`
        UPDATE user_vocabulary_progress
        SET status = 'archived', archived_at = ?
        WHERE user_id = ? AND word_id = ?
      `)
      .bind(new Date().toISOString(), userId, wordId)
      .run();
  }
  
  /**
   * Unarchive word
   */
  async unarchiveWord(userId: string, wordId: number): Promise<void> {
    await this.db
      .prepare(`
        UPDATE user_vocabulary_progress
        SET status = 'learning', archived_at = NULL
        WHERE user_id = ? AND word_id = ?
      `)
      .bind(userId, wordId)
      .run();
  }
  
  /**
   * Get learning statistics
   */
  async getStatistics(userId: string): Promise<{
    totalWords: number;
    learningWords: number;
    masteredWords: number;
    dueToday: number;
    avgMasteryLevel: number;
    overallAccuracy: number;
    totalReviews: number;
  }> {
    const stats = await this.db
      .prepare(`
        SELECT
          COUNT(*) as total_words,
          SUM(CASE WHEN status = 'learning' THEN 1 ELSE 0 END) as learning_words,
          SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END) as mastered_words,
          AVG(mastery_level) as avg_mastery_level,
          SUM(correct_reviews) as total_correct,
          SUM(total_reviews) as total_reviews
        FROM user_vocabulary_progress
        WHERE user_id = ?
      `)
      .bind(userId)
      .first<any>();
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const dueResult = await this.db
      .prepare(`
        SELECT COUNT(*) as due_count
        FROM user_vocabulary_progress
        WHERE user_id = ? AND status = 'learning' AND next_review_date <= ?
      `)
      .bind(userId, today.toISOString())
      .first<{ due_count: number }>();
    
    const totalReviews = stats?.total_reviews || 0;
    const totalCorrect = stats?.total_correct || 0;
    
    return {
      totalWords: stats?.total_words || 0,
      learningWords: stats?.learning_words || 0,
      masteredWords: stats?.mastered_words || 0,
      dueToday: dueResult?.due_count || 0,
      avgMasteryLevel: stats?.avg_mastery_level || 0,
      overallAccuracy: totalReviews > 0 ? totalCorrect / totalReviews : 0,
      totalReviews
    };
  }
  
  /**
   * Calculate recognition score (0-100)
   * Based on recent review quality
   */
  private calculateRecognitionScore(quality: number, totalReviews: number): number {
    // Simple heuristic: quality * 20 (since quality is 0-5)
    const baseScore = quality * 20;
    
    // Boost score slightly for experienced learners
    const experienceBonus = Math.min(10, totalReviews);
    
    return Math.min(100, baseScore + experienceBonus);
  }
  
  /**
   * Calculate recall score (0-100)
   * Based on repetitions and interval
   */
  private calculateRecallScore(card: SM2Card, totalReviews: number): number {
    // Higher repetitions and longer intervals indicate better recall
    const repetitionScore = Math.min(50, card.repetitions * 10);
    const intervalScore = Math.min(30, card.intervalDays * 2);
    const efScore = Math.min(20, (card.easinessFactor - 1.3) * 20);
    
    return Math.min(100, repetitionScore + intervalScore + efScore);
  }
  
  /**
   * Calculate production score (0-100)
   * Ability to use word in context
   */
  private calculateProductionScore(card: SM2Card): number {
    // Production requires high mastery level
    const masteryLevel = SM2Algorithm.calculateMasteryLevel(card);
    
    // Production develops after recall is established
    if (masteryLevel < 5) return 0;
    if (masteryLevel < 7) return 30;
    if (masteryLevel < 9) return 60;
    return 90;
  }
  
  /**
   * Map database row to UserVocabularyProgress type
   */
  private mapToUserProgress(row: any): UserVocabularyProgress {
    return {
      id: row.id,
      userId: row.user_id,
      wordId: row.word_id,
      easinessFactor: row.easiness_factor,
      intervalDays: row.interval_days,
      repetitions: row.repetitions,
      nextReviewDate: new Date(row.next_review_date),
      masteryLevel: row.mastery_level,
      recognitionScore: row.recognition_score,
      recallScore: row.recall_score,
      productionScore: row.production_score,
      firstEncounteredAt: new Date(row.first_encountered_at),
      lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
      totalReviews: row.total_reviews,
      correctReviews: row.correct_reviews,
      avgResponseTimeMs: row.avg_response_time_ms || undefined,
      fastestResponseTimeMs: row.fastest_response_time_ms || undefined,
      slowestResponseTimeMs: row.slowest_response_time_ms || undefined,
      retention7days: row.retention_7days || undefined,
      retention30days: row.retention_30days || undefined,
      retention60days: row.retention_60days || undefined,
      sourceContext: row.source_context ? JSON.parse(row.source_context) : undefined,
      sourceType: row.source_type || undefined,
      userNote: row.user_note || undefined,
      mnemonic: row.mnemonic || undefined,
      status: row.status as LearningStatus,
      archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
