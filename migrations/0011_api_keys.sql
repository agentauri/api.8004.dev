-- Migration: 0011_api_keys.sql
-- Description: Individual API keys for tracking and per-user rate limits
-- Created: 2026-01-05

-- API Keys table
-- Uses SHA-256 hash for secure storage (never store raw keys)
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  -- SHA-256 hash of the API key (64 hex chars)
  key_hash TEXT NOT NULL UNIQUE,
  -- Human-readable name for the key
  name TEXT NOT NULL,
  -- Tier for rate limiting: anonymous (60), standard (300), premium (1000)
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('anonymous', 'standard', 'premium')),
  -- Rate limit in requests per minute (overrides tier default)
  rate_limit_rpm INTEGER DEFAULT NULL,
  -- Whether the key is enabled
  enabled INTEGER NOT NULL DEFAULT 1,
  -- Optional owner identifier (email, wallet address, etc.)
  owner TEXT,
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  last_used_at TEXT,
  -- Usage tracking
  usage_count INTEGER NOT NULL DEFAULT 0
);

-- Index for fast hash lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Index for listing by owner
CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner) WHERE owner IS NOT NULL;

-- Index for finding expired keys
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- API Key usage logs (for detailed tracking)
CREATE TABLE IF NOT EXISTS api_key_usage (
  id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for usage analytics
CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_time ON api_key_usage(key_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_endpoint ON api_key_usage(endpoint, timestamp);
