/**
 * Reliability Index Service
 *
 * Tracks endpoint availability, latency, and success rates for agents.
 * Provides metrics for evaluating agent reliability.
 *
 * @module services/reliability
 */

import type { D1Database } from '@cloudflare/workers-types';

/**
 * Reliability metrics for an agent
 */
export interface ReliabilityMetrics {
  /** Agent ID (chainId:tokenId) */
  agentId: string;
  /** Chain ID */
  chainId: number;
  /** MCP endpoint latency in milliseconds */
  mcpLatencyMs: number | null;
  /** MCP success rate (0-100) */
  mcpSuccessRate: number;
  /** A2A endpoint latency in milliseconds */
  a2aLatencyMs: number | null;
  /** A2A success rate (0-100) */
  a2aSuccessRate: number;
  /** Last check timestamp */
  lastCheckedAt: string | null;
}

/**
 * Check result for a single endpoint
 */
export interface EndpointCheckResult {
  /** Whether the check succeeded */
  success: boolean;
  /** Latency in milliseconds (if successful) */
  latencyMs: number | null;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Raw reliability row from D1
 */
interface ReliabilityRow {
  agent_id: string;
  chain_id: number;
  mcp_latency_ms: number | null;
  mcp_success_count: number;
  mcp_failure_count: number;
  mcp_last_check_at: string | null;
  mcp_last_success_at: string | null;
  a2a_latency_ms: number | null;
  a2a_success_count: number;
  a2a_failure_count: number;
  a2a_last_check_at: string | null;
  a2a_last_success_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Reliability service for tracking agent endpoint metrics
 */
export class ReliabilityService {
  constructor(private readonly db: D1Database) {}

  /**
   * Get reliability metrics for an agent
   */
  async getMetrics(agentId: string): Promise<ReliabilityMetrics | null> {
    const row = await this.db
      .prepare('SELECT * FROM agent_reliability WHERE agent_id = ?')
      .bind(agentId)
      .first<ReliabilityRow>();

    if (!row) return null;

    return this.rowToMetrics(row);
  }

  /**
   * Get reliability metrics for multiple agents
   */
  async getMetricsBatch(agentIds: string[]): Promise<Map<string, ReliabilityMetrics>> {
    if (agentIds.length === 0) return new Map();

    const metricsMap = new Map<string, ReliabilityMetrics>();

    // D1 has a limit of 100 bound parameters per query
    const BATCH_SIZE = 95;

    for (let i = 0; i < agentIds.length; i += BATCH_SIZE) {
      const batch = agentIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');

      const { results } = await this.db
        .prepare(`SELECT * FROM agent_reliability WHERE agent_id IN (${placeholders})`)
        .bind(...batch)
        .all<ReliabilityRow>();

      for (const row of results) {
        metricsMap.set(row.agent_id, this.rowToMetrics(row));
      }
    }

    return metricsMap;
  }

  /**
   * Record an MCP endpoint check result
   */
  async recordMcpCheck(
    agentId: string,
    chainId: number,
    result: EndpointCheckResult
  ): Promise<void> {
    const now = new Date().toISOString();

    if (result.success) {
      await this.db
        .prepare(
          `INSERT INTO agent_reliability (agent_id, chain_id, mcp_latency_ms, mcp_success_count, mcp_last_check_at, mcp_last_success_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             mcp_latency_ms = ?,
             mcp_success_count = mcp_success_count + 1,
             mcp_last_check_at = ?,
             mcp_last_success_at = ?,
             updated_at = ?`
        )
        .bind(agentId, chainId, result.latencyMs, now, now, now, result.latencyMs, now, now, now)
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO agent_reliability (agent_id, chain_id, mcp_failure_count, mcp_last_check_at, updated_at)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             mcp_failure_count = mcp_failure_count + 1,
             mcp_last_check_at = ?,
             updated_at = ?`
        )
        .bind(agentId, chainId, now, now, now, now)
        .run();
    }
  }

  /**
   * Record an A2A endpoint check result
   */
  async recordA2aCheck(
    agentId: string,
    chainId: number,
    result: EndpointCheckResult
  ): Promise<void> {
    const now = new Date().toISOString();

    if (result.success) {
      await this.db
        .prepare(
          `INSERT INTO agent_reliability (agent_id, chain_id, a2a_latency_ms, a2a_success_count, a2a_last_check_at, a2a_last_success_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             a2a_latency_ms = ?,
             a2a_success_count = a2a_success_count + 1,
             a2a_last_check_at = ?,
             a2a_last_success_at = ?,
             updated_at = ?`
        )
        .bind(agentId, chainId, result.latencyMs, now, now, now, result.latencyMs, now, now, now)
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO agent_reliability (agent_id, chain_id, a2a_failure_count, a2a_last_check_at, updated_at)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             a2a_failure_count = a2a_failure_count + 1,
             a2a_last_check_at = ?,
             updated_at = ?`
        )
        .bind(agentId, chainId, now, now, now, now)
        .run();
    }
  }

  /**
   * Get agents with high reliability
   * @param minSuccessRate Minimum success rate (0-100)
   * @param maxLatencyMs Maximum latency in milliseconds
   */
  async getReliableAgents(minSuccessRate = 80, maxLatencyMs = 5000): Promise<ReliabilityMetrics[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM agent_reliability
         WHERE (
           (mcp_success_count > 0 AND
            CAST(mcp_success_count AS REAL) / (mcp_success_count + mcp_failure_count) * 100 >= ? AND
            (mcp_latency_ms IS NULL OR mcp_latency_ms <= ?))
           OR
           (a2a_success_count > 0 AND
            CAST(a2a_success_count AS REAL) / (a2a_success_count + a2a_failure_count) * 100 >= ? AND
            (a2a_latency_ms IS NULL OR a2a_latency_ms <= ?))
         )
         ORDER BY updated_at DESC
         LIMIT 1000`
      )
      .bind(minSuccessRate, maxLatencyMs, minSuccessRate, maxLatencyMs)
      .all<ReliabilityRow>();

    return results.map((row) => this.rowToMetrics(row));
  }

  /**
   * Convert database row to metrics object
   */
  private rowToMetrics(row: ReliabilityRow): ReliabilityMetrics {
    const mcpTotal = row.mcp_success_count + row.mcp_failure_count;
    const a2aTotal = row.a2a_success_count + row.a2a_failure_count;

    return {
      agentId: row.agent_id,
      chainId: row.chain_id,
      mcpLatencyMs: row.mcp_latency_ms,
      mcpSuccessRate: mcpTotal > 0 ? Math.round((row.mcp_success_count / mcpTotal) * 100) : 0,
      a2aLatencyMs: row.a2a_latency_ms,
      a2aSuccessRate: a2aTotal > 0 ? Math.round((row.a2a_success_count / a2aTotal) * 100) : 0,
      lastCheckedAt: row.mcp_last_check_at || row.a2a_last_check_at,
    };
  }
}

/**
 * Create a reliability service instance
 */
export function createReliabilityService(db: D1Database): ReliabilityService {
  return new ReliabilityService(db);
}
