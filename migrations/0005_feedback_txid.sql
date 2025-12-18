-- Migration: Add transaction hash field to agent_feedback
-- This field stores the transaction hash from EAS attestations

-- Add tx_id column to store the transaction hash
ALTER TABLE agent_feedback ADD COLUMN tx_id TEXT;

-- Create index for tx_id lookups
CREATE INDEX IF NOT EXISTS idx_agent_feedback_tx_id ON agent_feedback(tx_id);
