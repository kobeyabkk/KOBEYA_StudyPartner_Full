-- Validation Logs Table
-- Purpose: Track all validation attempts for monitoring and improvement

CREATE TABLE IF NOT EXISTS validation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  text TEXT NOT NULL,
  target_level TEXT NOT NULL CHECK(target_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  rule_result TEXT NOT NULL, -- JSON: {valid, violations, executionTime}
  llm_result TEXT, -- JSON: {valid, violations, executionTime, cost} (NULL if LLM not used)
  discrepancy INTEGER NOT NULL DEFAULT 0 CHECK(discrepancy IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_validation_logs_timestamp ON validation_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_validation_logs_level ON validation_logs(target_level);
CREATE INDEX IF NOT EXISTS idx_validation_logs_discrepancy ON validation_logs(discrepancy);
CREATE INDEX IF NOT EXISTS idx_validation_logs_created_at ON validation_logs(created_at);

-- Weekly report view
CREATE VIEW IF NOT EXISTS validation_stats_weekly AS
SELECT 
  target_level,
  COUNT(*) as total_validations,
  SUM(CASE WHEN json_extract(rule_result, '$.valid') = 1 THEN 1 ELSE 0 END) as rule_pass_count,
  SUM(CASE WHEN llm_result IS NOT NULL THEN 1 ELSE 0 END) as llm_call_count,
  SUM(discrepancy) as discrepancy_count,
  AVG(json_extract(rule_result, '$.executionTime')) as avg_rule_time_ms,
  AVG(CASE WHEN llm_result IS NOT NULL THEN json_extract(llm_result, '$.executionTime') ELSE NULL END) as avg_llm_time_ms,
  SUM(CASE WHEN llm_result IS NOT NULL THEN json_extract(llm_result, '$.cost') ELSE 0 END) as total_llm_cost
FROM validation_logs
WHERE created_at >= datetime('now', '-7 days')
GROUP BY target_level;
