/**
 * Grammar Category Diversity Manager
 * 
 * Phase 6.7: 問題の文法カテゴリー分散を管理
 * 実際の英検出題傾向に基づく
 */

import type { Database } from '@cloudflare/workers-types';
import type { EikenGrade } from '../types';

/**
 * 文法カテゴリーの定義（実際の英検出題傾向ベース）
 */
export type GrammarCategory = 
  | 'modal_verb'           // 助動詞 (can, will, should, must)
  | 'be_verb'              // be動詞 (am, is, are, was, were)
  | 'general_verb_tense'   // 一般動詞の時制 (play, played, plays)
  | 'question_auxiliary';  // 疑問文の助動詞 (Do, Does, Did, Will, Can)

/**
 * カテゴリー別の出題頻度設定（英検4級の実際の傾向）
 */
const CATEGORY_WEIGHTS: Record<GrammarCategory, number> = {
  'modal_verb': 0.25,           // 25% - can, will, should, must
  'be_verb': 0.20,              // 20% - am, is, are, was, were
  'general_verb_tense': 0.40,   // 40% - played, plays, play
  'question_auxiliary': 0.15,   // 15% - Do, Does, Did, Will, Can
};

/**
 * セッション内のカテゴリー分布追跡
 */
export interface CategoryDistribution {
  session_id: string;
  grade: EikenGrade;
  category_history: GrammarCategory[];  // 直近の問題カテゴリー
  category_counts: Map<GrammarCategory, number>;  // 各カテゴリーの出現回数
  timestamp: number;
}

/**
 * 分散設定
 */
const DIVERSITY_CONFIG = {
  // 直近N問でのカテゴリー重複チェック
  RECENT_WINDOW: 5,
  
  // 同じカテゴリーが連続する最大回数
  MAX_CONSECUTIVE: 2,
  
  // セッション全体での最大出現率（目標比率 + 許容誤差）
  MAX_DEVIATION_PERCENT: 15,  // ±15%まで許容
  
  // ブラックリスト期間
  BLACKLIST_WINDOW: 2,
};

export class GrammarCategoryManager {
  private distributions: Map<string, CategoryDistribution> = new Map();
  
  constructor(
    private db: Database | D1Database,
    private env?: any
  ) {}
  
  /**
   * セッションの初期化
   */
  async initializeSession(sessionId: string, grade: EikenGrade): Promise<void> {
    this.distributions.set(sessionId, {
      session_id: sessionId,
      grade,
      category_history: [],
      category_counts: new Map(),
      timestamp: Date.now(),
    });
    
    console.log(`[CategoryManager] Session ${sessionId} initialized for Grade ${grade}`);
  }
  
  /**
   * 問題カテゴリーを記録
   */
  async recordCategory(
    sessionId: string,
    category: GrammarCategory,
    grade: EikenGrade
  ): Promise<void> {
    let dist = this.distributions.get(sessionId);
    
    if (!dist) {
      await this.initializeSession(sessionId, grade);
      dist = this.distributions.get(sessionId)!;
    }
    
    // 履歴に追加
    dist.category_history.push(category);
    
    // カウント更新
    const count = dist.category_counts.get(category) || 0;
    dist.category_counts.set(category, count + 1);
    
    console.log(`[CategoryManager] Recorded category: "${category}"`, {
      session: sessionId,
      total_questions: dist.category_history.length,
      counts: Object.fromEntries(dist.category_counts),
    });
  }
  
  /**
   * カテゴリーが偏っていないかチェック
   */
  shouldAvoidCategory(sessionId: string, candidateCategory: GrammarCategory): boolean {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.category_history.length === 0) {
      return false;
    }
    
    const history = dist.category_history;
    
    // 1. 連続チェック
    if (history.length >= DIVERSITY_CONFIG.MAX_CONSECUTIVE) {
      const recent = history.slice(-DIVERSITY_CONFIG.MAX_CONSECUTIVE);
      if (recent.every(cat => cat === candidateCategory)) {
        console.log(`[CategoryManager] 🚫 AVOID: "${candidateCategory}" appeared ${DIVERSITY_CONFIG.MAX_CONSECUTIVE} times consecutively`);
        return true;
      }
    }
    
    // 2. 直近N問での頻度チェック
    if (history.length >= DIVERSITY_CONFIG.RECENT_WINDOW) {
      const recentWindow = history.slice(-DIVERSITY_CONFIG.RECENT_WINDOW);
      const recentCount = recentWindow.filter(cat => cat === candidateCategory).length;
      const targetWeight = CATEGORY_WEIGHTS[candidateCategory];
      const expectedCount = DIVERSITY_CONFIG.RECENT_WINDOW * targetWeight;
      const maxAllowed = Math.ceil(expectedCount + (DIVERSITY_CONFIG.RECENT_WINDOW * DIVERSITY_CONFIG.MAX_DEVIATION_PERCENT / 100));
      
      if (recentCount >= maxAllowed) {
        console.log(`[CategoryManager] 🚫 AVOID: "${candidateCategory}" count ${recentCount} exceeds max ${maxAllowed} in recent ${DIVERSITY_CONFIG.RECENT_WINDOW} questions`);
        return true;
      }
    }
    
    // 3. セッション全体での出現率チェック
    if (history.length >= 8) {  // 最低8問以上で統計的にチェック
      const currentCount = dist.category_counts.get(candidateCategory) || 0;
      const totalQuestions = history.length;
      const currentRatio = (currentCount + 1) / (totalQuestions + 1);  // 次の問題を含めた比率
      const targetRatio = CATEGORY_WEIGHTS[candidateCategory];
      const maxRatio = targetRatio + (DIVERSITY_CONFIG.MAX_DEVIATION_PERCENT / 100);
      
      if (currentRatio > maxRatio) {
        console.log(`[CategoryManager] 🚫 AVOID: "${candidateCategory}" ratio ${(currentRatio * 100).toFixed(1)}% exceeds target ${(targetRatio * 100).toFixed(1)}%`);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 推奨カテゴリーを取得（出現回数が少ない順）
   */
  getRecommendedCategories(sessionId: string): GrammarCategory[] {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.category_history.length === 0) {
      // 初期状態では重み付けに基づいてランダム
      return this.weightedRandomCategories();
    }
    
    const totalQuestions = dist.category_history.length;
    
    // 各カテゴリーの現在の出現率と目標比率の差を計算
    const categories = Object.keys(CATEGORY_WEIGHTS) as GrammarCategory[];
    const sorted = categories
      .map(cat => {
        const count = dist.category_counts.get(cat) || 0;
        const currentRatio = count / totalQuestions;
        const targetRatio = CATEGORY_WEIGHTS[cat];
        const deficit = targetRatio - currentRatio;  // 不足度（正の値ほど優先）
        
        return { category: cat, deficit, count };
      })
      .sort((a, b) => b.deficit - a.deficit)  // 不足度が高い順
      .map(item => item.category);
    
    console.log(`[CategoryManager] Recommended categories (most needed first):`, sorted);
    return sorted;
  }
  
  /**
   * 重み付けランダムでカテゴリーを選択
   */
  private weightedRandomCategories(): GrammarCategory[] {
    const categories = Object.entries(CATEGORY_WEIGHTS) as [GrammarCategory, number][];
    
    // 重みに基づいてシャッフル
    const shuffled = categories
      .map(([cat, weight]) => ({ category: cat, weight, random: Math.random() * weight }))
      .sort((a, b) => b.random - a.random)
      .map(item => item.category);
    
    return shuffled;
  }
  
  /**
   * LLMプロンプトにカテゴリー指示を追加
   */
  getCategoryInstruction(sessionId: string): string {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.category_history.length === 0) {
      return '';
    }
    
    // 直近のカテゴリー履歴
    const recentCategories = dist.category_history.slice(-5);
    
    // 推奨カテゴリー（最も不足しているもの）
    const recommended = this.getRecommendedCategories(sessionId);
    const topRecommended = recommended[0];
    
    // カテゴリー別の統計
    const totalQuestions = dist.category_history.length;
    const stats = Object.entries(CATEGORY_WEIGHTS)
      .map(([cat, targetRatio]) => {
        const count = dist.category_counts.get(cat as GrammarCategory) || 0;
        const currentRatio = count / totalQuestions;
        const percentage = (currentRatio * 100).toFixed(1);
        const target = (targetRatio * 100).toFixed(0);
        
        return `${this.getCategoryLabel(cat as GrammarCategory)}: ${count}問 (${percentage}%, 目標${target}%)`;
      })
      .join('\n');
    
    const categoryDesc = this.getCategoryDescription(topRecommended);
    
    return `
⚖️ GRAMMAR CATEGORY BALANCE REQUIREMENT:
Recent categories: [${recentCategories.map(c => this.getCategoryLabel(c)).join(', ')}]

Current distribution:
${stats}

🎯 RECOMMENDED CATEGORY: ${this.getCategoryLabel(topRecommended)}
${categoryDesc}

CRITICAL: Create a question in the RECOMMENDED CATEGORY above to maintain proper balance.
`;
  }
  
  /**
   * カテゴリーのラベルを取得
   */
  private getCategoryLabel(category: GrammarCategory): string {
    const labels: Record<GrammarCategory, string> = {
      'modal_verb': '助動詞',
      'be_verb': 'be動詞',
      'general_verb_tense': '一般動詞の時制',
      'question_auxiliary': '疑問文助動詞',
    };
    return labels[category];
  }
  
  /**
   * カテゴリーの説明を取得
   */
  private getCategoryDescription(category: GrammarCategory): string {
    const descriptions: Record<GrammarCategory, string> = {
      'modal_verb': `
Examples:
- "I _____ play the piano." → can
- "You _____ study hard." → should
- "It _____ rain tomorrow." → will
- "You _____ finish your homework." → must

Focus: Use modal verbs (can, will, should, must) as the correct answer.
Distractors: Other modal verbs or verb forms.`,

      'be_verb': `
Examples:
- "_____ you a student?" → Are
- "She _____ happy yesterday." → was
- "They _____ at home now." → are
- "There _____ many books on the desk." → are

Focus: Use be verbs (am, is, are, was, were) as the correct answer.
Distractors: Other be verb forms or auxiliary verbs.`,

      'general_verb_tense': `
Examples:
- "I _____ soccer yesterday." → played
- "He _____ to school every day." → goes
- "They _____ pizza last night." → ate
- "She _____ her homework now." → does

Focus: Use general verbs in correct tense (past, present, present 3rd person singular).
Distractors: Same verb in different tenses.`,

      'question_auxiliary': `
Examples:
- "_____ you like music?" → Do
- "_____ she go to school yesterday?" → Did
- "_____ he play tennis?" → Does
- "_____ you help me?" → Will / Can

Focus: Use question auxiliary verbs (Do, Does, Did, Will, Can) at the beginning of questions.
Distractors: Other auxiliary verbs or wrong tense forms.`,
    };
    
    return descriptions[category];
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics(sessionId: string): {
    total_questions: number;
    category_counts: Record<string, number>;
    category_ratios: Record<string, string>;
    target_ratios: Record<string, string>;
    recent_history: string[];
  } | null {
    const dist = this.distributions.get(sessionId);
    if (!dist) {
      return null;
    }
    
    const totalQuestions = dist.category_history.length;
    const categoryRatios: Record<string, string> = {};
    const targetRatios: Record<string, string> = {};
    
    Object.entries(CATEGORY_WEIGHTS).forEach(([cat, targetRatio]) => {
      const count = dist.category_counts.get(cat as GrammarCategory) || 0;
      const currentRatio = totalQuestions > 0 ? count / totalQuestions : 0;
      categoryRatios[cat] = `${(currentRatio * 100).toFixed(1)}%`;
      targetRatios[cat] = `${(targetRatio * 100).toFixed(0)}%`;
    });
    
    return {
      total_questions: totalQuestions,
      category_counts: Object.fromEntries(dist.category_counts),
      category_ratios: categoryRatios,
      target_ratios: targetRatios,
      recent_history: dist.category_history.slice(-10).map(c => this.getCategoryLabel(c)),
    };
  }
  
  /**
   * 質問テキストからカテゴリーを推測
   */
  detectCategory(questionText: string, choices: string[]): GrammarCategory {
    const lowerQuestion = questionText.toLowerCase();
    const lowerChoices = choices.map(c => c.toLowerCase());
    
    // 1. 助動詞パターン
    const modals = ['can', 'will', 'should', 'must', 'may', 'could', 'would'];
    if (lowerChoices.some(c => modals.includes(c.trim()))) {
      return 'modal_verb';
    }
    
    // 2. be動詞パターン
    const beVerbs = ['am', 'is', 'are', 'was', 'were'];
    if (lowerChoices.some(c => beVerbs.includes(c.trim()))) {
      return 'be_verb';
    }
    
    // 3. 疑問文助動詞パターン
    const questionAux = ['do', 'does', 'did'];
    if (lowerQuestion.startsWith('a:') || lowerQuestion.startsWith('b:')) {
      // 会話形式
      if (lowerChoices.some(c => questionAux.includes(c.trim()))) {
        return 'question_auxiliary';
      }
    }
    
    // 4. デフォルト: 一般動詞の時制
    return 'general_verb_tense';
  }
  
  /**
   * セッションをクリーンアップ
   */
  cleanupOldSessions(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [sessionId, dist] of this.distributions.entries()) {
      if (now - dist.timestamp > maxAge) {
        this.distributions.delete(sessionId);
        console.log(`[CategoryManager] Cleaned up old session: ${sessionId}`);
      }
    }
  }
}
