/**
 * Answer Diversity Manager
 * 
 * 正解選択肢の分散を管理し、特定の正解に偏らないようにする
 * Phase 6.5: Prevent biased correct answer patterns
 */

import type { Database } from '@cloudflare/workers-types';
import type { EikenGrade } from '../types';

/**
 * セッション内の正解選択肢の追跡
 */
export interface AnswerDistribution {
  session_id: string;
  grade: EikenGrade;
  answer_history: string[];  // 直近の正解選択肢
  answer_counts: Map<string, number>;  // 各正解の出現回数
  timestamp: number;
}

/**
 * 正解選択肢の分散設定
 */
const DIVERSITY_CONFIG = {
  // 直近N問での重複チェック
  RECENT_WINDOW: 4,
  
  // 同じ正解が連続する最大回数
  MAX_CONSECUTIVE: 2,
  
  // セッション全体での最大出現率（%）
  MAX_FREQUENCY_PERCENT: 40,
  
  // ブラックリスト期間（同じ正解を避ける期間）
  BLACKLIST_WINDOW: 2,
};

export class AnswerDiversityManager {
  private distributions: Map<string, AnswerDistribution> = new Map();
  
  constructor(
    private db: Database | D1Database,
    private env?: any
  ) {}
  
  /**
   * セッションの正解履歴を初期化
   */
  async initializeSession(sessionId: string, grade: EikenGrade): Promise<void> {
    this.distributions.set(sessionId, {
      session_id: sessionId,
      grade,
      answer_history: [],
      answer_counts: new Map(),
      timestamp: Date.now(),
    });
  }
  
  /**
   * 正解選択肢を記録
   */
  async recordAnswer(
    sessionId: string,
    correctAnswer: string,
    grade: EikenGrade
  ): Promise<void> {
    let dist = this.distributions.get(sessionId);
    
    if (!dist) {
      await this.initializeSession(sessionId, grade);
      dist = this.distributions.get(sessionId)!;
    }
    
    // 正規化（大文字小文字、トリム）
    const normalized = this.normalizeAnswer(correctAnswer);
    
    // 履歴に追加
    dist.answer_history.push(normalized);
    
    // カウント更新
    const count = dist.answer_counts.get(normalized) || 0;
    dist.answer_counts.set(normalized, count + 1);
    
    // 古いエントリーをクリーンアップ（メモリ管理）
    if (dist.answer_history.length > 20) {
      const removed = dist.answer_history.shift()!;
      const currentCount = dist.answer_counts.get(removed) || 0;
      if (currentCount > 1) {
        dist.answer_counts.set(removed, currentCount - 1);
      } else {
        dist.answer_counts.delete(removed);
      }
    }
    
    console.log(`[AnswerDiversity] Session ${sessionId}: Recorded answer "${normalized}"`, {
      history: dist.answer_history.slice(-5),
      counts: Object.fromEntries(dist.answer_counts),
    });
  }
  
  /**
   * 正解選択肢がブラックリストに入っているかチェック
   */
  shouldAvoidAnswer(sessionId: string, candidateAnswer: string): boolean {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.answer_history.length === 0) {
      return false;
    }
    
    const normalized = this.normalizeAnswer(candidateAnswer);
    const history = dist.answer_history;
    
    // 1. 連続チェック
    if (history.length >= DIVERSITY_CONFIG.MAX_CONSECUTIVE) {
      const recent = history.slice(-DIVERSITY_CONFIG.MAX_CONSECUTIVE);
      if (recent.every(ans => ans === normalized)) {
        console.log(`[AnswerDiversity] 🚫 AVOID: "${normalized}" appeared ${DIVERSITY_CONFIG.MAX_CONSECUTIVE} times consecutively`);
        return true;
      }
    }
    
    // 2. 直近N問での頻度チェック
    if (history.length >= DIVERSITY_CONFIG.RECENT_WINDOW) {
      const recentWindow = history.slice(-DIVERSITY_CONFIG.RECENT_WINDOW);
      const recentCount = recentWindow.filter(ans => ans === normalized).length;
      const frequency = (recentCount / DIVERSITY_CONFIG.RECENT_WINDOW) * 100;
      
      if (frequency > DIVERSITY_CONFIG.MAX_FREQUENCY_PERCENT) {
        console.log(`[AnswerDiversity] 🚫 AVOID: "${normalized}" frequency ${frequency.toFixed(1)}% in recent ${DIVERSITY_CONFIG.RECENT_WINDOW} questions`);
        return true;
      }
    }
    
    // 3. ブラックリスト期間チェック
    if (history.length >= DIVERSITY_CONFIG.BLACKLIST_WINDOW) {
      const blacklistWindow = history.slice(-DIVERSITY_CONFIG.BLACKLIST_WINDOW);
      if (blacklistWindow.every(ans => ans === normalized)) {
        console.log(`[AnswerDiversity] 🚫 AVOID: "${normalized}" in blacklist window (last ${DIVERSITY_CONFIG.BLACKLIST_WINDOW} questions)`);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 正解選択肢の推奨リストを取得（少ない順にソート）
   */
  getRecommendedAnswers(sessionId: string, candidateAnswers: string[]): string[] {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.answer_history.length === 0) {
      // 履歴がない場合はランダム
      return this.shuffleArray([...candidateAnswers]);
    }
    
    // カウント順にソート（少ない順）
    const sorted = candidateAnswers
      .map(ans => {
        const normalized = this.normalizeAnswer(ans);
        const count = dist.answer_counts.get(normalized) || 0;
        return { answer: ans, count };
      })
      .sort((a, b) => a.count - b.count)
      .map(item => item.answer);
    
    console.log(`[AnswerDiversity] Recommended answers (least frequent first):`, sorted);
    return sorted;
  }
  
  /**
   * プロンプトに正解分散の指示を追加
   */
  getAnswerDiversityInstruction(sessionId: string): string {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.answer_history.length === 0) {
      return '';
    }
    
    // 直近の正解履歴
    const recentAnswers = dist.answer_history.slice(-4);
    
    // 頻度の高い正解を特定
    const counts = Array.from(dist.answer_counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    const avoidList = counts
      .filter(([_, count]) => count >= 2)
      .map(([ans, count]) => `"${ans}" (${count}回)`)
      .join(', ');
    
    if (!avoidList) {
      return '';
    }
    
    return `
⚠️ ANSWER DIVERSITY REQUIREMENT:
Recent correct answers: [${recentAnswers.join(', ')}]
HIGH FREQUENCY ANSWERS: ${avoidList}

🎯 YOUR TASK:
- Avoid making these high-frequency answers correct again
- Choose a DIFFERENT answer option that has appeared less frequently
- Ensure the question naturally leads to the less-used answer
- Maintain question quality while diversifying correct answers
`;
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics(sessionId: string): {
    total_questions: number;
    answer_counts: Record<string, number>;
    recent_history: string[];
  } | null {
    const dist = this.distributions.get(sessionId);
    if (!dist) {
      return null;
    }
    
    return {
      total_questions: dist.answer_history.length,
      answer_counts: Object.fromEntries(dist.answer_counts),
      recent_history: dist.answer_history.slice(-10),
    };
  }
  
  /**
   * 正解を正規化
   */
  private normalizeAnswer(answer: string): string {
    return answer.trim().toLowerCase();
  }
  
  /**
   * 配列をシャッフル
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  
  /**
   * セッションをクリーンアップ（メモリ管理）
   */
  cleanupOldSessions(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [sessionId, dist] of this.distributions.entries()) {
      if (now - dist.timestamp > maxAge) {
        this.distributions.delete(sessionId);
        console.log(`[AnswerDiversity] Cleaned up old session: ${sessionId}`);
      }
    }
  }
}
