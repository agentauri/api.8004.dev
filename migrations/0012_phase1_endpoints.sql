-- Migration: 0012_phase1_endpoints
-- Description: Tables for Phase 1 endpoints (Leaderboard, Feedbacks, Trending)
-- Date: 2026-01-06

-- ============================================================================
-- Reputation History Table (for Trending API)
-- Stores daily snapshots of agent reputation for computing trends
-- ============================================================================

CREATE TABLE IF NOT EXISTS reputation_history (
  -- Primary key (UUID)
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Agent identifier in format "chainId:tokenId"
  agent_id TEXT NOT NULL,

  -- Blockchain chain ID
  chain_id INTEGER NOT NULL,

  -- Snapshot date (YYYY-MM-DD format for daily aggregation)
  snapshot_date TEXT NOT NULL,

  -- Reputation score at snapshot time (0-100)
  reputation_score REAL NOT NULL DEFAULT 0 CHECK (reputation_score >= 0 AND reputation_score <= 100),

  -- Feedback count at snapshot time
  feedback_count INTEGER NOT NULL DEFAULT 0,

  -- Record timestamp
  created_at TEXT DEFAULT (datetime('now')),

  -- Unique constraint: one snapshot per agent per day
  UNIQUE(agent_id, snapshot_date)
);

-- Index for efficient date range queries (trending calculation)
CREATE INDEX IF NOT EXISTS idx_reputation_history_date
  ON reputation_history(snapshot_date DESC);

-- Index for agent-specific trend queries
CREATE INDEX IF NOT EXISTS idx_reputation_history_agent
  ON reputation_history(agent_id, snapshot_date DESC);

-- Index for chain-specific queries
CREATE INDEX IF NOT EXISTS idx_reputation_history_chain
  ON reputation_history(chain_id, snapshot_date DESC);

-- Composite index for trending calculation (agent + recent dates)
CREATE INDEX IF NOT EXISTS idx_reputation_history_trending
  ON reputation_history(snapshot_date DESC, reputation_score DESC);

-- ============================================================================
-- Reputation Snapshot Sync State
-- Tracks when daily snapshots were last taken
-- ============================================================================

CREATE TABLE IF NOT EXISTS reputation_snapshot_state (
  -- Single row table, key is always 'global'
  key TEXT PRIMARY KEY DEFAULT 'global',

  -- Last snapshot date completed
  last_snapshot_date TEXT,

  -- Number of agents snapshotted
  agents_snapshotted INTEGER NOT NULL DEFAULT 0,

  -- Any errors from last run
  last_error TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert initial state
INSERT OR IGNORE INTO reputation_snapshot_state (key, last_snapshot_date, agents_snapshotted)
VALUES ('global', NULL, 0);
