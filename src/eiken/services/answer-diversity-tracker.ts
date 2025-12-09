/**
 * Answer Diversity Tracker
 * 
 * 正解の多様性を確保するためのトラッカー
 * 最近生成された正解を記録し、偏りを防ぐ
 */

interface AnswerHistory {
  answer: string;
  timestamp: number;
  grade: string;
  session_id?: string;
}

const MAX_HISTORY_SIZE = 20; // 最大記録数
const DIVERSITY_WINDOW = 10; // 直近N問で多様性をチェック

/**
 * 正解履歴を管理するクラス（メモリ内保存）
 */
export class AnswerDiversityTracker {
  private history: AnswerHistory[] = [];

  /**
   * 新しい正解を記録
   */
  addAnswer(answer: string, grade: string, session_id?: string): void {
    this.history.push({
      answer: answer.toLowerCase().trim(),
      timestamp: Date.now(),
      grade,
      session_id
    });

    // 履歴が大きくなりすぎないよう制限
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history = this.history.slice(-MAX_HISTORY_SIZE);
    }
  }

  /**
   * 直近N問の正解の統計を取得
   */
  getRecentAnswerStats(grade: string, windowSize: number = DIVERSITY_WINDOW): {
    answers: string[];
    frequencies: Record<string, number>;
    mostCommon: string[];
    diversityScore: number; // 0-1: 1が最も多様
  } {
    // 同じ級の直近N問を取得
    const recentAnswers = this.history
      .filter(h => h.grade === grade)
      .slice(-windowSize)
      .map(h => h.answer);

    if (recentAnswers.length === 0) {
      return {
        answers: [],
        frequencies: {},
        mostCommon: [],
        diversityScore: 1.0
      };
    }

    // 頻度カウント
    const frequencies: Record<string, number> = {};
    recentAnswers.forEach(answer => {
      frequencies[answer] = (frequencies[answer] || 0) + 1;
    });

    // 最頻出の正解を特定
    const sortedByFreq = Object.entries(frequencies)
      .sort((a, b) => b[1] - a[1]);
    
    const maxFreq = sortedByFreq[0]?.[1] || 0;
    const mostCommon = sortedByFreq
      .filter(([_, freq]) => freq === maxFreq)
      .map(([answer, _]) => answer);

    // 多様性スコア（ユニーク数 / 総数）
    const uniqueCount = Object.keys(frequencies).length;
    const diversityScore = recentAnswers.length > 0 
      ? uniqueCount / recentAnswers.length 
      : 1.0;

    return {
      answers: recentAnswers,
      frequencies,
      mostCommon,
      diversityScore
    };
  }

  /**
   * LLMプロンプト用の多様性ガイダンスを生成
   */
  getDiversityGuidance(grade: string): string {
    const stats = this.getRecentAnswerStats(grade);

    if (stats.answers.length === 0) {
      return ''; // 履歴がない場合は指示なし
    }

    const { frequencies, mostCommon, diversityScore } = stats;

    // 多様性が低い場合（スコア < 0.5）に警告
    if (diversityScore < 0.5) {
      const freqList = Object.entries(frequencies)
        .map(([answer, count]) => `"${answer}" (${count}回)`)
        .join(', ');

      return `
## ⚠️ ANSWER DIVERSITY WARNING

Recent correct answers show LOW DIVERSITY (score: ${(diversityScore * 100).toFixed(0)}%):
${freqList}

**CRITICAL**: You MUST create a question with a DIFFERENT correct answer!
- Avoid using these recently overused answers: ${mostCommon.map(a => `"${a}"`).join(', ')}
- Test a DIFFERENT grammar point or vocabulary
- Ensure balanced distribution of answer types

Examples of diverse grammar points:
- Modal verbs: can, may, should, must, could, would
- Tenses: present simple, past simple, present perfect, future
- Question words: what, when, where, why, how, who
- Other forms: am/is/are, was/were, do/does, have/has, etc.

Choose a grammar point that creates a DIFFERENT correct answer from recent questions!
`;
    }

    // 多様性が中程度の場合（0.5 <= スコア < 0.7）は軽い注意
    if (diversityScore < 0.7 && mostCommon.length > 0) {
      return `
## 💡 DIVERSITY NOTE

Recent most common correct answer(s): ${mostCommon.map(a => `"${a}"`).join(', ')}
Try to test different grammar points to maintain variety.
`;
    }

    // 多様性が高い場合は特に指示なし
    return '';
  }

  /**
   * 履歴をクリア（テスト用）
   */
  clear(): void {
    this.history = [];
  }

  /**
   * 現在の履歴を取得（デバッグ用）
   */
  getHistory(): AnswerHistory[] {
    return [...this.history];
  }
}

// グローバルシングルトンインスタンス（メモリ内で共有）
let globalTracker: AnswerDiversityTracker | null = null;

/**
 * グローバルトラッカーインスタンスを取得
 */
export function getAnswerDiversityTracker(): AnswerDiversityTracker {
  if (!globalTracker) {
    globalTracker = new AnswerDiversityTracker();
  }
  return globalTracker;
}
