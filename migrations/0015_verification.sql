-- Agent Verification Migration
-- Enables multi-method verification for agent ownership

-- Verification records table
CREATE TABLE IF NOT EXISTS agent_verifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('dns', 'ens', 'github', 'twitter')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
  proof_data TEXT,
  verified_at TEXT,
  expires_at TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agent_id, method)
);

-- Index for looking up verifications by agent
CREATE INDEX IF NOT EXISTS idx_agent_verifications_agent ON agent_verifications(agent_id);

-- Index for looking up verified agents
CREATE INDEX IF NOT EXISTS idx_agent_verifications_status ON agent_verifications(status) WHERE status = 'verified';

-- Verification badge cache (computed from verifications)
CREATE TABLE IF NOT EXISTS agent_verification_badges (
  agent_id TEXT PRIMARY KEY,
  badge_level TEXT NOT NULL DEFAULT 'none' CHECK (badge_level IN ('none', 'basic', 'verified', 'official')),
  verified_methods TEXT NOT NULL DEFAULT '[]',
  verification_count INTEGER NOT NULL DEFAULT 0,
  last_verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Verification challenges (for pending verifications)
CREATE TABLE IF NOT EXISTS verification_challenges (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('dns', 'ens', 'github', 'twitter')),
  challenge_code TEXT NOT NULL,
  expected_value TEXT,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agent_id, method)
);

-- Index for cleanup of expired challenges
CREATE INDEX IF NOT EXISTS idx_verification_challenges_expires ON verification_challenges(expires_at);
