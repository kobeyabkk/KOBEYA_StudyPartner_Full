/**
 * Grammar Category Diversity Manager
 * Phase 6.7: Prevent biased grammar category patterns in questions
 * 
 * Problem: AI generates too many modal/be-verb questions in a row
 * Solution: Track and diversify grammar categories across a session
 */

import type { Database } from '@cloudflare/workers-types';
import type { EikenGrade } from '../types';

/**
 * Grammar category types for question classification
 * Based on actual Eiken exam patterns analysis
 */
export type GrammarCategory = 
  | 'modal_verb'          // 助動詞: can, will, should, must, may, would, could
  | 'be_verb'             // be動詞: am, is, are, was, were
  | 'general_verb'        // 一般動詞: play, go, study, etc.
  | 'wh_question'         // 疑問詞: what, where, when, who, why, how
  | 'progressive'         // 進行形: be + -ing
  | 'to_infinitive'       // 不定詞: to + verb
  | 'gerund'              // 動名詞: -ing (名詞的)
  | 'conjunction'         // 接続詞: because, when, if, but
  | 'comparative'         // 比較: -er, more, most
  | 'other';              // その他

/**
 * Session tracking for grammar categories
 */
export interface GrammarCategoryDistribution {
  session_id: string;
  grade: EikenGrade;
  category_history: GrammarCategory[];
  category_counts: Map<GrammarCategory, number>;
  timestamp: number;
}

/**
 * Diversity configuration
 */
const CATEGORY_DIVERSITY_CONFIG = {
  // 直近N問でのカテゴリーチェック
  RECENT_WINDOW: 5,
  
  // 同じカテゴリーが連続する最大回数
  MAX_CONSECUTIVE: 2,
  
  // セッション全体での最大出現率（%）
  MAX_FREQUENCY_PERCENT: 50,  // 50%まで許容（英検の実際の傾向を考慮）
  
  // ブラックリスト期間
  BLACKLIST_WINDOW: 3,
};

/**
 * Grammar category keywords for detection
 */
const CATEGORY_KEYWORDS: Record<GrammarCategory, string[]> = {
  modal_verb: ['can', 'will', 'shall', 'should', 'must', 'may', 'might', 'would', 'could'],
  be_verb: ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'],
  general_verb: ['play', 'go', 'come', 'do', 'have', 'make', 'take', 'get', 'see', 'know', 'think', 'say', 'eat', 'drink', 'read', 'write', 'study', 'live', 'work', 'like', 'want', 'need'],
  wh_question: ['what', 'where', 'when', 'who', 'whom', 'whose', 'which', 'why', 'how'],
  progressive: ['playing', 'going', 'studying', 'reading', 'writing', 'doing', 'making', 'taking'],
  to_infinitive: ['to play', 'to go', 'to study', 'to read', 'to write', 'to do', 'to make'],
  gerund: ['playing', 'going', 'studying', 'reading', 'writing', 'swimming', 'cooking'],
  conjunction: ['because', 'when', 'if', 'but', 'and', 'or', 'so', 'although', 'while'],
  comparative: ['better', 'bigger', 'more', 'most', 'faster', 'slower', '-er', '-est'],
  other: []
};

export class GrammarCategoryDiversityManager {
  private distributions: Map<string, GrammarCategoryDistribution> = new Map();
  
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
    
    console.log(`[GrammarCategoryDiversity] Initialized session ${sessionId} for grade ${grade}`);
  }
  
  /**
   * 文法カテゴリーを記録
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
    
    // 古いエントリーをクリーンアップ
    if (dist.category_history.length > 20) {
      const removed = dist.category_history.shift()!;
      const currentCount = dist.category_counts.get(removed) || 0;
      if (currentCount > 1) {
        dist.category_counts.set(removed, currentCount - 1);
      } else {
        dist.category_counts.delete(removed);
      }
    }
    
    console.log(`[GrammarCategoryDiversity] Session ${sessionId}: Recorded category "${category}"`, {
      history: dist.category_history.slice(-5),
      counts: Object.fromEntries(dist.category_counts),
    });
  }
  
  /**
   * 文法カテゴリーを回避すべきかチェック
   */
  shouldAvoidCategory(sessionId: string, candidateCategory: GrammarCategory): boolean {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.category_history.length === 0) {
      return false;
    }
    
    const history = dist.category_history;
    
    // 1. 連続チェック
    if (history.length >= CATEGORY_DIVERSITY_CONFIG.MAX_CONSECUTIVE) {
      const recent = history.slice(-CATEGORY_DIVERSITY_CONFIG.MAX_CONSECUTIVE);
      if (recent.every(cat => cat === candidateCategory)) {
        console.log(`[GrammarCategoryDiversity] 🚫 AVOID: "${candidateCategory}" appeared ${CATEGORY_DIVERSITY_CONFIG.MAX_CONSECUTIVE} times consecutively`);
        return true;
      }
    }
    
    // 2. 直近N問での頻度チェック
    if (history.length >= CATEGORY_DIVERSITY_CONFIG.RECENT_WINDOW) {
      const recentWindow = history.slice(-CATEGORY_DIVERSITY_CONFIG.RECENT_WINDOW);
      const recentCount = recentWindow.filter(cat => cat === candidateCategory).length;
      const frequency = (recentCount / CATEGORY_DIVERSITY_CONFIG.RECENT_WINDOW) * 100;
      
      if (frequency > CATEGORY_DIVERSITY_CONFIG.MAX_FREQUENCY_PERCENT) {
        console.log(`[GrammarCategoryDiversity] 🚫 AVOID: "${candidateCategory}" frequency ${frequency.toFixed(1)}% in recent ${CATEGORY_DIVERSITY_CONFIG.RECENT_WINDOW} questions`);
        return true;
      }
    }
    
    // 3. ブラックリスト期間チェック
    if (history.length >= CATEGORY_DIVERSITY_CONFIG.BLACKLIST_WINDOW) {
      const blacklistWindow = history.slice(-CATEGORY_DIVERSITY_CONFIG.BLACKLIST_WINDOW);
      const blacklistCount = blacklistWindow.filter(cat => cat === candidateCategory).length;
      
      // 直近3問中2問以上が同じカテゴリーなら回避
      if (blacklistCount >= 2) {
        console.log(`[GrammarCategoryDiversity] 🚫 AVOID: "${candidateCategory}" appeared ${blacklistCount}/${CATEGORY_DIVERSITY_CONFIG.BLACKLIST_WINDOW} in blacklist window`);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 質問文から文法カテゴリーを検出
   */
  detectGrammarCategory(questionText: string, choices: string[]): GrammarCategory {
    const text = questionText.toLowerCase();
    const choicesText = choices.join(' ').toLowerCase();
    const combined = `${text} ${choicesText}`;
    
    // 優先度順にチェック
    
    // 1. 疑問詞チェック（文頭に来ることが多い）
    for (const keyword of CATEGORY_KEYWORDS.wh_question) {
      if (text.trim().startsWith(keyword)) {
        return 'wh_question';
      }
    }
    
    // 2. 助動詞チェック（選択肢に助動詞が2つ以上）
    const modalCount = CATEGORY_KEYWORDS.modal_verb.filter(m => 
      choicesText.includes(m)
    ).length;
    if (modalCount >= 2) {
      return 'modal_verb';
    }
    
    // 3. be動詞チェック（選択肢にbe動詞が2つ以上）
    const beVerbCount = CATEGORY_KEYWORDS.be_verb.filter(bv => 
      choicesText.includes(bv)
    ).length;
    if (beVerbCount >= 2) {
      return 'be_verb';
    }
    
    // 4. 進行形チェック（-ing形が多い）
    if (choicesText.includes('ing') || combined.includes('is studying') || combined.includes('are playing')) {
      return 'progressive';
    }
    
    // 5. 不定詞チェック
    for (const keyword of CATEGORY_KEYWORDS.to_infinitive) {
      if (combined.includes(keyword)) {
        return 'to_infinitive';
      }
    }
    
    // 6. 接続詞チェック
    for (const keyword of CATEGORY_KEYWORDS.conjunction) {
      if (choicesText.includes(keyword)) {
        return 'conjunction';
      }
    }
    
    // 7. 比較チェック
    for (const keyword of CATEGORY_KEYWORDS.comparative) {
      if (combined.includes(keyword)) {
        return 'comparative';
      }
    }
    
    // 8. 動名詞チェック（-ing形だが進行形でない）
    if (combined.includes('like') && combined.includes('ing')) {
      return 'gerund';
    }
    
    // 9. 一般動詞チェック（デフォルト）
    for (const keyword of CATEGORY_KEYWORDS.general_verb) {
      if (choicesText.includes(keyword)) {
        return 'general_verb';
      }
    }
    
    return 'other';
  }
  
  /**
   * LLMプロンプトに文法カテゴリー分散の指示を追加
   */
  getCategoryDiversityInstruction(sessionId: string): string {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.category_history.length === 0) {
      return '';
    }
    
    // 直近の履歴
    const recentCategories = dist.category_history.slice(-5);
    
    // 頻度の高いカテゴリーを特定
    const counts = Array.from(dist.category_counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    const avoidList = counts
      .filter(([_, count]) => count >= 2)
      .map(([cat, count]) => {
        const label = this.getCategoryLabel(cat);
        return `"${label}" (${count}回)`;
      })
      .join(', ');
    
    if (!avoidList) {
      return '';
    }
    
    const recentLabels = recentCategories.map(cat => this.getCategoryLabel(cat));
    
    return `
⚠️ GRAMMAR CATEGORY DIVERSITY REQUIREMENT:
Recent grammar categories: [${recentLabels.join(', ')}]
HIGH FREQUENCY CATEGORIES: ${avoidList}

🎯 YOUR TASK:
- Create questions with DIFFERENT grammar focus
- Avoid these over-used categories: ${avoidList}
- Examples of diverse categories:
  • Wh-questions (What/Where/When/Who)
  • General verbs (past/present/future tense verbs)
  • Progressive forms (is/are + -ing)
  • To-infinitives (want to, like to)
  • Conjunctions (because, when, if)
  • Comparatives (bigger, better, more)
- Maintain natural dialogue while varying grammar patterns
`;
  }
  
  /**
   * カテゴリーのラベルを取得
   */
  private getCategoryLabel(category: GrammarCategory): string {
    const labels: Record<GrammarCategory, string> = {
      modal_verb: '助動詞 (can/will/should)',
      be_verb: 'be動詞 (am/is/are/was/were)',
      general_verb: '一般動詞 (play/go/study)',
      wh_question: '疑問詞 (what/where/when)',
      progressive: '進行形 (-ing)',
      to_infinitive: '不定詞 (to + verb)',
      gerund: '動名詞 (-ing)',
      conjunction: '接続詞 (because/when/if)',
      comparative: '比較 (bigger/better)',
      other: 'その他'
    };
    
    return labels[category] || category;
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics(sessionId: string): {
    total_questions: number;
    category_counts: Record<string, number>;
    recent_history: string[];
  } | null {
    const dist = this.distributions.get(sessionId);
    if (!dist) {
      return null;
    }
    
    const categoryLabels = Array.from(dist.category_history.slice(-10))
      .map(cat => this.getCategoryLabel(cat));
    
    return {
      total_questions: dist.category_history.length,
      category_counts: Object.fromEntries(
        Array.from(dist.category_counts.entries()).map(([cat, count]) => [
          this.getCategoryLabel(cat),
          count
        ])
      ),
      recent_history: categoryLabels,
    };
  }
  
  /**
   * セッションをクリーンアップ
   */
  cleanupOldSessions(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [sessionId, dist] of this.distributions.entries()) {
      if (now - dist.timestamp > maxAge) {
        this.distributions.delete(sessionId);
        console.log(`[GrammarCategoryDiversity] Cleaned up old session: ${sessionId}`);
      }
    }
  }
}
