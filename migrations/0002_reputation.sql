-- 8004-backend Database Schema
-- Migration: 0002_reputation
-- Description: Reputation system tables for agent feedback and scores

-- ============================================================================
-- Agent Feedback Table
-- Stores individual feedback entries for agents (synced from EAS attestations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_feedback (
  -- Primary key (UUID)
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Agent identifier in format "chainId:tokenId"
  agent_id TEXT NOT NULL,

  -- Blockchain chain ID
  chain_id INTEGER NOT NULL,

  -- Feedback score (0-100)
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),

  -- JSON array of tags (e.g., ["reliable", "fast", "accurate"])
  tags TEXT NOT NULL DEFAULT '[]',

  -- Optional feedback context/comment
  context TEXT,

  -- URI to the EAS attestation or other verifiable source
  feedback_uri TEXT,

  -- Submitter address (wallet that submitted the feedback)
  submitter TEXT NOT NULL,

  -- EAS attestation UID (for deduplication during sync)
  eas_uid TEXT UNIQUE,

  -- ISO timestamp when feedback was submitted
  submitted_at TEXT NOT NULL,

  -- Record timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for looking up feedback by agent
CREATE INDEX IF NOT EXISTS idx_feedback_agent
  ON agent_feedback(agent_id);

-- Index for filtering by chain
CREATE INDEX IF NOT EXISTS idx_feedback_chain
  ON agent_feedback(chain_id);

-- Index for filtering by score
CREATE INDEX IF NOT EXISTS idx_feedback_score
  ON agent_feedback(score);

-- Index for filtering by submitter
CREATE INDEX IF NOT EXISTS idx_feedback_submitter
  ON agent_feedback(submitter);

-- Index for ordering by submission time
CREATE INDEX IF NOT EXISTS idx_feedback_submitted
  ON agent_feedback(submitted_at DESC);

-- ============================================================================
-- Agent Reputation Cache Table
-- Stores aggregated reputation scores (computed from feedback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_reputation (
  -- Primary key (UUID)
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Agent identifier in format "chainId:tokenId"
  agent_id TEXT NOT NULL UNIQUE,

  -- Blockchain chain ID
  chain_id INTEGER NOT NULL,

  -- Total number of feedback entries
  feedback_count INTEGER NOT NULL DEFAULT 0,

  -- Average score (0-100)
  average_score REAL NOT NULL DEFAULT 0 CHECK (average_score >= 0 AND average_score <= 100),

  -- Score distribution counts
  low_count INTEGER NOT NULL DEFAULT 0,    -- 0-33
  medium_count INTEGER NOT NULL DEFAULT 0, -- 34-66
  high_count INTEGER NOT NULL DEFAULT 0,   -- 67-100

  -- ISO timestamp of last reputation recalculation
  last_calculated_at TEXT NOT NULL,

  -- Record timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for filtering by chain
CREATE INDEX IF NOT EXISTS idx_reputation_chain
  ON agent_reputation(chain_id);

-- Index for filtering by average score
CREATE INDEX IF NOT EXISTS idx_reputation_score
  ON agent_reputation(average_score);

-- Index for filtering by feedback count
CREATE INDEX IF NOT EXISTS idx_reputation_count
  ON agent_reputation(feedback_count);

-- ============================================================================
-- EAS Sync State Table
-- Tracks synchronization state for EAS attestation indexer
-- ============================================================================

CREATE TABLE IF NOT EXISTS eas_sync_state (
  -- Primary key (chain ID as there's one sync state per chain)
  chain_id INTEGER PRIMARY KEY,

  -- Last processed block number
  last_block INTEGER NOT NULL DEFAULT 0,

  -- Last processed attestation timestamp
  last_timestamp TEXT,

  -- Number of attestations synced
  attestations_synced INTEGER NOT NULL DEFAULT 0,

  -- Last sync error message (if any)
  last_error TEXT,

  -- Record timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
