-- ERC-8004 v1.0 (Jan 26 Update) - Add new feedback fields
-- feedbackIndex: Per-client index for feedback tracking
-- endpoint: Optional service endpoint reference

-- Add new feedback fields
ALTER TABLE agent_feedback ADD COLUMN feedback_index INTEGER;
ALTER TABLE agent_feedback ADD COLUMN endpoint TEXT;

-- Index for efficient feedback_index queries
CREATE INDEX IF NOT EXISTS idx_feedback_agent_index
  ON agent_feedback(agent_id, feedback_index);

-- Index for endpoint filtering
CREATE INDEX IF NOT EXISTS idx_feedback_endpoint
  ON agent_feedback(endpoint) WHERE endpoint IS NOT NULL;
