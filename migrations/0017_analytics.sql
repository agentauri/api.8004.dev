-- Phase 4.3: Analytics
-- Migration: 0017_analytics.sql
-- Adds tables for platform analytics and metrics aggregation

-- Aggregated metrics table (hourly snapshots)
CREATE TABLE IF NOT EXISTS analytics_metrics (
  id TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('agents', 'search', 'classification', 'feedback', 'api_usage')),
  period TEXT NOT NULL CHECK (period IN ('hour', 'day', 'week', 'month')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  chain_id INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(metric_type, period, period_start, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_metrics_type ON analytics_metrics(metric_type, period);
CREATE INDEX IF NOT EXISTS idx_analytics_metrics_period ON analytics_metrics(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_metrics_chain ON analytics_metrics(chain_id, period_start DESC);

-- Search analytics (query patterns)
CREATE TABLE IF NOT EXISTS analytics_search (
  id TEXT PRIMARY KEY,
  query_hash TEXT NOT NULL,
  query_text TEXT,
  filters TEXT DEFAULT '{}',
  result_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  chain_ids TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_search_hash ON analytics_search(query_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_search_date ON analytics_search(created_at DESC);

-- Popular filters tracking
CREATE TABLE IF NOT EXISTS analytics_filters (
  id TEXT PRIMARY KEY,
  filter_name TEXT NOT NULL,
  filter_value TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 1,
  period TEXT NOT NULL CHECK (period IN ('day', 'week', 'month')),
  period_start TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(filter_name, filter_value, period, period_start)
);

CREATE INDEX IF NOT EXISTS idx_analytics_filters_name ON analytics_filters(filter_name, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_filters_period ON analytics_filters(period, period_start DESC);

-- API endpoint usage
CREATE TABLE IF NOT EXISTS analytics_api_usage (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER,
  api_key_id TEXT,
  period TEXT NOT NULL CHECK (period IN ('hour', 'day')),
  period_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(endpoint, method, status_code, api_key_id, period, period_start)
);

CREATE INDEX IF NOT EXISTS idx_analytics_api_endpoint ON analytics_api_usage(endpoint, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_api_key ON analytics_api_usage(api_key_id, period_start DESC);

-- Aggregation state tracking
CREATE TABLE IF NOT EXISTS analytics_aggregation_state (
  key TEXT PRIMARY KEY DEFAULT 'global',
  last_hourly_aggregation TEXT,
  last_daily_aggregation TEXT,
  last_weekly_aggregation TEXT,
  last_monthly_aggregation TEXT,
  status TEXT DEFAULT 'idle',
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert initial state
INSERT OR IGNORE INTO analytics_aggregation_state (key) VALUES ('global');
