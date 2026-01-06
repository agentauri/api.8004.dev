-- Phase 2.1: Evaluations Queue for async processing
-- Adds status tracking to evaluations and creates a queue table

-- Add status column to agent_evaluations
ALTER TABLE agent_evaluations ADD COLUMN status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- Create evaluation queue table
CREATE TABLE IF NOT EXISTS evaluation_queue (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  skills TEXT DEFAULT '[]',
  error TEXT,
  evaluation_id TEXT,
  requested_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (evaluation_id) REFERENCES agent_evaluations(id) ON DELETE SET NULL
);

-- Index for finding pending jobs
CREATE INDEX IF NOT EXISTS idx_evaluation_queue_status ON evaluation_queue(status);

-- Index for priority-based processing
CREATE INDEX IF NOT EXISTS idx_evaluation_queue_priority ON evaluation_queue(status, priority DESC, created_at ASC);

-- Index for finding queue items by agent
CREATE INDEX IF NOT EXISTS idx_evaluation_queue_agent ON evaluation_queue(agent_id);

-- Index for cleanup of old completed items
CREATE INDEX IF NOT EXISTS idx_evaluation_queue_completed ON evaluation_queue(status, completed_at);
