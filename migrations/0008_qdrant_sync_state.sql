-- Migration: Qdrant Sync State Tracking
-- Purpose: Track synchronization state between D1 and Qdrant for the 15-minute cron sync

-- Global sync state - tracks last sync timestamps and counters
CREATE TABLE IF NOT EXISTS qdrant_sync_state (
  id TEXT PRIMARY KEY DEFAULT 'global',
  last_graph_sync TEXT,              -- ISO timestamp of last Graph -> Qdrant sync
  last_d1_sync TEXT,                 -- ISO timestamp of last D1 -> Qdrant sync (classifications/reputation)
  last_reconciliation TEXT,          -- ISO timestamp of last full reconciliation
  agents_synced INTEGER DEFAULT 0,   -- Total agents synced (cumulative)
  agents_deleted INTEGER DEFAULT 0,  -- Total agents deleted via reconciliation (cumulative)
  embeddings_generated INTEGER DEFAULT 0,  -- Total embeddings re-generated (cumulative)
  last_error TEXT,                   -- Last error message if any
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert initial global state row
INSERT OR IGNORE INTO qdrant_sync_state (id) VALUES ('global');

-- Per-agent sync metadata - tracks content hashes for selective re-embedding
CREATE TABLE IF NOT EXISTS agent_sync_metadata (
  agent_id TEXT PRIMARY KEY,         -- "chainId:tokenId" format
  content_hash TEXT NOT NULL,        -- SHA-256 hash of all payload fields (for detecting any change)
  embed_hash TEXT,                   -- SHA-256 hash of embedding source text (name+desc+tools+skills)
  graph_updated_at TEXT,             -- Last known update timestamp from Graph
  d1_classification_at TEXT,         -- When classification was last synced
  d1_reputation_at TEXT,             -- When reputation was last synced
  qdrant_synced_at TEXT,             -- When last synced to Qdrant
  needs_reembed INTEGER DEFAULT 0,   -- Flag: 1 if embedding source changed
  sync_status TEXT DEFAULT 'synced', -- 'synced', 'pending', 'error'
  last_error TEXT,                   -- Error message if sync_status = 'error'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for efficient sync queries
CREATE INDEX IF NOT EXISTS idx_sync_metadata_needs_reembed
  ON agent_sync_metadata(needs_reembed) WHERE needs_reembed = 1;

CREATE INDEX IF NOT EXISTS idx_sync_metadata_status
  ON agent_sync_metadata(sync_status) WHERE sync_status != 'synced';

CREATE INDEX IF NOT EXISTS idx_sync_metadata_qdrant_synced
  ON agent_sync_metadata(qdrant_synced_at);

-- Trigger to update updated_at on qdrant_sync_state
CREATE TRIGGER IF NOT EXISTS trg_qdrant_sync_state_updated_at
  AFTER UPDATE ON qdrant_sync_state
  FOR EACH ROW
  BEGIN
    UPDATE qdrant_sync_state SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

-- Trigger to update updated_at on agent_sync_metadata
CREATE TRIGGER IF NOT EXISTS trg_agent_sync_metadata_updated_at
  AFTER UPDATE ON agent_sync_metadata
  FOR EACH ROW
  BEGIN
    UPDATE agent_sync_metadata SET updated_at = datetime('now') WHERE agent_id = NEW.agent_id;
  END;
