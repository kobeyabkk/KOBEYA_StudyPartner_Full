/**
 * SuperMemo-2 (SM-2) Algorithm Implementation
 * 間隔反復学習の標準アルゴリズム
 * 
 * Reference: Piotr Wozniak, 1987
 * https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */

export interface SM2Review {
  quality: number;           // 0-5 (0=完全に忘れた, 5=完璧に記憶)
  responseTimeMs?: number;   // 反応時間（オプション）
}

export interface SM2Card {
  easinessFactor: number;    // 1.3-2.5
  intervalDays: number;      // 次回復習までの日数
  repetitions: number;       // 連続正解回数
  nextReviewDate: Date;      // 次回復習日
}

export class SM2Algorithm {
  
  // デフォルトパラメータ
  private static readonly DEFAULT_EASINESS = 2.5;
  private static readonly MIN_EASINESS = 1.3;
  private static readonly INITIAL_INTERVAL = 1.0; // 1日
  
  /**
   * 初期カード作成
   */
  public static createInitialCard(): SM2Card {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return {
      easinessFactor: this.DEFAULT_EASINESS,
      intervalDays: this.INITIAL_INTERVAL,
      repetitions: 0,
      nextReviewDate: tomorrow
    };
  }
  
  /**
   * SM-2アルゴリズムでカードを更新
   * 
   * @param card 現在のカード状態
   * @param review 復習結果
   * @param ageMultiplier 年齢調整係数 (小学生: 0.5-0.8, 成人: 1.0)
   * @returns 更新されたカード
   */
  public static updateCard(
    card: SM2Card,
    review: SM2Review,
    ageMultiplier: number = 1.0
  ): SM2Card {
    
    const quality = review.quality;
    
    // 1. Easiness Factor (EF) の更新
    let newEasinessFactor = card.easinessFactor + (
      0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );
    
    // EFは1.3未満にならない
    newEasinessFactor = Math.max(this.MIN_EASINESS, newEasinessFactor);
    
    // 2. 間隔と反復回数の更新
    let newInterval: number;
    let newRepetitions: number;
    
    if (quality < 3) {
      // 不正解: リセット
      newRepetitions = 0;
      newInterval = this.INITIAL_INTERVAL;
    } else {
      // 正解: 反復回数増加
      newRepetitions = card.repetitions + 1;
      
      if (newRepetitions === 1) {
        newInterval = this.INITIAL_INTERVAL; // 1日後
      } else if (newRepetitions === 2) {
        newInterval = 3; // 3日後
      } else {
        // 3回目以降: 前回の間隔 × EF
        newInterval = card.intervalDays * newEasinessFactor;
      }
      
      // 年齢調整（小学生は短め）
      newInterval *= ageMultiplier;
    }
    
    // 3. 次回復習日の計算
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + Math.ceil(newInterval));
    
    return {
      easinessFactor: newEasinessFactor,
      intervalDays: newInterval,
      repetitions: newRepetitions,
      nextReviewDate
    };
  }
  
  /**
   * 反応時間を考慮したQuality調整
   * 
   * 速く正解するほどQualityが高い
   */
  public static adjustQualityByResponseTime(
    baseQuality: number,
    responseTimeMs: number
  ): number {
    // ベンチマーク:
    // - 300ms以下: ネイティブレベル → +1
    // - 500ms以下: 流暢 → +0.5
    // - 1000ms以下: 中級 → 0
    // - 2000ms以下: 初級 → -0.5
    // - 2000ms超: 苦手 → -1
    
    let adjustment = 0;
    
    if (responseTimeMs <= 300) {
      adjustment = 1.0;
    } else if (responseTimeMs <= 500) {
      adjustment = 0.5;
    } else if (responseTimeMs <= 1000) {
      adjustment = 0;
    } else if (responseTimeMs <= 2000) {
      adjustment = -0.5;
    } else {
      adjustment = -1.0;
    }
    
    return Math.max(0, Math.min(5, baseQuality + adjustment));
  }
  
  /**
   * 年齢に基づく間隔調整係数
   */
  public static getAgeMultiplier(userAge?: number, eikenGrade?: string): number {
    // 年齢が不明の場合、英検級から推定
    if (!userAge && eikenGrade) {
      const gradeAge: Record<string, number> = {
        'grade-5': 10,  // 小学4-5年
        'grade-4': 11,  // 小学5-6年
        'grade-3': 13,  // 中学1-2年
        'grade-pre2': 15, // 中学3年〜高1
        'grade-2': 16,  // 高校生
        'grade-pre1': 18, // 高校生〜大学生
        'grade-1': 20   // 大学生〜成人
      };
      userAge = gradeAge[eikenGrade] || 15;
    }
    
    if (!userAge) return 1.0; // デフォルト
    
    // 年齢別調整
    if (userAge <= 12) {
      return 0.6; // 小学生: 間隔を短く
    } else if (userAge <= 15) {
      return 0.8; // 中学生: やや短く
    } else {
      return 1.0; // 高校生以上: 標準
    }
  }
  
  /**
   * 試験日までの残り日数を考慮した間隔調整
   */
  public static getExamDrivenMultiplier(daysUntilExam?: number): number {
    if (!daysUntilExam) return 1.0;
    
    if (daysUntilExam <= 7) {
      return 0.3; // 1週間前: 超短期集中
    } else if (daysUntilExam <= 30) {
      return 0.5; // 1ヶ月前: 短期集中
    } else if (daysUntilExam <= 60) {
      return 0.7; // 2ヶ月前: やや短め
    } else {
      return 1.0; // 通常モード
    }
  }
  
  /**
   * 今日復習すべき単語をフィルタリング
   */
  public static filterDueCards(cards: SM2Card[]): SM2Card[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return cards.filter(card => {
      const reviewDate = new Date(card.nextReviewDate);
      reviewDate.setHours(0, 0, 0, 0);
      return reviewDate <= today;
    });
  }
  
  /**
   * 習熟度レベル計算（0-10段階）
   */
  public static calculateMasteryLevel(card: SM2Card): number {
    // レベル判定基準:
    // 0: 未知 (repetitions = 0)
    // 1-2: 見たことある (repetitions = 1-2)
    // 3-4: 認識できる (repetitions = 3-4, interval < 7)
    // 5-6: 想起できる (repetitions >= 5, interval >= 7)
    // 7-8: 使える (repetitions >= 8, interval >= 30)
    // 9-10: 習得済み (repetitions >= 12, interval >= 60)
    
    const { repetitions, intervalDays, easinessFactor } = card;
    
    if (repetitions === 0) return 0;
    if (repetitions <= 2) return Math.min(2, repetitions);
    if (repetitions <= 4 && intervalDays < 7) return 3 + (repetitions - 3);
    if (repetitions <= 7 && intervalDays >= 7) return 5 + Math.min(1, (repetitions - 5) * 0.5);
    if (repetitions <= 11 && intervalDays >= 30) return 7 + Math.min(1, (repetitions - 8) * 0.33);
    if (repetitions >= 12 && intervalDays >= 60) return 9 + Math.min(1, (easinessFactor - 2.0) * 2);
    
    return Math.min(10, 5 + repetitions * 0.5);
  }
  
  /**
   * Quality値から日本語ラベルを取得
   */
  public static getQualityLabel(quality: number): string {
    const labels: Record<number, string> = {
      0: '完全に忘れた',
      1: 'ほぼ覚えていない',
      2: '思い出すのが大変',
      3: '少し考えれば思い出せる',
      4: 'すぐに思い出せる',
      5: '完璧に覚えている'
    };
    return labels[quality] || '不明';
  }
  
  /**
   * 次回復習までの日数から推奨復習時刻を計算
   */
  public static getRecommendedReviewTime(nextReviewDate: Date): string {
    const now = new Date();
    const diffTime = nextReviewDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return '今すぐ復習';
    } else if (diffDays === 0) {
      return '今日中に復習';
    } else if (diffDays === 1) {
      return '明日復習';
    } else if (diffDays <= 7) {
      return `${diffDays}日後に復習`;
    } else {
      return `${Math.ceil(diffDays / 7)}週間後に復習`;
    }
  }
  
  /**
   * デバッグ情報出力
   */
  public static debugCard(card: SM2Card): string {
    const masteryLevel = this.calculateMasteryLevel(card);
    const reviewTime = this.getRecommendedReviewTime(card.nextReviewDate);
    
    return `
      Repetitions: ${card.repetitions}
      Interval: ${card.intervalDays.toFixed(1)} days
      Easiness Factor: ${card.easinessFactor.toFixed(2)}
      Mastery Level: ${masteryLevel}/10
      Next Review: ${reviewTime}
    `.trim();
  }
}
