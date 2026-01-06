-- Migration: 0016_api_key_enhancements.sql
-- Description: Enhanced API key management with permissions, quotas, and rotation
-- Created: 2026-01-06

-- Add permissions column (JSON array of allowed operations)
-- Permissions: read, write, classify, evaluate, admin
ALTER TABLE api_keys ADD COLUMN permissions TEXT NOT NULL DEFAULT '["read"]';

-- Add daily/monthly quota limits
ALTER TABLE api_keys ADD COLUMN daily_quota INTEGER DEFAULT NULL;
ALTER TABLE api_keys ADD COLUMN monthly_quota INTEGER DEFAULT NULL;

-- Add current usage counters
ALTER TABLE api_keys ADD COLUMN daily_usage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN monthly_usage INTEGER NOT NULL DEFAULT 0;

-- Add quota reset timestamps
ALTER TABLE api_keys ADD COLUMN daily_reset_at TEXT DEFAULT (datetime('now', 'start of day', '+1 day'));
ALTER TABLE api_keys ADD COLUMN monthly_reset_at TEXT DEFAULT (datetime('now', 'start of month', '+1 month'));

-- Add rotation tracking
ALTER TABLE api_keys ADD COLUMN rotated_from TEXT DEFAULT NULL;
ALTER TABLE api_keys ADD COLUMN rotated_at TEXT DEFAULT NULL;

-- Add description for better key management
ALTER TABLE api_keys ADD COLUMN description TEXT DEFAULT NULL;

-- Create table for quota usage history
CREATE TABLE IF NOT EXISTS api_key_quota_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'monthly')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  usage_count INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for quota history lookup
CREATE INDEX IF NOT EXISTS idx_api_key_quota_history ON api_key_quota_history(key_id, period_type, period_start);
