/**
 * Vocabulary Failure Tracker
 * 
 * 動的禁止語リスト管理
 * 語彙違反を記録し、頻出する違反語を次回生成時のプロンプトに反映
 */

import type { EikenGrade } from '../types';
import type { VocabularyViolation } from '../types/vocabulary';

export class VocabularyFailureTracker {
  private static recentFailures: Map<EikenGrade, string[]> = new Map();
  
  /**
   * 語彙違反を記録
   * 
   * @param grade - 英検級
   * @param violations - 違反語リスト
   */
  static recordFailure(grade: EikenGrade, violations: VocabularyViolation[]) {
    const current = this.recentFailures.get(grade) || [];
    const newWords = violations
      .filter(v => v.severity === 'error')
      .map(v => v.word.toLowerCase());
    
    // 最新50件を保持（メモリ効率のため）
    const updated = [...current, ...newWords].slice(-50);
    this.recentFailures.set(grade, updated);
    
    console.log(`[VocabularyTracker] Recorded ${newWords.length} violations for ${grade}級 (total: ${updated.length})`);
  }
  
  /**
   * 頻出違反語トップNを取得
   * 
   * @param grade - 英検級
   * @param limit - 取得件数（デフォルト: 10）
   * @returns 頻出違反語リスト（頻度順）
   */
  static getTopViolations(grade: EikenGrade, limit: number = 10): string[] {
    const failures = this.recentFailures.get(grade) || [];
    
    if (failures.length === 0) {
      return [];
    }
    
    // 頻度カウント
    const frequency = failures.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // 頻度順にソート
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([word]) => word);
  }
  
  /**
   * 静的禁止語 + 動的禁止語の統合リスト
   * 
   * @param grade - 英検級
   * @returns 禁止語リスト（静的 + 動的）
   */
  static getForbiddenWords(grade: EikenGrade): string[] {
    // 静的禁止語リスト（級別）
    const staticWords: Record<string, string[]> = {
      'pre2': [
        // 学術動詞（Academic Verbs）
        'facilitate', 'demonstrate', 'implement', 'establish', 'acknowledge',
        'illustrate', 'analyze', 'examine', 'evaluate', 'comprise',
        'constitute', 'articulate', 'emphasize', 'initiate', 'manifest',
        
        // 抽象形容詞（Abstract Adjectives）
        'sophisticated', 'comprehensive', 'substantial', 'significant', 'considerable',
        'fundamental', 'essential', 'crucial', 'inevitable', 'remarkable',
        'prominent', 'profound', 'intricate', 'elaborate', 'inherent',
        
        // 形式的接続詞（Formal Connectors）
        'furthermore', 'moreover', 'nevertheless', 'consequently', 'hence',
        'whereas', 'thereby', 'thus', 'accordingly', 'notwithstanding',
        
        // C1/C2 高度語彙
        'numerous', 'acquire', 'proficiency', 'contemporary', 'multilingual',
        'predominantly', 'subsequently', 'ambiguous', 'innovative', 'endeavor',
        'pertinent', 'coherent', 'stringent', 'paradigm', 'proliferate'
      ],
      '2': [
        // Pre-2よりも許容的だが、一部は避ける
        'subsequently', 'predominantly', 'ambiguous', 'intricate', 'endeavor',
        'proliferate', 'paradigm', 'coherent', 'stringent'
      ],
      'pre1': [
        // より高度な学習者向けだが、過度に学術的な語彙は避ける
        'paradigm', 'proliferate', 'stringent', 'notwithstanding'
      ],
      '1': [
        // 最高レベルでも一部の過度に専門的な語彙は避ける
        'notwithstanding'
      ]
    };
    
    // 動的禁止語（最近の違反から学習）
    const dynamicWords = this.getTopViolations(grade, 10);
    
    // 級別の静的リストを取得（該当なければpre2をデフォルト）
    const gradeStatic = staticWords[grade] || staticWords['pre2'];
    
    // 重複除去して結合
    return Array.from(new Set([...gradeStatic, ...dynamicWords]));
  }
  
  /**
   * 特定の単語が禁止語リストに含まれるかチェック
   * 
   * @param word - チェックする単語
   * @param grade - 英検級
   * @returns true: 禁止語, false: 許容
   */
  static isForbidden(word: string, grade: EikenGrade): boolean {
    const forbiddenWords = this.getForbiddenWords(grade);
    return forbiddenWords.includes(word.toLowerCase());
  }
  
  /**
   * 統計情報を取得（デバッグ用）
   * 
   * @param grade - 英検級
   * @returns 統計情報
   */
  static getStats(grade: EikenGrade): {
    total_failures: number;
    unique_words: number;
    top_violations: Array<{ word: string; count: number }>;
  } {
    const failures = this.recentFailures.get(grade) || [];
    const frequency = failures.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topViolations = Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
    
    return {
      total_failures: failures.length,
      unique_words: Object.keys(frequency).length,
      top_violations: topViolations,
    };
  }
  
  /**
   * トラッカーをリセット（テスト用）
   */
  static reset(grade?: EikenGrade) {
    if (grade) {
      this.recentFailures.delete(grade);
    } else {
      this.recentFailures.clear();
    }
  }
}
