-- Agent Evaluations table for Registry-as-Evaluator
-- Stores results from capability verification tests

CREATE TABLE IF NOT EXISTS agent_evaluations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  evaluated_at TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  is_reachable INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  verified_skills TEXT NOT NULL DEFAULT '[]',
  failed_skills TEXT NOT NULL DEFAULT '[]',
  tests TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for quick lookups by agent
CREATE INDEX IF NOT EXISTS idx_agent_evaluations_agent_id ON agent_evaluations(agent_id);

-- Index for finding recent evaluations
CREATE INDEX IF NOT EXISTS idx_agent_evaluations_evaluated_at ON agent_evaluations(evaluated_at DESC);

-- Index for filtering by score
CREATE INDEX IF NOT EXISTS idx_agent_evaluations_overall_score ON agent_evaluations(overall_score);

-- Composite index for getting latest evaluation per agent
CREATE INDEX IF NOT EXISTS idx_agent_evaluations_agent_latest ON agent_evaluations(agent_id, evaluated_at DESC);
