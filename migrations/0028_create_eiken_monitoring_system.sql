-- Migration: 0028_create_eiken_monitoring_system.sql
-- Description: Create monitoring and dashboard tables for EIKEN question generation
-- Created: 2026-01-23
-- 
-- Purpose: Track generation metrics, quality scores, and enable A/B testing

-- ============================================================================
-- 1. Generation Metrics Table
-- ============================================================================
-- Tracks every question generation attempt with detailed metrics
CREATE TABLE IF NOT EXISTS eiken_generation_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Request Info
  request_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  session_id TEXT,
  
  -- Question Info
  grade TEXT NOT NULL,
  format TEXT NOT NULL,
  topic_code TEXT,
  blueprint_id TEXT,
  
  -- Generation Results
  status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'validation_failed')),
  generation_time_ms INTEGER,
  model_used TEXT,
  
  -- Quality Metrics
  validation_passed INTEGER DEFAULT 0, -- 0 or 1
  vocabulary_score REAL,
  copyright_score REAL,
  
  -- Phase 7 Metrics
  same_verb_check INTEGER DEFAULT 0, -- Phase 7.6
  time_marker_check INTEGER DEFAULT 0, -- Phase 7.6
  topic_diversity_score REAL, -- Phase 7.7
  verb_diversity_score REAL, -- Phase 7.7
  tense_distribution TEXT, -- JSON: {"past": 0.3, "present": 0.5, "future": 0.2}
  
  -- Error Info
  error_type TEXT,
  error_message TEXT,
  
  -- A/B Testing
  experiment_id TEXT,
  variant TEXT,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (student_id) REFERENCES students(student_id)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_gen_metrics_student ON eiken_generation_metrics(student_id);
CREATE INDEX IF NOT EXISTS idx_gen_metrics_grade_format ON eiken_generation_metrics(grade, format);
CREATE INDEX IF NOT EXISTS idx_gen_metrics_status ON eiken_generation_metrics(status);
CREATE INDEX IF NOT EXISTS idx_gen_metrics_created ON eiken_generation_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_gen_metrics_experiment ON eiken_generation_metrics(experiment_id, variant);

-- ============================================================================
-- 2. Real-time Metrics Aggregation Table
-- ============================================================================
-- Hourly aggregated metrics for fast dashboard queries
CREATE TABLE IF NOT EXISTS eiken_metrics_hourly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Time Window
  hour_start DATETIME NOT NULL,
  hour_end DATETIME NOT NULL,
  
  -- Dimensions
  grade TEXT,
  format TEXT,
  
  -- Counts
  total_requests INTEGER DEFAULT 0,
  successful_generations INTEGER DEFAULT 0,
  failed_generations INTEGER DEFAULT 0,
  validation_failures INTEGER DEFAULT 0,
  
  -- Success Rates
  success_rate REAL, -- successful / total
  validation_pass_rate REAL, -- validation_passed / successful
  
  -- Average Metrics
  avg_generation_time_ms REAL,
  avg_vocabulary_score REAL,
  avg_copyright_score REAL,
  
  -- Phase 7 Metrics (Averages)
  avg_topic_diversity REAL,
  avg_verb_diversity REAL,
  avg_tense_balance_score REAL, -- How close to ideal distribution
  
  -- Quality Score (0-100)
  overall_quality_score REAL,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(hour_start, grade, format)
);

CREATE INDEX IF NOT EXISTS idx_metrics_hourly_time ON eiken_metrics_hourly(hour_start);
CREATE INDEX IF NOT EXISTS idx_metrics_hourly_grade ON eiken_metrics_hourly(grade, format);

-- ============================================================================
-- 3. Alert Configuration Table
-- ============================================================================
-- Configure thresholds for automated alerts
CREATE TABLE IF NOT EXISTS eiken_alert_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Alert Info
  alert_name TEXT NOT NULL UNIQUE,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('success_rate', 'validation_rate', 'generation_time', 'quality_score', 'error_rate')),
  
  -- Conditions
  threshold_value REAL NOT NULL,
  comparison TEXT NOT NULL CHECK(comparison IN ('less_than', 'greater_than', 'equals')),
  time_window_minutes INTEGER DEFAULT 60,
  
  -- Target
  grade TEXT, -- NULL means all grades
  format TEXT, -- NULL means all formats
  
  -- Status
  enabled INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default Alert Configurations
INSERT INTO eiken_alert_config (alert_name, alert_type, threshold_value, comparison, time_window_minutes) VALUES
('Low Success Rate', 'success_rate', 80.0, 'less_than', 60),
('Low Validation Rate', 'validation_rate', 90.0, 'less_than', 60),
('High Generation Time', 'generation_time', 10000, 'greater_than', 60),
('Low Quality Score', 'quality_score', 70.0, 'less_than', 60),
('High Error Rate', 'error_rate', 10.0, 'greater_than', 60);

-- ============================================================================
-- 4. Alert Events Table
-- ============================================================================
-- Log triggered alerts
CREATE TABLE IF NOT EXISTS eiken_alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Alert Info
  alert_config_id INTEGER NOT NULL,
  alert_name TEXT NOT NULL,
  
  -- Event Details
  metric_value REAL NOT NULL,
  threshold_value REAL NOT NULL,
  grade TEXT,
  format TEXT,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_at DATETIME,
  resolved_at DATETIME,
  
  -- Timestamps
  triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (alert_config_id) REFERENCES eiken_alert_config(id)
);

CREATE INDEX IF NOT EXISTS idx_alert_events_status ON eiken_alert_events(status);
CREATE INDEX IF NOT EXISTS idx_alert_events_triggered ON eiken_alert_events(triggered_at);

-- ============================================================================
-- 5. A/B Test Experiments Table
-- ============================================================================
-- Track A/B test experiments
CREATE TABLE IF NOT EXISTS eiken_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Experiment Info
  experiment_id TEXT NOT NULL UNIQUE,
  experiment_name TEXT NOT NULL,
  description TEXT,
  
  -- Configuration
  variants TEXT NOT NULL, -- JSON: [{"name": "control", "weight": 0.5}, {"name": "treatment", "weight": 0.5}]
  target_grade TEXT,
  target_format TEXT,
  
  -- Parameters being tested (JSON)
  parameters TEXT, -- e.g., {"temperature": {"control": 0.2, "treatment": 0.35}}
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'running', 'paused', 'completed')),
  
  -- Timestamps
  start_date DATETIME,
  end_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. System Health Table
-- ============================================================================
-- Track overall system health metrics
CREATE TABLE IF NOT EXISTS eiken_system_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Time Window
  timestamp DATETIME NOT NULL,
  
  -- Overall Metrics
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  
  -- Performance
  avg_response_time_ms REAL,
  p95_response_time_ms REAL,
  p99_response_time_ms REAL,
  
  -- Database
  db_query_count INTEGER DEFAULT 0,
  avg_db_query_time_ms REAL,
  
  -- External APIs
  openai_calls INTEGER DEFAULT 0,
  openai_errors INTEGER DEFAULT 0,
  openai_avg_time_ms REAL,
  
  -- Health Score (0-100)
  health_score REAL,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(timestamp)
);

CREATE INDEX IF NOT EXISTS idx_system_health_timestamp ON eiken_system_health(timestamp);

-- ============================================================================
-- 7. Views for Dashboard
-- ============================================================================

-- Last 24 hours summary
CREATE VIEW IF NOT EXISTS eiken_metrics_24h AS
SELECT 
  grade,
  format,
  COUNT(*) as total_requests,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) as validation_passed,
  ROUND(AVG(CASE WHEN status = 'success' THEN generation_time_ms ELSE NULL END), 2) as avg_gen_time_ms,
  ROUND(AVG(vocabulary_score), 2) as avg_vocab_score,
  ROUND(AVG(copyright_score), 2) as avg_copyright_score,
  ROUND(AVG(topic_diversity_score), 2) as avg_topic_diversity,
  ROUND(AVG(verb_diversity_score), 2) as avg_verb_diversity,
  ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct,
  ROUND(100.0 * SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0), 2) as validation_rate_pct
FROM eiken_generation_metrics
WHERE created_at >= datetime('now', '-24 hours')
GROUP BY grade, format;

-- Current alerts view
CREATE VIEW IF NOT EXISTS eiken_active_alerts AS
SELECT 
  ae.id,
  ae.alert_name,
  ac.alert_type,
  ae.metric_value,
  ae.threshold_value,
  ae.grade,
  ae.format,
  ae.triggered_at,
  ae.status
FROM eiken_alert_events ae
JOIN eiken_alert_config ac ON ae.alert_config_id = ac.id
WHERE ae.status = 'active'
ORDER BY ae.triggered_at DESC;

-- Experiment results view
CREATE VIEW IF NOT EXISTS eiken_experiment_results AS
SELECT 
  e.experiment_id,
  e.experiment_name,
  m.variant,
  COUNT(*) as sample_size,
  ROUND(AVG(CASE WHEN m.status = 'success' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate_pct,
  ROUND(AVG(CASE WHEN m.validation_passed = 1 THEN 1.0 ELSE 0.0 END) * 100, 2) as validation_rate_pct,
  ROUND(AVG(m.generation_time_ms), 2) as avg_gen_time_ms,
  ROUND(AVG(m.vocabulary_score), 2) as avg_vocab_score,
  ROUND(AVG(m.topic_diversity_score), 2) as avg_topic_diversity,
  ROUND(AVG(m.verb_diversity_score), 2) as avg_verb_diversity
FROM eiken_experiments e
JOIN eiken_generation_metrics m ON e.experiment_id = m.experiment_id
WHERE e.status = 'running'
GROUP BY e.experiment_id, e.experiment_name, m.variant;

-- Migration successful
SELECT 'Migration 0028: Successfully created EIKEN monitoring system' as status;
