-- Migration: Add embedding version tracking
-- Purpose: Track which embedding format version each agent was indexed with
-- This enables selective re-embedding when the format changes (e.g., adding OASF data)

-- Add embedding_version column to track format version used for each agent's embedding
ALTER TABLE agent_sync_metadata ADD COLUMN embedding_version TEXT DEFAULT '1.0.0';

-- Create index for efficiently finding agents with outdated embedding versions
CREATE INDEX IF NOT EXISTS idx_sync_metadata_embedding_version
  ON agent_sync_metadata(embedding_version);

-- Mark all existing agents for re-embedding with the new format (v2.0.0 adds OASF)
-- This is commented out by default - uncomment and run separately to trigger mass re-embedding
-- UPDATE agent_sync_metadata SET needs_reembed = 1 WHERE embedding_version != '2.0.0' OR embedding_version IS NULL;
