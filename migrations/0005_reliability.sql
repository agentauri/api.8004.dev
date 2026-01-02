-- Reliability Index Migration
-- Tracks endpoint availability, latency, and success rate for agents

-- Agent reliability tracking table
CREATE TABLE IF NOT EXISTS agent_reliability (
  agent_id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  -- MCP endpoint metrics
  mcp_latency_ms INTEGER,
  mcp_success_count INTEGER DEFAULT 0,
  mcp_failure_count INTEGER DEFAULT 0,
  mcp_last_check_at TEXT,
  mcp_last_success_at TEXT,
  -- A2A endpoint metrics
  a2a_latency_ms INTEGER,
  a2a_success_count INTEGER DEFAULT 0,
  a2a_failure_count INTEGER DEFAULT 0,
  a2a_last_check_at TEXT,
  a2a_last_success_at TEXT,
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for querying by chain
CREATE INDEX IF NOT EXISTS idx_agent_reliability_chain_id ON agent_reliability(chain_id);

-- Index for querying reachable agents
CREATE INDEX IF NOT EXISTS idx_agent_reliability_mcp_success ON agent_reliability(mcp_success_count) WHERE mcp_success_count > 0;
CREATE INDEX IF NOT EXISTS idx_agent_reliability_a2a_success ON agent_reliability(a2a_success_count) WHERE a2a_success_count > 0;
