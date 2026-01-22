/**
 * Phase 2B: Topic Selection Service
 * 
 * Implements intelligent topic selection using:
 * - ε-greedy exploration (ε=0.15)
 * - Weighted random selection (roulette wheel)
 * - LRU (Least Recently Used) filtering
 * - Dynamic blacklist with TTL
 * - 7-stage fallback strategy
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  EikenGrade,
  TopicArea,
  TopicSelectionOptions,
  TopicSelectionResult,
  TopicSuitability,
  TopicUsageHistory,
  TopicBlacklist,
  BlacklistReason,
} from '../types';
import { BLACKLIST_TTL_MAP, LRU_WINDOW_SIZES } from '../types';

export class TopicSelector {
  private db: D1Database;
  private epsilon: number = 0.15; // Exploration rate

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Main topic selection method
   * Implements ε-greedy + weighted random + LRU + blacklist + fallback
   * Phase 7.7: Added session-level topic diversity enforcement
   */
  async selectTopic(options: TopicSelectionOptions): Promise<TopicSelectionResult> {
    const startTime = Date.now();
    
    console.log(`[TopicSelector] ===== STARTING TOPIC SELECTION =====`);
    console.log(`[TopicSelector] Options:`, JSON.stringify(options, null, 2));
    
    // Phase 7.7: Get recently used topics in this session (last 5 questions)
    const recentTopics = await this.getRecentTopicsInSession(options.student_id, 5);
    console.log(`[Phase 7.7] Recently used topics in session: ${recentTopics.join(', ')}`);
    
    // 7-stage fallback strategy
    for (let stage = 0; stage <= 6; stage++) {
      try {
        const result = await this.selectTopicAtStage(options, stage, recentTopics);
        if (result) {
          result.fallback_stage = stage;
          result.metadata.selection_timestamp = new Date().toISOString();
          
          const executionTime = Date.now() - startTime;
          console.log(`[TopicSelector] ✅ SUCCESS at Stage ${stage}! Selected: ${result.topic.topic_code} (${executionTime}ms)`);
          console.log(`[TopicSelector] ===== END TOPIC SELECTION =====`);
          
          return result;
        }
      } catch (error) {
        console.error(`[TopicSelector] ❌ Stage ${stage} failed:`, error);
        console.error(`[TopicSelector] Error stack:`, (error as Error).stack);
        // Continue to next stage
      }
    }

    // If all stages fail, throw error
    console.error(`[TopicSelector] ❌❌❌ ALL 7 STAGES EXHAUSTED! No suitable topic found.`);
    console.log(`[TopicSelector] ===== END TOPIC SELECTION (FAILURE) =====`);
    throw new Error('All fallback stages exhausted. No suitable topic found.');
  }

  /**
   * Select topic at specific fallback stage
   * Phase 7.7: Added recentTopics parameter for diversity
   */
  private async selectTopicAtStage(
    options: TopicSelectionOptions,
    stage: number,
    recentTopics: string[] = []
  ): Promise<TopicSelectionResult | null> {
    console.log(`[TopicSelector] Stage ${stage} starting for grade=${options.grade}, question_type=${options.question_type}`);
    
    // Get all active topics for grade
    let candidates = await this.getCandidateTopics(options.grade);
    
    console.log(`[TopicSelector] Stage ${stage}: Initial candidates: ${candidates.length}`);
    
    if (candidates.length === 0) {
      console.warn(`[TopicSelector] Stage ${stage}: No candidates found!`);
      return null;
    }

    const initialCount = candidates.length;

    // Phase 7.7: Filter out recently used topics (except at final fallback stages)
    if (stage < 4 && recentTopics.length > 0) {
      const beforeFilter = candidates.length;
      candidates = candidates.filter(t => !recentTopics.includes(t.topic_code));
      const filtered = beforeFilter - candidates.length;
      console.log(`[Phase 7.7] Stage ${stage}: Filtered ${filtered} recently used topics, remaining: ${candidates.length}`);
      
      if (candidates.length === 0) {
        console.warn(`[Phase 7.7] Stage ${stage}: All candidates were recently used, moving to next stage`);
        return null;
      }
    }

    // Apply filters based on stage
    if (stage === 0) {
      // Normal selection: Apply all filters
      console.log(`[TopicSelector] Stage ${stage}: Applying LRU filter (1.0)...`);
      candidates = await this.applyLRUFilter(candidates, options, 1.0);
      console.log(`[TopicSelector] Stage ${stage}: After LRU: ${candidates.length} candidates`);
      
      console.log(`[TopicSelector] Stage ${stage}: Applying blacklist filter...`);
      candidates = await this.applyBlacklistFilter(candidates, options, false);
      console.log(`[TopicSelector] Stage ${stage}: After blacklist: ${candidates.length} candidates`);
    } else if (stage === 1) {
      // Relax LRU: Reduce window size to 50%
      console.log(`[TopicSelector] Stage ${stage}: Applying relaxed LRU filter (0.5)...`);
      candidates = await this.applyLRUFilter(candidates, options, 0.5);
      console.log(`[TopicSelector] Stage ${stage}: After LRU: ${candidates.length} candidates`);
      
      candidates = await this.applyBlacklistFilter(candidates, options, false);
      console.log(`[TopicSelector] Stage ${stage}: After blacklist: ${candidates.length} candidates`);
    } else if (stage === 2) {
      // Ignore recent blacklist: Only respect old blacklist entries
      console.log(`[TopicSelector] Stage ${stage}: Applying LRU + expired blacklist only...`);
      candidates = await this.applyLRUFilter(candidates, options, 0.5);
      console.log(`[TopicSelector] Stage ${stage}: After LRU: ${candidates.length} candidates`);
      
      candidates = await this.applyBlacklistFilter(candidates, options, true);
      console.log(`[TopicSelector] Stage ${stage}: After expired blacklist: ${candidates.length} candidates`);
    } else if (stage === 3) {
      // Ignore all blacklist
      console.log(`[TopicSelector] Stage ${stage}: Applying LRU only (no blacklist)...`);
      candidates = await this.applyLRUFilter(candidates, options, 0.5);
      console.log(`[TopicSelector] Stage ${stage}: After LRU: ${candidates.length} candidates`);
    } else if (stage === 4) {
      // Adjacent grades (±1)
      console.log(`[TopicSelector] Stage ${stage}: Using adjacent grades (±1)...`);
      candidates = await this.getAdjacentGradeTopics(options.grade, 1);
      console.log(`[TopicSelector] Stage ${stage}: Adjacent grade candidates: ${candidates.length}`);
      
      candidates = await this.applyLRUFilter(candidates, options, 0.3);
      console.log(`[TopicSelector] Stage ${stage}: After LRU: ${candidates.length} candidates`);
    } else if (stage === 5) {
      // Extended grades (±2)
      console.log(`[TopicSelector] Stage ${stage}: Using extended grades (±2)...`);
      candidates = await this.getAdjacentGradeTopics(options.grade, 2);
      console.log(`[TopicSelector] Stage ${stage}: Extended grade candidates: ${candidates.length}`);
      
      candidates = await this.applyLRUFilter(candidates, options, 0.2);
      console.log(`[TopicSelector] Stage ${stage}: After LRU: ${candidates.length} candidates`);
    } else if (stage === 6) {
      // Emergency: Any active topic from any grade
      console.log(`[TopicSelector] Stage ${stage}: EMERGENCY - using any active topic...`);
      candidates = await this.getEmergencyTopics();
      console.log(`[TopicSelector] Stage ${stage}: Emergency candidates: ${candidates.length}`);
    }

    console.log(`[TopicSelector] Stage ${stage}: Final candidates after all filters: ${candidates.length}`);
    
    if (candidates.length === 0) {
      console.warn(`[TopicSelector] Stage ${stage}: All candidates filtered out!`);
      return null;
    }

    // Get suitability scores
    const suitabilityMap = await this.getSuitabilityScores(
      candidates.map(t => t.topic_code),
      options.grade,
      options.question_type
    );

    // ε-greedy selection
    const forceExploration = options.force_exploration ?? false;
    const isExploration = forceExploration || Math.random() < this.epsilon;

    let selectedTopic: TopicArea;
    let selectionMethod: 'exploration' | 'exploitation';
    let weightScore: number;
    let suitabilityScore: number;

    if (isExploration) {
      // Option C: Low frequency + Low success + Never used
      selectedTopic = await this.selectExplorationTopic(candidates, options);
      selectionMethod = 'exploration';
    } else {
      // Option A/B: Weighted random (roulette wheel)
      selectedTopic = await this.selectExploitationTopic(candidates, suitabilityMap);
      selectionMethod = 'exploitation';
    }

    weightScore = selectedTopic.weight * selectedTopic.official_frequency;
    suitabilityScore = suitabilityMap.get(selectedTopic.topic_code) ?? 1.0;
    const finalScore = weightScore * suitabilityScore;

    const lruFiltered = stage === 0 ? initialCount - candidates.length : 0;
    const blacklistFiltered = 0; // Would need to track this separately

    return {
      topic: selectedTopic,
      selection_method: selectionMethod,
      weight_score: weightScore,
      suitability_score: suitabilityScore,
      final_score: finalScore,
      fallback_stage: stage,
      metadata: {
        candidates_count: candidates.length,
        lru_filtered: lruFiltered,
        blacklist_filtered: blacklistFiltered,
        exploration_probability: this.epsilon,
        selection_timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Get all active topics for a grade
   */
  private async getCandidateTopics(grade: EikenGrade): Promise<TopicArea[]> {
    console.log(`[TopicSelector] Getting candidates for grade: ${grade} (type: ${typeof grade})`);
    
    try {
      const result = await this.db
        .prepare(
          `SELECT * FROM eiken_topic_areas 
           WHERE grade = ? AND is_active = 1 
           ORDER BY weight DESC, official_frequency DESC`
        )
        .bind(grade)
        .all<TopicArea>();

      console.log(`[TopicSelector] Query executed. Success: ${result.success}, Results: ${result.results?.length || 0}`);
      
      if (result.results && result.results.length > 0) {
        console.log(`[TopicSelector] Sample topic:`, JSON.stringify(result.results[0]));
      } else {
        console.warn(`[TopicSelector] No topics found for grade ${grade}!`);
        
        // デバッグ: is_activeなしで試す
        const debugResult = await this.db
          .prepare(`SELECT COUNT(*) as count FROM eiken_topic_areas WHERE grade = ?`)
          .bind(grade)
          .first<{ count: number }>();
        
        console.log(`[TopicSelector] Debug: Total topics for grade ${grade} (ignoring is_active): ${debugResult?.count || 0}`);
      }

      return result.results || [];
    } catch (error) {
      console.error(`[TopicSelector] Error in getCandidateTopics:`, error);
      throw error;
    }
  }

  /**
   * Apply LRU filtering (Least Recently Used)
   */
  private async applyLRUFilter(
    candidates: TopicArea[],
    options: TopicSelectionOptions,
    windowMultiplier: number
  ): Promise<TopicArea[]> {
    const windowSize = Math.max(
      1,
      Math.floor((LRU_WINDOW_SIZES[options.question_type] || LRU_WINDOW_SIZES.default) * windowMultiplier)
    );

    // Get recent usage history
    const recentUsage = await this.db
      .prepare(
        `SELECT topic_code FROM eiken_topic_usage_history
         WHERE student_id = ? AND grade = ? AND question_type = ?
         ORDER BY used_at DESC
         LIMIT ?`
      )
      .bind(options.student_id, options.grade, options.question_type, windowSize)
      .all<{ topic_code: string }>();

    const recentTopics = new Set(recentUsage.results?.map(r => r.topic_code) || []);

    // Filter out recently used topics
    return candidates.filter(t => !recentTopics.has(t.topic_code));
  }

  /**
   * Apply blacklist filtering
   * 
   * @param onlyExpired - When false (stage 0-1): filters out ACTIVE blacklists
   *                      When true (stage 2): filters out EXPIRED blacklists (more relaxed - ignores active ones)
   */
  private async applyBlacklistFilter(
    candidates: TopicArea[],
    options: TopicSelectionOptions,
    onlyExpired: boolean
  ): Promise<TopicArea[]> {
    const now = new Date().toISOString();
    
    let query = `
      SELECT topic_code FROM eiken_topic_blacklist
      WHERE student_id = ? AND grade = ? AND question_type = ?
    `;
    
    if (onlyExpired) {
      // Stage 2 relaxation: Only filter out EXPIRED blacklists (effectively filters nothing useful)
      // expires_at < now (期限切れ) - これは実質的にフィルタリングしない（期限切れは無効なので）
      query += ` AND expires_at < ?`;
    } else {
      // Stage 0-1: Filter out ACTIVE blacklists
      // expires_at > now (まだ有効) または expires_at IS NULL (永続的)
      query += ` AND (expires_at > ? OR expires_at IS NULL)`;
    }

    const stmt = this.db.prepare(query).bind(options.student_id, options.grade, options.question_type, now);

    const blacklisted = await stmt.all<{ topic_code: string }>();
    const blacklistedTopics = new Set(blacklisted.results?.map(r => r.topic_code) || []);

    return candidates.filter(t => !blacklistedTopics.has(t.topic_code));
  }

  /**
   * Get topics from adjacent grades
   */
  private async getAdjacentGradeTopics(
    grade: EikenGrade,
    range: number
  ): Promise<TopicArea[]> {
    const gradeOrder: EikenGrade[] = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];
    const currentIndex = gradeOrder.indexOf(grade);
    
    const adjacentGrades: EikenGrade[] = [];
    for (let i = Math.max(0, currentIndex - range); i <= Math.min(gradeOrder.length - 1, currentIndex + range); i++) {
      if (i !== currentIndex) {
        adjacentGrades.push(gradeOrder[i]);
      }
    }

    if (adjacentGrades.length === 0) {
      return [];
    }

    const placeholders = adjacentGrades.map(() => '?').join(',');
    const result = await this.db
      .prepare(
        `SELECT * FROM eiken_topic_areas 
         WHERE grade IN (${placeholders}) AND is_active = 1`
      )
      .bind(...adjacentGrades)
      .all<TopicArea>();

    return result.results || [];
  }

  /**
   * Get emergency topics (any grade)
   */
  private async getEmergencyTopics(): Promise<TopicArea[]> {
    const result = await this.db
      .prepare(`SELECT * FROM eiken_topic_areas WHERE is_active = 1`)
      .all<TopicArea>();

    return result.results || [];
  }

  /**
   * Get suitability scores for topics
   */
  private async getSuitabilityScores(
    topicCodes: string[],
    grade: EikenGrade,
    questionType: string
  ): Promise<Map<string, number>> {
    if (topicCodes.length === 0) {
      return new Map();
    }

    const placeholders = topicCodes.map(() => '?').join(',');
    const result = await this.db
      .prepare(
        `SELECT topic_code, suitability_score 
         FROM eiken_topic_question_type_suitability
         WHERE topic_code IN (${placeholders}) AND grade = ? AND question_type = ?`
      )
      .bind(...topicCodes, grade, questionType)
      .all<{ topic_code: string; suitability_score: number }>();

    const map = new Map<string, number>();
    result.results?.forEach(r => map.set(r.topic_code, r.suitability_score));
    
    return map;
  }

  /**
   * Exploration: Select low-frequency, low-success, or never-used topics
   */
  private async selectExplorationTopic(
    candidates: TopicArea[],
    options: TopicSelectionOptions
  ): Promise<TopicArea> {
    // Get statistics for candidates
    const topicCodes = candidates.map(t => t.topic_code);
    const placeholders = topicCodes.map(() => '?').join(',');
    
    const stats = await this.db
      .prepare(
        `SELECT topic_code, selection_count, success_count, failure_count
         FROM eiken_topic_statistics
         WHERE grade = ? AND question_type = ? AND topic_code IN (${placeholders})`
      )
      .bind(options.grade, options.question_type, ...topicCodes)
      .all<{ topic_code: string; selection_count: number; success_count: number }>();

    const statsMap = new Map(
      stats.results?.map(s => [
        s.topic_code,
        { count: s.selection_count, successRate: s.success_count / (s.selection_count || 1) },
      ]) || []
    );

    // Priority: Never used > Low frequency > Low success rate
    const neverUsed = candidates.filter(t => !statsMap.has(t.topic_code));
    if (neverUsed.length > 0) {
      return neverUsed[Math.floor(Math.random() * neverUsed.length)];
    }

    // Sort by lowest selection count, then lowest success rate
    const sorted = candidates.sort((a, b) => {
      const aStats = statsMap.get(a.topic_code) || { count: 0, successRate: 0 };
      const bStats = statsMap.get(b.topic_code) || { count: 0, successRate: 0 };
      
      if (aStats.count !== bStats.count) {
        return aStats.count - bStats.count;
      }
      return aStats.successRate - bStats.successRate;
    });

    return sorted[0];
  }

  /**
   * Exploitation: Weighted random selection (roulette wheel)
   */
  private async selectExploitationTopic(
    candidates: TopicArea[],
    suitabilityMap: Map<string, number>
  ): Promise<TopicArea> {
    // Calculate weights
    const weights = candidates.map(t => {
      const weight = t.weight * t.official_frequency;
      const suitability = suitabilityMap.get(t.topic_code) ?? 1.0;
      return weight * suitability;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    if (totalWeight === 0) {
      // Fallback to uniform random
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Roulette wheel selection
    let random = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return candidates[i];
      }
    }

    // Fallback (should not reach here)
    return candidates[candidates.length - 1];
  }

  /**
   * Record topic usage for LRU tracking
   */
  async recordTopicUsage(
    studentId: string,
    grade: EikenGrade,
    topicCode: string,
    questionType: string,
    sessionId?: string
  ): Promise<void> {
    // Insert usage history
    await this.db
      .prepare(
        `INSERT INTO eiken_topic_usage_history 
         (student_id, grade, topic_code, question_type, session_id, used_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(studentId, grade, topicCode, questionType, sessionId || null, new Date().toISOString())
      .run();

    // Update statistics
    await this.db
      .prepare(
        `INSERT INTO eiken_topic_statistics 
         (grade, topic_code, question_type, selection_count, success_count, failure_count, last_selected_at, updated_at)
         VALUES (?, ?, ?, 1, 0, 0, ?, ?)
         ON CONFLICT (grade, topic_code, question_type) 
         DO UPDATE SET 
           selection_count = selection_count + 1,
           last_selected_at = ?,
           updated_at = ?`
      )
      .bind(
        grade,
        topicCode,
        questionType,
        new Date().toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
  }

  /**
   * Add topic to blacklist with dynamic TTL
   */
  async addToBlacklist(
    studentId: string,
    grade: EikenGrade,
    topicCode: string,
    questionType: string,
    reason: BlacklistReason
  ): Promise<void> {
    // Get existing failure count
    const existing = await this.db
      .prepare(
        `SELECT failure_count FROM eiken_topic_blacklist
         WHERE student_id = ? AND grade = ? AND topic_code = ? AND question_type = ?`
      )
      .bind(studentId, grade, topicCode, questionType)
      .first<{ failure_count: number }>();

    const failureCount = (existing?.failure_count || 0) + 1;
    const baseTTL = BLACKLIST_TTL_MAP[reason] || 3;
    const penaltyMultiplier = Math.min(failureCount * 0.5, 2.0);
    const finalTTL = Math.ceil(baseTTL * penaltyMultiplier);

    const expiresAt = new Date(Date.now() + finalTTL * 24 * 60 * 60 * 1000).toISOString();

    // Upsert blacklist entry
    await this.db
      .prepare(
        `INSERT INTO eiken_topic_blacklist 
         (student_id, grade, topic_code, question_type, reason, failure_count, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (student_id, grade, topic_code, question_type) 
         DO UPDATE SET 
           failure_count = ?,
           expires_at = ?,
           reason = ?`
      )
      .bind(
        studentId,
        grade,
        topicCode,
        questionType,
        reason,
        failureCount,
        expiresAt,
        new Date().toISOString(),
        failureCount,
        expiresAt,
        reason
      )
      .run();

    // Update statistics
    await this.db
      .prepare(
        `UPDATE eiken_topic_statistics 
         SET failure_count = failure_count + 1, updated_at = ?
         WHERE grade = ? AND topic_code = ? AND question_type = ?`
      )
      .bind(new Date().toISOString(), grade, topicCode, questionType)
      .run();
  }

  /**
   * Record successful topic completion
   */
  async recordSuccess(
    studentId: string,
    grade: EikenGrade,
    topicCode: string,
    questionType: string,
    completionTimeMs?: number
  ): Promise<void> {
    // Update statistics
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE eiken_topic_statistics 
         SET success_count = success_count + 1, 
             avg_completion_time_ms = CASE 
               WHEN avg_completion_time_ms IS NULL THEN ?
               ELSE (avg_completion_time_ms * success_count + ?) / (success_count + 1)
             END,
             updated_at = ?
         WHERE grade = ? AND topic_code = ? AND question_type = ?`
      )
      .bind(
        completionTimeMs || null,
        completionTimeMs || null,
        now,
        grade,
        topicCode,
        questionType
      )
      .run();
  }

  /**
   * Get topic statistics
   */
  async getTopicStatistics(
    grade?: EikenGrade,
    questionType?: string
  ): Promise<any[]> {
    let query = `SELECT * FROM eiken_topic_statistics WHERE 1=1`;
    const bindings: any[] = [];

    if (grade) {
      query += ` AND grade = ?`;
      bindings.push(grade);
    }

    if (questionType) {
      query += ` AND question_type = ?`;
      bindings.push(questionType);
    }

    query += ` ORDER BY selection_count DESC, last_selected_at DESC`;

    const result = await this.db.prepare(query).bind(...bindings).all();
    return result.results || [];
  }

  /**
   * Phase 7.7: Get recently used topics in current session
   * Returns topic codes used in the last N questions for this student
   */
  private async getRecentTopicsInSession(
    studentId: string,
    limit: number = 5
  ): Promise<string[]> {
    try {
      const result = await this.db
        .prepare(
          `SELECT DISTINCT topic_code 
           FROM eiken_generated_questions 
           WHERE student_id = ? 
           ORDER BY created_at DESC 
           LIMIT ?`
        )
        .bind(studentId, limit)
        .all();
      
      const topics = (result.results || []).map((row: any) => row.topic_code).filter(Boolean);
      return topics;
    } catch (error) {
      console.error('[Phase 7.7] Failed to get recent topics:', error);
      return []; // Fail gracefully
    }
  }
}
