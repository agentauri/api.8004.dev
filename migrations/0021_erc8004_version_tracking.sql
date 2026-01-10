-- Migration: ERC-8004 Version Tracking
-- Purpose: Enable backward compatibility with pre-v1.0 ERC-8004 agents
-- Date: January 2026

-- Add version tracking to sync metadata
ALTER TABLE agent_sync_metadata ADD COLUMN erc_8004_version TEXT DEFAULT 'v1.0';

-- Create version registry for chain-to-version mapping
CREATE TABLE IF NOT EXISTS erc_8004_versions (
  chain_id INTEGER PRIMARY KEY,
  active_version TEXT NOT NULL DEFAULT 'v1.0',
  v0_4_subgraph_id TEXT,
  v1_0_subgraph_id TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Populate with known versions
-- ETH Sepolia is the only chain with v1.0 contracts deployed
-- All other chains use v0.4 subgraphs (pre-v1.0)
INSERT INTO erc_8004_versions (chain_id, active_version, v0_4_subgraph_id, v1_0_subgraph_id) VALUES
  (11155111, 'v1.0', NULL, '6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT'),
  (84532, 'v0.4', 'GjQEDgEKqoh5Yc8MUgxoQoRATEJdEiH7HbocfR1aFiHa', NULL),
  (80002, 'v0.4', '2A1JB18r1mF2VNP4QBH4mmxd74kbHoM6xLXC8ABAKf7j', NULL),
  (59141, 'v0.4', '7GyxsUkWZ5aDNEqZQhFnMQk8CDxCDgT9WZKqFkNJ7YPx', NULL),
  (296, 'v0.4', '5GwJ2UKQK3WQhJNqvCqV9EFKBYD6wPYJvFqEPmBKcFsP', NULL),
  (998, 'v0.4', '3L8DKCwQwpLEYF7m3mE8PCvr8qJcJBvXTk3a9f9sLQrP', NULL),
  (1351057110, 'v0.4', 'HvYWvsPKqWrSzV8VT4mjLGwPNMgVFgRiNMZFdJUg8BPf', NULL);

-- Create index for version lookups
CREATE INDEX IF NOT EXISTS idx_erc_8004_versions_version
  ON erc_8004_versions(active_version);
