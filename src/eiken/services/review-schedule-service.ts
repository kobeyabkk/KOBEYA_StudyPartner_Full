/**
 * Phase 4A: Review Schedule Service
 * 
 * Manages daily review schedules for users
 * Handles review_schedule table interactions
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  ReviewSchedule,
  ReviewType,
  ReviewStatus,
  TodayReviewSummary
} from '../types/vocabulary';

export class ReviewScheduleService {
  constructor(private db: D1Database) {}
  
  /**
   * Create review schedule entry
   */
  async scheduleReview(
    userId: string,
    wordId: number,
    scheduledDate: Date,
    reviewType: ReviewType,
    priority: number = 5
  ): Promise<number> {
    
    const result = await this.db
      .prepare(`
        INSERT INTO review_schedule (
          user_id, word_id, scheduled_date, review_type, priority, status
        ) VALUES (?, ?, ?, ?, ?, 'pending')
      `)
      .bind(
        userId,
        wordId,
        scheduledDate.toISOString().split('T')[0], // Date only
        reviewType,
        priority
      )
      .run();
    
    return result.meta.last_row_id;
  }
  
  /**
   * Get today's review schedule for user
   */
  async getTodaySchedule(userId: string): Promise<ReviewSchedule[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const results = await this.db
      .prepare(`
        SELECT * FROM review_schedule
        WHERE user_id = ?
          AND scheduled_date = ?
          AND status = 'pending'
        ORDER BY priority DESC, review_type ASC
      `)
      .bind(userId, today)
      .all();
    
    return results.results.map(r => this.mapToReviewSchedule(r));
  }
  
  /**
   * Get pending reviews (overdue + today)
   */
  async getPendingReviews(userId: string): Promise<ReviewSchedule[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const results = await this.db
      .prepare(`
        SELECT * FROM review_schedule
        WHERE user_id = ?
          AND scheduled_date <= ?
          AND status = 'pending'
        ORDER BY scheduled_date ASC, priority DESC
      `)
      .bind(userId, today)
      .all();
    
    return results.results.map(r => this.mapToReviewSchedule(r));
  }
  
  /**
   * Complete a review
   */
  async completeReview(
    scheduleId: number,
    responseQuality: number,
    responseTimeMs: number,
    wasCorrect: boolean
  ): Promise<void> {
    
    await this.db
      .prepare(`
        UPDATE review_schedule SET
          status = 'completed',
          completed_at = ?,
          response_quality = ?,
          response_time_ms = ?,
          was_correct = ?
        WHERE id = ?
      `)
      .bind(
        new Date().toISOString(),
        responseQuality,
        responseTimeMs,
        wasCorrect ? 1 : 0,
        scheduleId
      )
      .run();
  }
  
  /**
   * Skip a review
   */
  async skipReview(scheduleId: number): Promise<void> {
    await this.db
      .prepare('UPDATE review_schedule SET status = \'skipped\' WHERE id = ?')
      .bind(scheduleId)
      .run();
  }
  
  /**
   * Get today's review summary
   */
  async getTodaySummary(userId: string): Promise<TodayReviewSummary> {
    const today = new Date().toISOString().split('T')[0];
    
    // Get total due and new
    const countResult = await this.db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN review_type = 'due' THEN 1 ELSE 0 END) as due_count,
          SUM(CASE WHEN review_type = 'new' THEN 1 ELSE 0 END) as new_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM review_schedule
        WHERE user_id = ? AND scheduled_date = ?
      `)
      .bind(userId, today)
      .first<any>();
    
    // Get performance stats for completed reviews
    const statsResult = await this.db
      .prepare(`
        SELECT
          AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) as avg_accuracy,
          AVG(response_time_ms) as avg_response_time
        FROM review_schedule
        WHERE user_id = ?
          AND scheduled_date = ?
          AND status = 'completed'
          AND response_time_ms IS NOT NULL
      `)
      .bind(userId, today)
      .first<any>();
    
    // Calculate study time (sum of all response times)
    const timeResult = await this.db
      .prepare(`
        SELECT SUM(response_time_ms) as total_time_ms
        FROM review_schedule
        WHERE user_id = ?
          AND scheduled_date = ?
          AND status = 'completed'
          AND response_time_ms IS NOT NULL
      `)
      .bind(userId, today)
      .first<{ total_time_ms: number }>();
    
    const totalTimeMs = timeResult?.total_time_ms || 0;
    const studyTimeMinutes = Math.round(totalTimeMs / 60000);
    
    return {
      userId,
      date: new Date(today),
      totalDue: countResult?.due_count || 0,
      totalNew: countResult?.new_count || 0,
      totalCompleted: countResult?.completed_count || 0,
      avgAccuracy: statsResult?.avg_accuracy || 0,
      avgResponseTimeMs: Math.round(statsResult?.avg_response_time || 0),
      studyTimeMinutes
    };
  }
  
  /**
   * Get review history for a period
   */
  async getReviewHistory(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ReviewSchedule[]> {
    
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];
    
    const results = await this.db
      .prepare(`
        SELECT * FROM review_schedule
        WHERE user_id = ?
          AND scheduled_date >= ?
          AND scheduled_date <= ?
        ORDER BY scheduled_date DESC, completed_at DESC
      `)
      .bind(userId, start, end)
      .all();
    
    return results.results.map(r => this.mapToReviewSchedule(r));
  }
  
  /**
   * Get review statistics for a word
   */
  async getWordReviewStats(userId: string, wordId: number): Promise<{
    totalReviews: number;
    correctReviews: number;
    avgResponseTime: number;
    lastReviewDate?: Date;
  }> {
    
    const result = await this.db
      .prepare(`
        SELECT
          COUNT(*) as total_reviews,
          SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct_reviews,
          AVG(response_time_ms) as avg_response_time,
          MAX(completed_at) as last_review
        FROM review_schedule
        WHERE user_id = ? AND word_id = ? AND status = 'completed'
      `)
      .bind(userId, wordId)
      .first<any>();
    
    return {
      totalReviews: result?.total_reviews || 0,
      correctReviews: result?.correct_reviews || 0,
      avgResponseTime: Math.round(result?.avg_response_time || 0),
      lastReviewDate: result?.last_review ? new Date(result.last_review) : undefined
    };
  }
  
  /**
   * Cleanup old completed reviews (archive)
   */
  async cleanupOldReviews(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoff = cutoffDate.toISOString().split('T')[0];
    
    const result = await this.db
      .prepare(`
        DELETE FROM review_schedule
        WHERE status = 'completed'
          AND scheduled_date < ?
      `)
      .bind(cutoff)
      .run();
    
    return result.meta.changes || 0;
  }
  
  /**
   * Reschedule pending review to new date
   */
  async rescheduleReview(scheduleId: number, newDate: Date): Promise<void> {
    await this.db
      .prepare('UPDATE review_schedule SET scheduled_date = ? WHERE id = ?')
      .bind(newDate.toISOString().split('T')[0], scheduleId)
      .run();
  }
  
  /**
   * Get completion rate for a date range
   */
  async getCompletionRate(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];
    
    const result = await this.db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM review_schedule
        WHERE user_id = ?
          AND scheduled_date >= ?
          AND scheduled_date <= ?
      `)
      .bind(userId, start, end)
      .first<{ total: number; completed: number }>();
    
    const total = result?.total || 0;
    const completed = result?.completed || 0;
    
    return total > 0 ? completed / total : 0;
  }
  
  /**
   * Get streak data (consecutive days with completed reviews)
   */
  async getStreakData(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    lastStudyDate?: Date;
  }> {
    
    // Get all dates with completed reviews (last 365 days)
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    const cutoff = oneYearAgo.toISOString().split('T')[0];
    
    const results = await this.db
      .prepare(`
        SELECT DISTINCT scheduled_date
        FROM review_schedule
        WHERE user_id = ?
          AND status = 'completed'
          AND scheduled_date >= ?
        ORDER BY scheduled_date DESC
      `)
      .bind(userId, cutoff)
      .all<{ scheduled_date: string }>();
    
    const dates = results.results.map(r => new Date(r.scheduled_date));
    
    if (dates.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0
      };
    }
    
    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let checkDate = new Date(today);
    
    for (const date of dates) {
      const studyDate = new Date(date);
      studyDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((checkDate.getTime() - studyDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (diffDays === 1 && currentStreak === 0) {
        // Allow 1-day gap for today if not studied yet
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 1;
    
    for (let i = 0; i < dates.length - 1; i++) {
      const current = new Date(dates[i]);
      const next = new Date(dates[i + 1]);
      
      current.setHours(0, 0, 0, 0);
      next.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    
    return {
      currentStreak,
      longestStreak,
      lastStudyDate: dates[0]
    };
  }
  
  /**
   * Map database row to ReviewSchedule type
   */
  private mapToReviewSchedule(row: any): ReviewSchedule {
    return {
      id: row.id,
      userId: row.user_id,
      wordId: row.word_id,
      scheduledDate: new Date(row.scheduled_date),
      reviewType: row.review_type as ReviewType,
      priority: row.priority,
      status: row.status as ReviewStatus,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      responseQuality: row.response_quality || undefined,
      responseTimeMs: row.response_time_ms || undefined,
      wasCorrect: row.was_correct !== null ? Boolean(row.was_correct) : undefined,
      createdAt: new Date(row.created_at)
    };
  }
}
