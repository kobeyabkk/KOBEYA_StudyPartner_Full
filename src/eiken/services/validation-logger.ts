/**
 * Validation Logger
 * 
 * Purpose: Track all validation attempts for monitoring and continuous improvement
 * - Log rule-based results
 * - Log LLM results (when used)
 * - Detect discrepancies between rule-based and LLM
 * - Generate weekly reports
 */

import type { VocabularyViolation } from '../types/vocabulary';

export interface ValidationLog {
  timestamp: string;
  text: string;
  targetLevel: string;
  ruleResult: {
    valid: boolean;
    violations: VocabularyViolation[];
    executionTime: number;
  };
  llmResult?: {
    valid: boolean;
    violations: VocabularyViolation[];
    executionTime: number;
    cost: number;
  };
  discrepancy: boolean;
}

export interface WeeklyStats {
  target_level: string;
  total_validations: number;
  rule_pass_count: number;
  llm_call_count: number;
  discrepancy_count: number;
  avg_rule_time_ms: number;
  avg_llm_time_ms: number | null;
  total_llm_cost: number;
}

export class ValidationLogger {
  constructor(
    private db: D1Database,
    private analytics?: AnalyticsEngineDataset
  ) {}
  
  /**
   * Log a validation attempt
   */
  async log(log: ValidationLog): Promise<void> {
    try {
      // Store in D1 for detailed analysis
      await this.db.prepare(`
        INSERT INTO validation_logs 
        (timestamp, text, target_level, rule_result, llm_result, discrepancy)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        log.timestamp,
        log.text,
        log.targetLevel,
        JSON.stringify(log.ruleResult),
        log.llmResult ? JSON.stringify(log.llmResult) : null,
        log.discrepancy ? 1 : 0
      ).run();
      
      // Send metrics to Analytics Engine (if available)
      if (this.analytics) {
        await this.analytics.writeDataPoint({
          blobs: ['validation', log.targetLevel],
          doubles: [
            log.ruleResult.valid ? 1 : 0,
            log.llmResult?.valid ? 1 : 0,
            log.discrepancy ? 1 : 0,
            log.ruleResult.executionTime,
            log.llmResult?.executionTime || 0,
            log.llmResult?.cost || 0
          ],
          indexes: [log.timestamp]
        });
      }
    } catch (error) {
      // Logging should never break the main flow
      console.error('Failed to log validation:', error);
    }
  }
  
  /**
   * Get weekly statistics
   */
  async getWeeklyStats(): Promise<WeeklyStats[]> {
    const result = await this.db.prepare(`
      SELECT * FROM validation_stats_weekly
    `).all<WeeklyStats>();
    
    return result.results || [];
  }
  
  /**
   * Generate weekly report
   */
  async generateWeeklyReport(): Promise<string> {
    const stats = await this.getWeeklyStats();
    
    if (stats.length === 0) {
      return `
# 週次バリデーションレポート

データがありません。
      `.trim();
    }
    
    const totalValidations = stats.reduce((sum, s) => sum + s.total_validations, 0);
    const totalLLMCalls = stats.reduce((sum, s) => sum + s.llm_call_count, 0);
    const totalDiscrepancies = stats.reduce((sum, s) => sum + s.discrepancy_count, 0);
    const totalCost = stats.reduce((sum, s) => sum + s.total_llm_cost, 0);
    
    const report = `
# 週次バリデーションレポート

**期間**: 過去7日間
**生成日時**: ${new Date().toISOString()}

---

## 📊 全体サマリー

- **総検証数**: ${totalValidations.toLocaleString()}
- **LLM呼び出し数**: ${totalLLMCalls.toLocaleString()} (${((totalLLMCalls / totalValidations) * 100).toFixed(2)}%)
- **判定不一致**: ${totalDiscrepancies}件
- **LLM総コスト**: $${totalCost.toFixed(4)}

---

## 📈 レベル別詳細

${stats.map(s => {
  const rulePassRate = (s.rule_pass_count / s.total_validations * 100).toFixed(1);
  const llmCallRate = (s.llm_call_count / s.total_validations * 100).toFixed(1);
  const avgCostPerCall = s.llm_call_count > 0 ? (s.total_llm_cost / s.llm_call_count) : 0;
  
  return `
### ${s.target_level}

- 検証数: ${s.total_validations.toLocaleString()}
- ルールベース合格率: **${rulePassRate}%**
- LLM呼び出し率: ${llmCallRate}%
- 判定不一致: ${s.discrepancy_count}件
- 平均処理時間:
  - ルールベース: ${s.avg_rule_time_ms.toFixed(0)}ms
  - LLM: ${s.avg_llm_time_ms ? s.avg_llm_time_ms.toFixed(0) + 'ms' : 'N/A'}
- LLMコスト: $${s.total_llm_cost.toFixed(4)} (平均: $${avgCostPerCall.toFixed(6)}/回)
  `;
}).join('\n')}

---

## 🎯 推奨アクション

${this.getRecommendation(stats, totalValidations, totalLLMCalls, totalDiscrepancies)}

---

## 💡 メトリクス解説

- **ルールベース合格率**: ルールベースだけで正常と判定された割合（目標: >95%)
- **LLM呼び出し率**: LLMによる再検証が必要だった割合（目標: <5%)
- **判定不一致**: ルールとLLMで判定が異なったケース（要調査）

---

*このレポートは自動生成されています*
    `.trim();
    
    return report;
  }
  
  /**
   * Generate recommendations based on stats
   */
  private getRecommendation(
    stats: WeeklyStats[],
    totalValidations: number,
    totalLLMCalls: number,
    totalDiscrepancies: number
  ): string {
    const recommendations: string[] = [];
    
    // Check LLM call rate
    const llmCallRate = totalLLMCalls / totalValidations;
    if (llmCallRate > 0.10) {
      recommendations.push('⚠️ **LLM呼び出し率が10%を超えています**。ルールベースの改善を検討してください。');
    } else if (llmCallRate < 0.02) {
      recommendations.push('✅ LLM呼び出し率が非常に低く、効率的です。');
    } else {
      recommendations.push('✅ LLM呼び出し率は適切な範囲内です。');
    }
    
    // Check discrepancies
    if (totalDiscrepancies > 50) {
      recommendations.push('⚠️ **判定不一致が多発しています**（50件以上）。LLMプロンプトの調整が必要です。');
    } else if (totalDiscrepancies > 20) {
      recommendations.push('⚠️ 判定不一致がやや多めです（20-50件）。主要なケースを調査してください。');
    } else if (totalDiscrepancies > 0) {
      recommendations.push('✅ 判定不一致は少数です。定期的な確認で問題ありません。');
    } else {
      recommendations.push('🎉 判定不一致がゼロです！完璧な一致率を達成しています。');
    }
    
    // Check per-level performance
    for (const s of stats) {
      const rulePassRate = s.rule_pass_count / s.total_validations;
      if (rulePassRate < 0.90) {
        recommendations.push(`⚠️ **${s.target_level}レベルのルールベース合格率が90%未満**です。このレベルのルール強化を検討してください。`);
      }
    }
    
    // Overall assessment
    if (recommendations.filter(r => r.startsWith('⚠️')).length === 0) {
      recommendations.push('\n🎊 **総合評価: 優秀**\nシステムは正常に動作しています。現在の設定を維持してください。');
    } else if (recommendations.filter(r => r.startsWith('⚠️')).length <= 2) {
      recommendations.push('\n📊 **総合評価: 良好**\n一部改善の余地がありますが、概ね順調です。');
    } else {
      recommendations.push('\n📈 **総合評価: 要改善**\n複数の問題が検出されています。優先的に対応してください。');
    }
    
    return recommendations.join('\n\n');
  }
  
  /**
   * Get discrepancy cases for analysis
   */
  async getDiscrepancyCases(limit: number = 10): Promise<ValidationLog[]> {
    const result = await this.db.prepare(`
      SELECT 
        timestamp,
        text,
        target_level as targetLevel,
        rule_result as ruleResult,
        llm_result as llmResult,
        discrepancy
      FROM validation_logs
      WHERE discrepancy = 1
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(limit).all();
    
    return (result.results || []).map(row => ({
      timestamp: row.timestamp as string,
      text: row.text as string,
      targetLevel: row.targetLevel as string,
      ruleResult: JSON.parse(row.ruleResult as string),
      llmResult: row.llmResult ? JSON.parse(row.llmResult as string) : undefined,
      discrepancy: row.discrepancy === 1
    }));
  }
  
  /**
   * Clean old logs (older than 90 days)
   */
  async cleanOldLogs(): Promise<number> {
    const result = await this.db.prepare(`
      DELETE FROM validation_logs
      WHERE created_at < datetime('now', '-90 days')
    `).run();
    
    return result.meta.changes;
  }
}
