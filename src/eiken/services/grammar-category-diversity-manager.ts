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
 * ✅ Based on ACTUAL Eiken Grade 4 past exam analysis (2020-2025)
 * 
 * Key principle: Choices in a question should be from the SAME category
 * Example: Preposition questions → all 4 choices are prepositions
 */
export type GrammarCategory = 
  // === TOP PRIORITY (Must appear in each session) ===
  | 'verb_meaning'        // 一般動詞の意味 (20-27%): 4 different verbs like "give/ride/have/buy"
  | 'preposition'         // 前置詞・句動詞 (13-20%): "over/down/in/off" (get off, look at, etc.)
  | 'noun_meaning'        // 名詞の意味 (13-20%): "idea/body/city/word"
  
  // === HIGH PRIORITY (Common patterns) ===
  | 'verb_tense'          // 動詞の時制 (13-20%): Same verb in different forms "talk/talks/talked/talking"
  | 'modal_verb'          // 助動詞 (13-20%): "can/will/should/must/may"
  
  // === MEDIUM PRIORITY (Regular patterns) ===
  | 'wh_question'         // 疑問詞 (7%): "what/where/when/who"
  | 'to_infinitive'       // 不定詞 (7%): "want to/like to/decide to"
  | 'gerund'              // 動名詞 (7%): "enjoy -ing/finish -ing"
  
  // === LOW PRIORITY (Occasional) ===
  | 'conjunction'         // 接続詞 (0-7%): "because/when/if/but"
  | 'conversation'        // 会話表現 (7-13%): Full sentence responses
  | 'adjective_meaning'   // 形容詞の意味: "happy/sad/angry/excited"
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
 * Diversity configuration based on actual Eiken Grade 4 distribution
 * Target for 15 questions (大問1):
 * - verb_meaning: 3-4 questions (20-27%)
 * - preposition: 2-3 questions (13-20%)
 * - noun_meaning: 2-3 questions (13-20%)
 * - verb_tense: 2-3 questions (13-20%)
 * - modal_verb: 2-3 questions (13-20%)
 * - Others: 1-2 questions each (0-13%)
 */
const CATEGORY_DIVERSITY_CONFIG = {
  // 直近N問でのカテゴリーチェック
  RECENT_WINDOW: 5,
  
  // 同じカテゴリーが連続する最大回数
  MAX_CONSECUTIVE: 2,
  
  // カテゴリー別の目標割合（4級）
  TARGET_DISTRIBUTION: {
    'verb_meaning': { min: 20, max: 30 },        // 20-30%
    'preposition': { min: 13, max: 20 },         // 13-20%
    'noun_meaning': { min: 13, max: 20 },        // 13-20%
    'verb_tense': { min: 13, max: 20 },          // 13-20%
    'modal_verb': { min: 10, max: 20 },          // 10-20% (reduced from current 80%!)
    'wh_question': { min: 5, max: 10 },          // 5-10%
    'to_infinitive': { min: 5, max: 10 },        // 5-10%
    'gerund': { min: 5, max: 10 },               // 5-10%
    'conjunction': { min: 0, max: 7 },           // 0-7%
    'conversation': { min: 5, max: 15 },         // 5-15%
    'adjective_meaning': { min: 0, max: 10 },    // 0-10%
    'other': { min: 0, max: 10 },                // 0-10%
  } as Record<GrammarCategory, { min: number; max: number }>,
  
  // ブラックリスト期間
  BLACKLIST_WINDOW: 3,
};

/**
 * Grammar category keywords for detection
 * ✅ Updated to match actual Eiken patterns
 */
const CATEGORY_KEYWORDS: Record<GrammarCategory, string[]> = {
  // TOP PRIORITY CATEGORIES
  verb_meaning: [
    // Common action verbs (選択肢4つ全て異なる動詞)
    'give', 'take', 'make', 'do', 'have', 'get', 'see', 'look', 'watch',
    'go', 'come', 'leave', 'arrive', 'stay', 'visit',
    'play', 'study', 'read', 'write', 'learn', 'teach',
    'eat', 'drink', 'cook', 'buy', 'sell', 'pay',
    'say', 'tell', 'speak', 'talk', 'ask', 'answer',
    'like', 'love', 'want', 'need', 'enjoy', 'prefer',
    'know', 'think', 'understand', 'remember', 'forget',
    'live', 'work', 'help', 'meet', 'find', 'use',
    'open', 'close', 'start', 'finish', 'stop', 'wait',
    'sit', 'stand', 'walk', 'run', 'ride', 'drive'
  ],
  
  preposition: [
    // Prepositions for phrasal verbs (選択肢4つ全て前置詞)
    'in', 'on', 'at', 'to', 'for', 'from', 'with', 'by',
    'up', 'down', 'over', 'under', 'off', 'out', 'into',
    'about', 'after', 'before', 'between', 'near', 'next to',
    'get off', 'get on', 'look at', 'look for', 'wait for'
  ],
  
  noun_meaning: [
    // Common nouns (選択肢4つ全て名詞)
    'idea', 'body', 'city', 'word', 'name', 'place', 'time', 'way',
    'school', 'class', 'teacher', 'student', 'friend', 'family',
    'house', 'room', 'door', 'window', 'table', 'chair',
    'book', 'pen', 'paper', 'computer', 'phone', 'camera',
    'food', 'water', 'coffee', 'tea', 'lunch', 'dinner',
    'day', 'week', 'month', 'year', 'morning', 'afternoon',
    'money', 'price', 'shop', 'store', 'market',
    'train', 'bus', 'car', 'bike', 'station', 'airport'
  ],
  
  // HIGH PRIORITY CATEGORIES
  verb_tense: [
    // Same verb in different forms (選択肢4つ同じ動詞の活用形)
    'talk/talks/talked/talking',
    'play/plays/played/playing',
    'study/studies/studied/studying',
    'go/goes/went/going',
    'do/does/did/doing',
    'have/has/had/having'
  ],
  
  modal_verb: [
    'can', 'will', 'shall', 'should', 'must', 'may', 'might', 'would', 'could'
  ],
  
  // MEDIUM PRIORITY
  wh_question: [
    'what', 'where', 'when', 'who', 'whom', 'whose', 'which', 'why', 'how'
  ],
  
  to_infinitive: [
    'to play', 'to go', 'to study', 'to read', 'to write', 'to do', 'to make',
    'want to', 'like to', 'decide to', 'plan to', 'try to', 'need to'
  ],
  
  gerund: [
    'enjoy playing', 'finish studying', 'stop talking', 'keep reading',
    'like swimming', 'love cooking'
  ],
  
  // LOW PRIORITY
  conjunction: [
    'because', 'when', 'if', 'but', 'and', 'or', 'so', 'although', 'while', 'before', 'after'
  ],
  
  conversation: [
    // Full sentence responses
    'Good luck', 'That\'s too bad', 'Sounds great', 'I\'m sorry', 
    'Thank you', 'You\'re welcome', 'Here you are', 'Excuse me'
  ],
  
  adjective_meaning: [
    'happy', 'sad', 'angry', 'excited', 'tired', 'busy', 'free',
    'big', 'small', 'long', 'short', 'tall', 'young', 'old',
    'good', 'bad', 'new', 'beautiful', 'nice', 'great'
  ],
  
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
   * ✅ 文法カテゴリーを回避すべきかチェック（実際の4級分布に基づく）
   */
  shouldAvoidCategory(sessionId: string, candidateCategory: GrammarCategory): boolean {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.category_history.length === 0) {
      return false;
    }
    
    const history = dist.category_history;
    const totalQuestions = history.length;
    
    // 1. 連続チェック（同じカテゴリーが2回連続したら回避）
    if (history.length >= CATEGORY_DIVERSITY_CONFIG.MAX_CONSECUTIVE) {
      const recent = history.slice(-CATEGORY_DIVERSITY_CONFIG.MAX_CONSECUTIVE);
      if (recent.every(cat => cat === candidateCategory)) {
        console.log(`[GrammarCategoryDiversity] 🚫 AVOID: "${candidateCategory}" appeared ${CATEGORY_DIVERSITY_CONFIG.MAX_CONSECUTIVE} times consecutively`);
        return true;
      }
    }
    
    // 2. 目標割合チェック（実際の4級分布に基づく）
    const categoryCount = dist.category_counts.get(candidateCategory) || 0;
    const currentPercentage = (categoryCount / totalQuestions) * 100;
    
    const target = CATEGORY_DIVERSITY_CONFIG.TARGET_DISTRIBUTION[candidateCategory];
    if (target && currentPercentage >= target.max) {
      console.log(`[GrammarCategoryDiversity] 🚫 AVOID: "${candidateCategory}" at ${currentPercentage.toFixed(1)}% (max ${target.max}%)`);
      return true;
    }
    
    // 3. ブラックリスト期間チェック（直近3問中2問以上なら回避）
    if (history.length >= CATEGORY_DIVERSITY_CONFIG.BLACKLIST_WINDOW) {
      const blacklistWindow = history.slice(-CATEGORY_DIVERSITY_CONFIG.BLACKLIST_WINDOW);
      const blacklistCount = blacklistWindow.filter(cat => cat === candidateCategory).length;
      
      if (blacklistCount >= 2) {
        console.log(`[GrammarCategoryDiversity] 🚫 AVOID: "${candidateCategory}" appeared ${blacklistCount}/${CATEGORY_DIVERSITY_CONFIG.BLACKLIST_WINDOW} in blacklist window`);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * ✅ 推奨カテゴリーを取得（不足しているカテゴリーを優先）
   */
  getRecommendedCategories(sessionId: string): GrammarCategory[] {
    const dist = this.distributions.get(sessionId);
    if (!dist || dist.category_history.length === 0) {
      // 初期は優先度の高いカテゴリーから
      return ['verb_meaning', 'preposition', 'noun_meaning', 'verb_tense', 'modal_verb'];
    }
    
    const totalQuestions = dist.category_history.length;
    const recommended: Array<{ category: GrammarCategory; priority: number }> = [];
    
    // 各カテゴリーの現在の割合を計算
    for (const [category, target] of Object.entries(CATEGORY_DIVERSITY_CONFIG.TARGET_DISTRIBUTION)) {
      const count = dist.category_counts.get(category as GrammarCategory) || 0;
      const currentPercentage = totalQuestions > 0 ? (count / totalQuestions) * 100 : 0;
      
      // 目標最小値に達していないカテゴリーを優先
      if (currentPercentage < target.min) {
        const deficit = target.min - currentPercentage;
        recommended.push({
          category: category as GrammarCategory,
          priority: deficit
        });
      }
    }
    
    // 不足度の高い順にソート
    recommended.sort((a, b) => b.priority - a.priority);
    
    return recommended.slice(0, 5).map(r => r.category);
  }
  
  /**
   * ✅ 質問文から文法カテゴリーを検出（実際の4級パターンに基づく）
   * 
   * 重要原則：選択肢4つが同じカテゴリー（品詞）かどうかを判定
   */
  detectGrammarCategory(questionText: string, choices: string[]): GrammarCategory {
    const text = questionText.toLowerCase();
    const choicesText = choices.join(' ').toLowerCase();
    const combined = `${text} ${choicesText}`;
    
    // デバッグ用
    console.log('[GrammarCategory Detection]', {
      question: text.slice(0, 50),
      choices: choices
    });
    
    // === PRIORITY 1: 前置詞問題（選択肢が全て前置詞） ===
    const prepositionMatches = choices.filter(c => 
      CATEGORY_KEYWORDS.preposition.some(prep => 
        c.toLowerCase().trim() === prep || c.toLowerCase().includes(prep)
      )
    );
    if (prepositionMatches.length >= 3) {
      console.log('  ✅ Detected: preposition (matches:', prepositionMatches.length, ')');
      return 'preposition';
    }
    
    // === PRIORITY 2: 疑問詞（文頭がwh-word） ===
    for (const keyword of CATEGORY_KEYWORDS.wh_question) {
      if (text.trim().startsWith(keyword)) {
        console.log('  ✅ Detected: wh_question (starts with:', keyword, ')');
        return 'wh_question';
      }
    }
    
    // === PRIORITY 3: 会話表現（選択肢が文） ===
    const conversationMatches = choices.filter(c => 
      c.includes('.') || c.includes('!') || 
      CATEGORY_KEYWORDS.conversation.some(phrase => c.toLowerCase().includes(phrase.toLowerCase()))
    );
    if (conversationMatches.length >= 2) {
      console.log('  ✅ Detected: conversation (sentence choices)');
      return 'conversation';
    }
    
    // === PRIORITY 4: 名詞問題（選択肢が全て名詞） ===
    const nounMatches = choices.filter(c => 
      CATEGORY_KEYWORDS.noun_meaning.some(noun => 
        c.toLowerCase().trim() === noun
      )
    );
    if (nounMatches.length >= 3) {
      console.log('  ✅ Detected: noun_meaning (matches:', nounMatches.length, ')');
      return 'noun_meaning';
    }
    
    // === PRIORITY 5: 形容詞問題（選択肢が全て形容詞） ===
    const adjectiveMatches = choices.filter(c => 
      CATEGORY_KEYWORDS.adjective_meaning.some(adj => 
        c.toLowerCase().trim() === adj
      )
    );
    if (adjectiveMatches.length >= 3) {
      console.log('  ✅ Detected: adjective_meaning (matches:', adjectiveMatches.length, ')');
      return 'adjective_meaning';
    }
    
    // === PRIORITY 6: 動詞の時制（同じ動詞の活用形4つ） ===
    // 例: talk/talks/talked/talking
    const firstChoice = choices[0]?.toLowerCase().replace(/ing$/, '').replace(/ed$/, '').replace(/s$/, '');
    if (firstChoice) {
      const sameRootVerbs = choices.filter(c => {
        const root = c.toLowerCase().replace(/ing$/, '').replace(/ed$/, '').replace(/s$/, '');
        return root === firstChoice || c.toLowerCase().startsWith(firstChoice);
      });
      if (sameRootVerbs.length >= 3) {
        console.log('  ✅ Detected: verb_tense (same root verb variations)');
        return 'verb_tense';
      }
    }
    
    // === PRIORITY 7: 助動詞（選択肢に助動詞が3つ以上） ===
    const modalMatches = choices.filter(c => 
      CATEGORY_KEYWORDS.modal_verb.some(modal => 
        c.toLowerCase().trim() === modal
      )
    );
    if (modalMatches.length >= 3) {
      console.log('  ✅ Detected: modal_verb (matches:', modalMatches.length, ')');
      return 'modal_verb';
    }
    
    // === PRIORITY 8: 接続詞 ===
    const conjunctionMatches = choices.filter(c => 
      CATEGORY_KEYWORDS.conjunction.some(conj => 
        c.toLowerCase().trim() === conj
      )
    );
    if (conjunctionMatches.length >= 2) {
      console.log('  ✅ Detected: conjunction');
      return 'conjunction';
    }
    
    // === PRIORITY 9: 不定詞 ===
    if (choicesText.includes('to ') || combined.includes('want to') || combined.includes('like to')) {
      console.log('  ✅ Detected: to_infinitive');
      return 'to_infinitive';
    }
    
    // === PRIORITY 10: 動名詞 ===
    if ((combined.includes('enjoy') || combined.includes('finish') || combined.includes('stop')) 
        && choicesText.includes('ing')) {
      console.log('  ✅ Detected: gerund');
      return 'gerund';
    }
    
    // === DEFAULT: 一般動詞の意味選択 ===
    const verbMatches = choices.filter(c => 
      CATEGORY_KEYWORDS.verb_meaning.some(verb => 
        c.toLowerCase().trim() === verb || c.toLowerCase().includes(verb)
      )
    );
    if (verbMatches.length >= 2) {
      console.log('  ✅ Detected: verb_meaning (different verbs)');
      return 'verb_meaning';
    }
    
    console.log('  ⚠️ Detected: other (no clear category)');
    return 'other';
  }
  
  /**
   * ✅ LLMプロンプトに文法カテゴリー分散の指示を追加
   * 実際の4級出題パターンに基づく詳細な指示
   */
  getCategoryDiversityInstruction(sessionId: string): string {
    const dist = this.distributions.get(sessionId);
    
    // 推奨カテゴリーを取得
    const recommended = this.getRecommendedCategories(sessionId);
    const recommendedLabels = recommended.map(cat => this.getCategoryLabel(cat));
    
    if (!dist || dist.category_history.length === 0) {
      return `
🎯 EIKEN GRADE 4 QUESTION PATTERN REQUIREMENT:
Based on actual Eiken exams, follow these category distributions:

PRIORITY CATEGORIES (Must include in every session):
1. ✅ Verb Meaning (20-27%): Choose from 4 DIFFERENT verbs
   Example: "Can you ____ me some money?" → Choices: give/ride/have/buy
   
2. ✅ Preposition/Phrasal Verbs (13-20%): All 4 choices are prepositions
   Example: "She didn't get ____ at her stop." → Choices: over/down/in/off
   
3. ✅ Noun Meaning (13-20%): All 4 choices are nouns
   Example: "It's a very big ____." → Choices: idea/body/city/word

4. ✅ Verb Tense (13-20%): SAME verb in 4 different forms
   Example: "Mom was ____ on the phone." → Choices: talk/talks/talked/talking

5. ✅ Modal Verbs (10-20%): All choices are modals
   Example: "____ I talk to Patty?" → Choices: Will/May/Did/Would

⚠️ IMPORTANT: Each question's 4 choices should be from the SAME category!
`;
    }
    
    const recentLabels = dist.category_history.slice(-5).map(cat => this.getCategoryLabel(cat));
    const totalQuestions = dist.category_history.length;
    
    // 各カテゴリーの現在の割合を計算
    const categoryStats = Array.from(dist.category_counts.entries())
      .map(([cat, count]) => {
        const percentage = (count / totalQuestions) * 100;
        const target = CATEGORY_DIVERSITY_CONFIG.TARGET_DISTRIBUTION[cat];
        const status = !target ? '⚪' : 
                      percentage >= target.max ? '🔴 AVOID' :
                      percentage < target.min ? '🟢 NEED MORE' : '🟡 OK';
        return {
          category: cat,
          label: this.getCategoryLabel(cat),
          count,
          percentage,
          status
        };
      })
      .sort((a, b) => b.count - a.count);
    
    const statsText = categoryStats
      .map(s => `  ${s.status} ${s.label}: ${s.count}問 (${s.percentage.toFixed(1)}%)`)
      .join('\n');
    
    const avoidCategories = categoryStats
      .filter(s => s.status.includes('AVOID'))
      .map(s => s.label);
    
    const neededCategories = categoryStats
      .filter(s => s.status.includes('NEED MORE'))
      .map(s => s.label);
    
    return `
🎯 EIKEN GRADE 4 DIVERSITY REQUIREMENT (Question ${totalQuestions + 1}):

Recent categories: [${recentLabels.join(', ')}]

Current Distribution:
${statsText}

🚫 AVOID these over-used categories:
${avoidCategories.length > 0 ? avoidCategories.join(', ') : 'None'}

✅ PRIORITIZE these needed categories:
${recommendedLabels.join(', ')}

📋 REMINDER - Question Pattern Rules:
• Preposition Q: All 4 choices = prepositions (in/on/at/off)
• Noun Q: All 4 choices = nouns (city/idea/place/word)
• Verb Meaning Q: 4 DIFFERENT verbs (give/take/make/have)
• Verb Tense Q: SAME verb in 4 forms (talk/talks/talked/talking)
• Modal Q: All modal verbs (can/will/should/must)

⚠️ Each question's 4 choices MUST be from the SAME category!
`;
  }
  
  /**
   * ✅ カテゴリーのラベルを取得（実際の4級パターンに基づく）
   */
  private getCategoryLabel(category: GrammarCategory): string {
    const labels: Record<GrammarCategory, string> = {
      // TOP PRIORITY
      verb_meaning: '一般動詞の意味 (give/take/make)',
      preposition: '前置詞・句動詞 (in/on/off)',
      noun_meaning: '名詞の意味 (city/idea/place)',
      
      // HIGH PRIORITY
      verb_tense: '動詞の時制 (talk/talks/talked)',
      modal_verb: '助動詞 (can/will/should)',
      
      // MEDIUM
      wh_question: '疑問詞 (what/where/when)',
      to_infinitive: '不定詞 (want to/like to)',
      gerund: '動名詞 (enjoy -ing)',
      
      // LOW
      conjunction: '接続詞 (because/when/if)',
      conversation: '会話表現 (Good luck)',
      adjective_meaning: '形容詞の意味 (happy/sad)',
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
