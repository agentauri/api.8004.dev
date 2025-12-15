-- 8004-backend Database Schema
-- Migration: 0003_performance_indexes
-- Description: Performance optimization indexes

-- ============================================================================
-- Additional indexes for query optimization
-- ============================================================================

-- Composite index for agent feedback lookups (agent_id + submitted_at)
-- Optimizes queries that filter by agent and order by submission time
CREATE INDEX IF NOT EXISTS idx_feedback_agent_submitted
  ON agent_feedback(agent_id, submitted_at DESC);

-- Composite index for classification queue (status + attempts)
-- Optimizes retry logic that finds failed jobs under max attempts
CREATE INDEX IF NOT EXISTS idx_queue_status_attempts
  ON classification_queue(status, attempts)
  WHERE status = 'failed';

-- Composite index for reputation queries (chain_id + average_score)
-- Optimizes filtering by chain and sorting by score
CREATE INDEX IF NOT EXISTS idx_reputation_chain_score
  ON agent_reputation(chain_id, average_score DESC);

-- Note: eas_uid already has UNIQUE constraint which creates implicit index
-- Note: Most single-column indexes already exist in migrations 0001 and 0002
