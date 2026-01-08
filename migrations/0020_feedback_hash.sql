-- Migration: Add feedback_hash column for ERC-8004 v1.0 compliance
-- The feedbackHash is a KECCAK-256 commitment to feedback content
-- Stored as hex string (0x prefixed, 66 chars total)

-- Add feedback_hash column to agent_feedback table
ALTER TABLE agent_feedback ADD COLUMN feedback_hash TEXT;

-- Index for faster lookups by hash (useful for verification)
CREATE INDEX IF NOT EXISTS idx_feedback_hash
  ON agent_feedback(feedback_hash)
  WHERE feedback_hash IS NOT NULL;
