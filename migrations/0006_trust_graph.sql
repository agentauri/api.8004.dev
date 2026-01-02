-- Trust Graph Migration
-- Builds a graph of trust relationships from feedback data
-- Uses PageRank to calculate trust scores for agents

-- Trust edges derived from feedback
-- Each feedback creates an edge from submitter wallet to agent
CREATE TABLE IF NOT EXISTS trust_edges (
  id TEXT PRIMARY KEY,
  from_wallet TEXT NOT NULL,        -- Wallet that gave feedback
  to_agent_id TEXT NOT NULL,        -- Agent that received feedback
  weight REAL NOT NULL DEFAULT 1.0, -- Edge weight (normalized score)
  feedback_id TEXT,                 -- Reference to original feedback
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_wallet, to_agent_id)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_trust_edges_from_wallet ON trust_edges(from_wallet);
CREATE INDEX IF NOT EXISTS idx_trust_edges_to_agent ON trust_edges(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_trust_edges_weight ON trust_edges(weight DESC);

-- Computed trust scores (PageRank results)
CREATE TABLE IF NOT EXISTS agent_trust_scores (
  agent_id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  trust_score REAL NOT NULL DEFAULT 0.0,  -- PageRank score (0-100 normalized)
  raw_pagerank REAL NOT NULL DEFAULT 0.0, -- Raw PageRank value
  in_degree INTEGER DEFAULT 0,            -- Number of incoming edges
  out_degree INTEGER DEFAULT 0,           -- Number of outgoing edges (for wallets)
  iteration INTEGER DEFAULT 0,            -- Last PageRank iteration
  computed_at TEXT,                       -- When score was computed
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for querying by score
CREATE INDEX IF NOT EXISTS idx_trust_scores_score ON agent_trust_scores(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_trust_scores_chain ON agent_trust_scores(chain_id);

-- Wallet trust scores (for weighted PageRank)
-- Wallets that give feedback to highly trusted agents get higher weight
CREATE TABLE IF NOT EXISTS wallet_trust_scores (
  wallet_address TEXT PRIMARY KEY,
  trust_score REAL NOT NULL DEFAULT 1.0,  -- Normalized score (0-100)
  feedback_count INTEGER DEFAULT 0,        -- Total feedbacks given
  avg_target_score REAL DEFAULT 0.0,       -- Avg score of agents they rated
  computed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- PageRank computation state
CREATE TABLE IF NOT EXISTS trust_graph_state (
  id TEXT PRIMARY KEY DEFAULT 'global',
  last_computation TEXT,
  total_iterations INTEGER DEFAULT 0,
  total_edges INTEGER DEFAULT 0,
  total_agents INTEGER DEFAULT 0,
  damping_factor REAL DEFAULT 0.85,
  convergence_threshold REAL DEFAULT 0.0001,
  status TEXT DEFAULT 'idle',  -- idle, computing, completed, failed
  error TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Initialize global state
INSERT OR IGNORE INTO trust_graph_state (id) VALUES ('global');
