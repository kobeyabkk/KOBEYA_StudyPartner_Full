/**
 * EIKEN Monitoring Dashboard API Routes
 * 
 * Endpoints:
 * - GET /api/eiken/monitoring/metrics - Get metrics summary
 * - GET /api/eiken/monitoring/alerts - Get active alerts
 * - POST /api/eiken/monitoring/alerts/:id/acknowledge - Acknowledge an alert
 * - GET /api/eiken/monitoring/experiments - Get A/B test results
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { D1Database } from '@cloudflare/workers-types';
import { MonitoringService } from '../services/monitoring-service';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use('/*', cors());

/**
 * GET /api/eiken/monitoring/metrics
 * 
 * Get metrics summary for the last 24 hours
 * 
 * Query params:
 * - grade (optional): Filter by grade (3, 4, 5, pre-2, etc.)
 * - format (optional): Filter by format (grammar_fill, long_reading, etc.)
 */
app.get('/metrics', async (c) => {
  try {
    const { grade, format } = c.req.query();
    
    const monitoringService = new MonitoringService(c.env.DB);
    const metrics = await monitoringService.getMetricsSummary(grade, format);

    return c.json({
      success: true,
      data: metrics,
      meta: {
        timestamp: new Date().toISOString(),
        filters: { grade, format }
      }
    });

  } catch (error) {
    console.error('[Monitoring API] Get metrics failed:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/monitoring/alerts
 * 
 * Get active alerts
 */
app.get('/alerts', async (c) => {
  try {
    const monitoringService = new MonitoringService(c.env.DB);
    const alerts = await monitoringService.getActiveAlerts();

    return c.json({
      success: true,
      data: alerts,
      meta: {
        timestamp: new Date().toISOString(),
        count: alerts.length
      }
    });

  } catch (error) {
    console.error('[Monitoring API] Get alerts failed:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * POST /api/eiken/monitoring/alerts/:id/acknowledge
 * 
 * Acknowledge an alert
 */
app.post('/alerts/:id/acknowledge', async (c) => {
  try {
    const alertId = c.req.param('id');

    await c.env.DB
      .prepare(`
        UPDATE eiken_alert_events
        SET status = 'acknowledged', acknowledged_at = ?
        WHERE id = ? AND status = 'active'
      `)
      .bind(new Date().toISOString(), alertId)
      .run();

    return c.json({
      success: true,
      message: 'Alert acknowledged',
      data: { alertId }
    });

  } catch (error) {
    console.error('[Monitoring API] Acknowledge alert failed:', error);
    return c.json({
      success: false,
      error: 'Failed to acknowledge alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * POST /api/eiken/monitoring/alerts/:id/resolve
 * 
 * Resolve an alert
 */
app.post('/alerts/:id/resolve', async (c) => {
  try {
    const alertId = c.req.param('id');

    await c.env.DB
      .prepare(`
        UPDATE eiken_alert_events
        SET status = 'resolved', resolved_at = ?
        WHERE id = ?
      `)
      .bind(new Date().toISOString(), alertId)
      .run();

    return c.json({
      success: true,
      message: 'Alert resolved',
      data: { alertId }
    });

  } catch (error) {
    console.error('[Monitoring API] Resolve alert failed:', error);
    return c.json({
      success: false,
      error: 'Failed to resolve alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/monitoring/experiments
 * 
 * Get A/B test experiment results
 */
app.get('/experiments', async (c) => {
  try {
    const result = await c.env.DB
      .prepare(`
        SELECT * FROM eiken_experiment_results
        ORDER BY experiment_id, variant
      `)
      .all();

    return c.json({
      success: true,
      data: result.results || [],
      meta: {
        timestamp: new Date().toISOString(),
        count: result.results?.length || 0
      }
    });

  } catch (error) {
    console.error('[Monitoring API] Get experiments failed:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch experiments',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/monitoring/health
 * 
 * Get system health status
 */
app.get('/health', async (c) => {
  try {
    const result = await c.env.DB
      .prepare(`
        SELECT * FROM eiken_system_health
        ORDER BY timestamp DESC
        LIMIT 24
      `)
      .all();

    return c.json({
      success: true,
      data: result.results || [],
      meta: {
        timestamp: new Date().toISOString(),
        hours: result.results?.length || 0
      }
    });

  } catch (error) {
    console.error('[Monitoring API] Get health failed:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch system health',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/monitoring/stats
 * 
 * Get comprehensive statistics
 */
app.get('/stats', async (c) => {
  try {
    const { timeRange = '24h' } = c.req.query();
    
    // Calculate time filter
    let hoursBack = 24;
    if (timeRange === '1h') hoursBack = 1;
    else if (timeRange === '6h') hoursBack = 6;
    else if (timeRange === '7d') hoursBack = 24 * 7;
    else if (timeRange === '30d') hoursBack = 24 * 30;
    
    const timeFilter = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    // Get overall stats
    const overallStats = await c.env.DB
      .prepare(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) as validated,
          ROUND(AVG(generation_time_ms), 2) as avg_generation_time_ms,
          ROUND(AVG(vocabulary_score), 2) as avg_vocab_score,
          ROUND(AVG(copyright_score), 2) as avg_copyright_score,
          ROUND(AVG(topic_diversity_score), 2) as avg_topic_diversity,
          ROUND(AVG(verb_diversity_score), 2) as avg_verb_diversity,
          ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct,
          ROUND(100.0 * SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0), 2) as validation_rate_pct
        FROM eiken_generation_metrics
        WHERE created_at >= ?
      `)
      .bind(timeFilter)
      .first();

    // Get stats by grade
    const gradeStats = await c.env.DB
      .prepare(`
        SELECT 
          grade,
          COUNT(*) as total,
          ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct
        FROM eiken_generation_metrics
        WHERE created_at >= ?
        GROUP BY grade
        ORDER BY grade
      `)
      .bind(timeFilter)
      .all();

    // Get stats by format
    const formatStats = await c.env.DB
      .prepare(`
        SELECT 
          format,
          COUNT(*) as total,
          ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct
        FROM eiken_generation_metrics
        WHERE created_at >= ?
        GROUP BY format
        ORDER BY format
      `)
      .bind(timeFilter)
      .all();

    // Get error distribution
    const errorStats = await c.env.DB
      .prepare(`
        SELECT 
          error_type,
          COUNT(*) as count
        FROM eiken_generation_metrics
        WHERE created_at >= ? AND status = 'failed'
        GROUP BY error_type
        ORDER BY count DESC
        LIMIT 10
      `)
      .bind(timeFilter)
      .all();

    return c.json({
      success: true,
      data: {
        overall: overallStats,
        byGrade: gradeStats.results || [],
        byFormat: formatStats.results || [],
        errors: errorStats.results || []
      },
      meta: {
        timestamp: new Date().toISOString(),
        timeRange,
        hoursBack
      }
    });

  } catch (error) {
    console.error('[Monitoring API] Get stats failed:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
