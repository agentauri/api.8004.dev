-- Migration: Graph Sync Per-Chain Round-Robin
-- Purpose: Add columns to qdrant_sync_state for per-chain round-robin sync
-- Context: The Graph sync worker was fetching ALL chains in a single invocation,
--          exhausting Cloudflare Worker subrequest limits with 15K+ agents.
--          This migration enables processing one chain per invocation.

-- Track which chain was last synced (for round-robin)
ALTER TABLE qdrant_sync_state ADD COLUMN last_graph_sync_chain_id INTEGER;

-- Per-chain sync timestamps as JSON (e.g. {"1":"2026-02-07T...","137":"2026-02-07T..."})
ALTER TABLE qdrant_sync_state ADD COLUMN graph_sync_chain_timestamps TEXT DEFAULT '{}';
