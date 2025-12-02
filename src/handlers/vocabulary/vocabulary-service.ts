/**
 * Vocabulary Service
 * 語彙学習サービス - SM-2アルゴリズムとの統合
 */

import { VocabularyDifficultyScorer, type VocabularyDifficultyInput, type VocabularyDifficultyScore } from './difficulty-scorer';
import { SM2Algorithm, type SM2Card, type SM2Review } from './sm2-algorithm';

export interface VocabularyWord {
  id: number;
  word: string;
  pos: string;
  definition_ja: string;
  cefr_level?: string;
  final_difficulty_score: number;
  eiken_grade?: string;
  is_katakana_word?: boolean;
  ipa_pronunciation?: string;
  katakana_pronunciation?: string;
  audio_url?: string;
  example_sentences?: string;
}

export interface UserVocabularyProgress {
  id?: number;
  user_id: string;
  word_id: number;
  easiness_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_date: string;
  mastery_level: number;
  recognition_score: number;
  recall_score: number;
  production_score: number;
  first_encountered_at?: string;
  last_reviewed_at?: string;
  total_reviews: number;
  correct_reviews: number;
  avg_response_time_ms?: number;
  source_context?: string;
  source_passage_id?: string;
}

export class VocabularyService {
  
  private difficultyScorer: VocabularyDifficultyScorer;
  
  constructor() {
    this.difficultyScorer = new VocabularyDifficultyScorer();
  }
  
  /**
   * 新しい単語をユーザーの学習リストに追加
   */
  public async addWordToUserProgress(
    db: D1Database,
    userId: string,
    wordId: number,
    sourceContext?: string,
    sourcePassageId?: string
  ): Promise<UserVocabularyProgress> {
    
    // 既に存在するかチェック
    const existing = await db.prepare(
      'SELECT * FROM user_vocabulary_progress WHERE user_id = ? AND word_id = ?'
    ).bind(userId, wordId).first<UserVocabularyProgress>();
    
    if (existing) {
      return existing;
    }
    
    // 初期SM-2カード作成
    const initialCard = SM2Algorithm.createInitialCard();
    const nextReviewDate = initialCard.nextReviewDate.toISOString().split('T')[0];
    
    const now = new Date().toISOString();
    
    // 新規作成
    const result = await db.prepare(`
      INSERT INTO user_vocabulary_progress (
        user_id, word_id,
        easiness_factor, interval_days, repetitions, next_review_date,
        mastery_level, recognition_score, recall_score, production_score,
        first_encountered_at, last_reviewed_at,
        total_reviews, correct_reviews,
        source_context, source_passage_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, wordId,
      initialCard.easinessFactor, initialCard.intervalDays, initialCard.repetitions, nextReviewDate,
      0, 0, 0, 0,
      now, now,
      0, 0,
      sourceContext || null, sourcePassageId || null,
      now, now
    ).run();
    
    const insertId = result.meta.last_row_id;
    
    // 作成したレコードを返す
    return await db.prepare(
      'SELECT * FROM user_vocabulary_progress WHERE id = ?'
    ).bind(insertId).first<UserVocabularyProgress>() as UserVocabularyProgress;
  }
  
  /**
   * 復習結果を記録してSM-2アルゴリズムで更新
   */
  public async recordReview(
    db: D1Database,
    userId: string,
    wordId: number,
    quality: number,
    responseTimeMs?: number,
    eikenGrade?: string,
    daysUntilExam?: number
  ): Promise<UserVocabularyProgress> {
    
    // 現在の進捗を取得
    const progress = await db.prepare(
      'SELECT * FROM user_vocabulary_progress WHERE user_id = ? AND word_id = ?'
    ).bind(userId, wordId).first<UserVocabularyProgress>();
    
    if (!progress) {
      throw new Error('Progress not found for this word');
    }
    
    // 現在のSM-2カード状態
    const currentCard: SM2Card = {
      easinessFactor: progress.easiness_factor,
      intervalDays: progress.interval_days,
      repetitions: progress.repetitions,
      nextReviewDate: new Date(progress.next_review_date)
    };
    
    // レビュー結果
    const review: SM2Review = {
      quality,
      responseTimeMs
    };
    
    // 年齢・試験日調整
    const ageMultiplier = SM2Algorithm.getAgeMultiplier(undefined, eikenGrade);
    const examMultiplier = SM2Algorithm.getExamDrivenMultiplier(daysUntilExam);
    const combinedMultiplier = ageMultiplier * examMultiplier;
    
    // SM-2アルゴリズムで更新
    const updatedCard = SM2Algorithm.updateCard(currentCard, review, combinedMultiplier);
    const newMasteryLevel = SM2Algorithm.calculateMasteryLevel(updatedCard);
    
    // 正解かどうか
    const wasCorrect = quality >= 3;
    const newTotalReviews = progress.total_reviews + 1;
    const newCorrectReviews = progress.correct_reviews + (wasCorrect ? 1 : 0);
    
    // 平均反応時間の更新
    let newAvgResponseTime = progress.avg_response_time_ms;
    if (responseTimeMs) {
      if (newAvgResponseTime) {
        newAvgResponseTime = Math.round(
          (newAvgResponseTime * progress.total_reviews + responseTimeMs) / newTotalReviews
        );
      } else {
        newAvgResponseTime = responseTimeMs;
      }
    }
    
    const now = new Date().toISOString();
    const nextReviewDateStr = updatedCard.nextReviewDate.toISOString().split('T')[0];
    
    // データベース更新
    await db.prepare(`
      UPDATE user_vocabulary_progress
      SET 
        easiness_factor = ?,
        interval_days = ?,
        repetitions = ?,
        next_review_date = ?,
        mastery_level = ?,
        last_reviewed_at = ?,
        total_reviews = ?,
        correct_reviews = ?,
        avg_response_time_ms = ?,
        updated_at = ?
      WHERE user_id = ? AND word_id = ?
    `).bind(
      updatedCard.easinessFactor,
      updatedCard.intervalDays,
      updatedCard.repetitions,
      nextReviewDateStr,
      newMasteryLevel,
      now,
      newTotalReviews,
      newCorrectReviews,
      newAvgResponseTime || null,
      now,
      userId,
      wordId
    ).run();
    
    // review_schedule に記録
    await db.prepare(`
      INSERT INTO review_schedule (
        user_id, word_id, scheduled_date, review_type,
        status, completed_at, response_quality, response_time_ms, was_correct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, wordId, now.split('T')[0], 'due',
      'completed', now, quality, responseTimeMs || null, wasCorrect ? 1 : 0
    ).run();
    
    // 更新後のデータを返す
    return await db.prepare(
      'SELECT * FROM user_vocabulary_progress WHERE user_id = ? AND word_id = ?'
    ).bind(userId, wordId).first<UserVocabularyProgress>() as UserVocabularyProgress;
  }
  
  /**
   * 今日復習すべき単語を取得
   */
  public async getDueWordsForToday(
    db: D1Database,
    userId: string,
    limit: number = 20
  ): Promise<Array<VocabularyWord & UserVocabularyProgress>> {
    
    const today = new Date().toISOString().split('T')[0];
    
    const results = await db.prepare(`
      SELECT 
        vw.*,
        uvp.id as progress_id,
        uvp.easiness_factor,
        uvp.interval_days,
        uvp.repetitions,
        uvp.next_review_date,
        uvp.mastery_level,
        uvp.total_reviews,
        uvp.correct_reviews
      FROM user_vocabulary_progress uvp
      JOIN vocabulary_words vw ON uvp.word_id = vw.id
      WHERE uvp.user_id = ?
        AND uvp.next_review_date <= ?
        AND uvp.mastery_level < 10
      ORDER BY uvp.next_review_date ASC, uvp.mastery_level ASC
      LIMIT ?
    `).bind(userId, today, limit).all();
    
    return results.results as Array<VocabularyWord & UserVocabularyProgress>;
  }
  
  /**
   * ユーザーの語彙統計を取得
   */
  public async getUserVocabularyStats(
    db: D1Database,
    userId: string
  ): Promise<{
    total_words: number;
    mastered_words: number;
    learning_words: number;
    new_words: number;
    avg_mastery_level: number;
    total_reviews: number;
    avg_accuracy: number;
    due_today: number;
  }> {
    
    const stats = await db.prepare(`
      SELECT * FROM user_vocabulary_stats WHERE user_id = ?
    `).bind(userId).first();
    
    const today = new Date().toISOString().split('T')[0];
    const dueToday = await db.prepare(`
      SELECT COUNT(*) as count FROM user_vocabulary_progress
      WHERE user_id = ? AND next_review_date <= ?
    `).bind(userId, today).first<{ count: number }>();
    
    return {
      total_words: (stats as any)?.total_words || 0,
      mastered_words: (stats as any)?.mastered_words || 0,
      learning_words: (stats as any)?.learning_words || 0,
      new_words: (stats as any)?.new_words || 0,
      avg_mastery_level: (stats as any)?.avg_mastery_level || 0,
      total_reviews: (stats as any)?.total_reviews || 0,
      avg_accuracy: (stats as any)?.avg_accuracy || 0,
      due_today: dueToday?.count || 0
    };
  }
  
  /**
   * 単語の難易度を計算して更新
   */
  public async updateWordDifficulty(
    db: D1Database,
    wordId: number,
    userGrade: string = 'grade-3'
  ): Promise<VocabularyDifficultyScore> {
    
    // 単語情報を取得
    const word = await db.prepare(
      'SELECT * FROM vocabulary_words WHERE id = ?'
    ).bind(wordId).first<VocabularyWord>();
    
    if (!word) {
      throw new Error('Word not found');
    }
    
    // 難易度計算
    const input: VocabularyDifficultyInput = {
      word: word.word,
      cefrLevel: word.cefr_level,
      eikenGrade: word.eiken_grade,
      isKatakanaWord: word.is_katakana_word === 1
    };
    
    const difficultyScore = this.difficultyScorer.calculateDifficulty(input, userGrade);
    
    // データベース更新
    await db.prepare(`
      UPDATE vocabulary_words
      SET final_difficulty_score = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(difficultyScore.finalScore, wordId).run();
    
    return difficultyScore;
  }
}
