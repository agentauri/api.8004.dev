-- 8004-backend Database Schema
-- Migration: 0001_init
-- Description: Initial schema for OASF classifications and queue

-- ============================================================================
-- OASF Classifications Table
-- Stores the OASF skill and domain classifications for agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_classifications (
  -- Primary key (UUID)
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Agent identifier in format "chainId:tokenId"
  agent_id TEXT NOT NULL UNIQUE,

  -- Blockchain chain ID
  chain_id INTEGER NOT NULL,

  -- JSON array of skill classifications
  -- Format: [{"slug": "...", "confidence": 0.95, "reasoning": "..."}]
  skills TEXT NOT NULL,

  -- JSON array of domain classifications
  -- Format: [{"slug": "...", "confidence": 0.85, "reasoning": "..."}]
  domains TEXT NOT NULL,

  -- Overall confidence score (0-1)
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

  -- LLM model version used for classification
  model_version TEXT NOT NULL,

  -- ISO timestamp when the classification was performed
  classified_at TEXT NOT NULL,

  -- Record timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for filtering by chain
CREATE INDEX IF NOT EXISTS idx_classifications_chain
  ON agent_classifications(chain_id);

-- Index for filtering by confidence
CREATE INDEX IF NOT EXISTS idx_classifications_confidence
  ON agent_classifications(confidence);

-- Index for looking up by agent_id (already unique, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_classifications_agent
  ON agent_classifications(agent_id);

-- ============================================================================
-- Classification Queue Table
-- Tracks classification jobs for async processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS classification_queue (
  -- Primary key (UUID)
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Agent identifier in format "chainId:tokenId"
  agent_id TEXT NOT NULL,

  -- Job status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Number of processing attempts
  attempts INTEGER DEFAULT 0,

  -- Error message if failed
  error TEXT,

  -- Record timestamps
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

-- Index for filtering by status (for job pickup)
CREATE INDEX IF NOT EXISTS idx_queue_status
  ON classification_queue(status);

-- Index for looking up by agent
CREATE INDEX IF NOT EXISTS idx_queue_agent
  ON classification_queue(agent_id);

-- Index for ordering pending jobs
CREATE INDEX IF NOT EXISTS idx_queue_pending_created
  ON classification_queue(status, created_at)
  WHERE status = 'pending';
