/**
 * EIKEN Monitoring Service
 * 
 * Purpose: Collect and track metrics for question generation
 * Features:
 * - Real-time metrics collection
 * - Automatic aggregation
 * - Alert detection
 * - A/B test tracking
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface GenerationMetric {
  requestId: string;
  studentId: string;
  sessionId?: string;
  
  grade: string;
  format: string;
  topicCode?: string;
  blueprintId?: string;
  
  status: 'success' | 'failed' | 'validation_failed';
  generationTimeMs: number;
  modelUsed: string;
  
  validationPassed?: boolean;
  vocabularyScore?: number;
  copyrightScore?: number;
  
  // Phase 7 Metrics
  sameVerbCheck?: boolean;
  timeMarkerCheck?: boolean;
  topicDiversityScore?: number;
  verbDiversityScore?: number;
  tenseDistribution?: {
    past: number;
    present: number;
    future: number;
  };
  
  errorType?: string;
  errorMessage?: string;
  
  experimentId?: string;
  variant?: string;
}

export interface MetricsSummary {
  grade: string;
  format: string;
  totalRequests: number;
  successful: number;
  failed: number;
  validationPassed: number;
  avgGenerationTimeMs: number;
  avgVocabScore: number;
  avgCopyrightScore: number;
  avgTopicDiversity: number;
  avgVerbDiversity: number;
  successRatePct: number;
  validationRatePct: number;
}

export interface AlertConfig {
  alertName: string;
  alertType: 'success_rate' | 'validation_rate' | 'generation_time' | 'quality_score' | 'error_rate';
  thresholdValue: number;
  comparison: 'less_than' | 'greater_than' | 'equals';
  timeWindowMinutes: number;
  grade?: string;
  format?: string;
}

export interface AlertEvent {
  alertName: string;
  metricValue: number;
  thresholdValue: number;
  grade?: string;
  format?: string;
}

export class MonitoringService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Log a generation metric
   */
  async logMetric(metric: GenerationMetric): Promise<void> {
    try {
      const tenseDistJson = metric.tenseDistribution 
        ? JSON.stringify(metric.tenseDistribution) 
        : null;

      await this.db
        .prepare(`
          INSERT INTO eiken_generation_metrics (
            request_id, student_id, session_id,
            grade, format, topic_code, blueprint_id,
            status, generation_time_ms, model_used,
            validation_passed, vocabulary_score, copyright_score,
            same_verb_check, time_marker_check,
            topic_diversity_score, verb_diversity_score, tense_distribution,
            error_type, error_message,
            experiment_id, variant
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          metric.requestId,
          metric.studentId,
          metric.sessionId || null,
          metric.grade,
          metric.format,
          metric.topicCode || null,
          metric.blueprintId || null,
          metric.status,
          metric.generationTimeMs,
          metric.modelUsed,
          metric.validationPassed ? 1 : 0,
          metric.vocabularyScore || null,
          metric.copyrightScore || null,
          metric.sameVerbCheck ? 1 : 0,
          metric.timeMarkerCheck ? 1 : 0,
          metric.topicDiversityScore || null,
          metric.verbDiversityScore || null,
          tenseDistJson,
          metric.errorType || null,
          metric.errorMessage || null,
          metric.experimentId || null,
          metric.variant || null
        )
        .run();

      // Check for alerts (non-blocking)
      this.checkAlerts(metric).catch(err => {
        console.error('[Monitoring] Alert check failed:', err);
      });

    } catch (error) {
      console.error('[Monitoring] Failed to log metric:', error);
      // Don't throw - monitoring should never break the main flow
    }
  }

  /**
   * Get metrics summary for the last 24 hours
   */
  async getMetricsSummary(grade?: string, format?: string): Promise<MetricsSummary[]> {
    try {
      let query = `
        SELECT * FROM eiken_metrics_24h
        WHERE 1=1
      `;
      const bindings: any[] = [];

      if (grade) {
        query += ` AND grade = ?`;
        bindings.push(grade);
      }

      if (format) {
        query += ` AND format = ?`;
        bindings.push(format);
      }

      const result = await this.db.prepare(query).bind(...bindings).all();

      return (result.results || []).map((row: any) => ({
        grade: row.grade,
        format: row.format,
        totalRequests: row.total_requests,
        successful: row.successful,
        failed: row.failed,
        validationPassed: row.validation_passed,
        avgGenerationTimeMs: row.avg_gen_time_ms,
        avgVocabScore: row.avg_vocab_score,
        avgCopyrightScore: row.avg_copyright_score,
        avgTopicDiversity: row.avg_topic_diversity,
        avgVerbDiversity: row.avg_verb_diversity,
        successRatePct: row.success_rate_pct,
        validationRatePct: row.validation_rate_pct,
      }));

    } catch (error) {
      console.error('[Monitoring] Failed to get metrics summary:', error);
      return [];
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<AlertEvent[]> {
    try {
      const result = await this.db
        .prepare(`
          SELECT 
            alert_name,
            metric_value,
            threshold_value,
            grade,
            format,
            triggered_at
          FROM eiken_active_alerts
          ORDER BY triggered_at DESC
          LIMIT 20
        `)
        .all();

      return (result.results || []).map((row: any) => ({
        alertName: row.alert_name,
        metricValue: row.metric_value,
        thresholdValue: row.threshold_value,
        grade: row.grade,
        format: row.format,
        triggeredAt: row.triggered_at,
      }));

    } catch (error) {
      console.error('[Monitoring] Failed to get active alerts:', error);
      return [];
    }
  }

  /**
   * Check if any alerts should be triggered
   */
  private async checkAlerts(metric: GenerationMetric): Promise<void> {
    try {
      // Get all enabled alert configs
      const configs = await this.db
        .prepare(`
          SELECT * FROM eiken_alert_config
          WHERE enabled = 1
          AND (grade IS NULL OR grade = ?)
          AND (format IS NULL OR format = ?)
        `)
        .bind(metric.grade, metric.format)
        .all();

      for (const config of configs.results || []) {
        await this.evaluateAlert(config as any, metric);
      }

    } catch (error) {
      console.error('[Monitoring] Alert check failed:', error);
    }
  }

  /**
   * Evaluate a single alert condition
   */
  private async evaluateAlert(config: any, metric: GenerationMetric): Promise<void> {
    const timeWindowMinutes = config.time_window_minutes || 60;
    
    // Get metrics for the time window
    const windowStart = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();
    
    const result = await this.db
      .prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) as validated,
          AVG(generation_time_ms) as avg_time,
          AVG((vocabulary_score + copyright_score) / 2) as avg_quality
        FROM eiken_generation_metrics
        WHERE created_at >= ?
        AND grade = ?
        AND format = ?
      `)
      .bind(windowStart, metric.grade, metric.format)
      .first();

    if (!result || !result.total) return;

    let metricValue: number = 0;
    let shouldTrigger = false;

    // Calculate metric based on alert type
    switch (config.alert_type) {
      case 'success_rate':
        metricValue = (result.successful / result.total) * 100;
        break;
      case 'validation_rate':
        metricValue = result.successful > 0 
          ? (result.validated / result.successful) * 100 
          : 0;
        break;
      case 'generation_time':
        metricValue = result.avg_time;
        break;
      case 'quality_score':
        metricValue = result.avg_quality || 0;
        break;
      case 'error_rate':
        metricValue = ((result.total - result.successful) / result.total) * 100;
        break;
    }

    // Check threshold
    switch (config.comparison) {
      case 'less_than':
        shouldTrigger = metricValue < config.threshold_value;
        break;
      case 'greater_than':
        shouldTrigger = metricValue > config.threshold_value;
        break;
      case 'equals':
        shouldTrigger = Math.abs(metricValue - config.threshold_value) < 0.01;
        break;
    }

    if (shouldTrigger) {
      await this.triggerAlert(config, metricValue, metric.grade, metric.format);
    }
  }

  /**
   * Trigger an alert event
   */
  private async triggerAlert(
    config: any,
    metricValue: number,
    grade: string,
    format: string
  ): Promise<void> {
    try {
      // Check if alert is already active
      const existing = await this.db
        .prepare(`
          SELECT id FROM eiken_alert_events
          WHERE alert_config_id = ?
          AND status = 'active'
          AND grade = ?
          AND format = ?
        `)
        .bind(config.id, grade, format)
        .first();

      if (existing) {
        // Alert already active
        return;
      }

      // Create new alert event
      await this.db
        .prepare(`
          INSERT INTO eiken_alert_events (
            alert_config_id, alert_name,
            metric_value, threshold_value,
            grade, format
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
          config.id,
          config.alert_name,
          metricValue,
          config.threshold_value,
          grade,
          format
        )
        .run();

      console.warn(`[Monitoring] ALERT TRIGGERED: ${config.alert_name}`, {
        metricValue,
        threshold: config.threshold_value,
        grade,
        format
      });

    } catch (error) {
      console.error('[Monitoring] Failed to trigger alert:', error);
    }
  }

  /**
   * Aggregate metrics hourly (should be called by a cron job)
   */
  async aggregateHourlyMetrics(): Promise<void> {
    try {
      const hourStart = new Date();
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const result = await this.db
        .prepare(`
          INSERT OR REPLACE INTO eiken_metrics_hourly (
            hour_start, hour_end, grade, format,
            total_requests, successful_generations, failed_generations, validation_failures,
            success_rate, validation_pass_rate,
            avg_generation_time_ms, avg_vocabulary_score, avg_copyright_score,
            avg_topic_diversity, avg_verb_diversity
          )
          SELECT 
            ? as hour_start,
            ? as hour_end,
            grade,
            format,
            COUNT(*) as total_requests,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_generations,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_generations,
            SUM(CASE WHEN status = 'validation_failed' THEN 1 ELSE 0 END) as validation_failures,
            ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
            ROUND(100.0 * SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0), 2) as validation_pass_rate,
            ROUND(AVG(generation_time_ms), 2) as avg_generation_time_ms,
            ROUND(AVG(vocabulary_score), 2) as avg_vocabulary_score,
            ROUND(AVG(copyright_score), 2) as avg_copyright_score,
            ROUND(AVG(topic_diversity_score), 2) as avg_topic_diversity,
            ROUND(AVG(verb_diversity_score), 2) as avg_verb_diversity
          FROM eiken_generation_metrics
          WHERE created_at >= ? AND created_at < ?
          GROUP BY grade, format
        `)
        .bind(
          hourStart.toISOString(),
          hourEnd.toISOString(),
          hourStart.toISOString(),
          hourEnd.toISOString()
        )
        .run();

      console.log(`[Monitoring] Aggregated hourly metrics for ${hourStart.toISOString()}`);

    } catch (error) {
      console.error('[Monitoring] Failed to aggregate hourly metrics:', error);
    }
  }
}
