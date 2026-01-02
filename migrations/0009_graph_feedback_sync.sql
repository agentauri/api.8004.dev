-- Migration: Graph Feedback Sync State
-- Purpose: Add columns to qdrant_sync_state for tracking Graph feedback synchronization

-- Add columns for Graph feedback sync tracking
ALTER TABLE qdrant_sync_state ADD COLUMN last_graph_feedback_sync TEXT;
ALTER TABLE qdrant_sync_state ADD COLUMN last_feedback_created_at TEXT;
ALTER TABLE qdrant_sync_state ADD COLUMN feedback_synced INTEGER DEFAULT 0;

-- Create index on eas_uid for faster deduplication lookups
-- (eas_uid is already UNIQUE but explicit index helps with prefix queries like "graph:%")
CREATE INDEX IF NOT EXISTS idx_agent_feedback_eas_uid
  ON agent_feedback(eas_uid) WHERE eas_uid IS NOT NULL;
