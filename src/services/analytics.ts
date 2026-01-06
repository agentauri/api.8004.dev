/**
 * Analytics service for platform metrics and aggregations
 * @module services/analytics
 */

import { generateId } from '@/lib/utils/id';

export type MetricType = 'agents' | 'search' | 'classification' | 'feedback' | 'api_usage';
export type Period = 'hour' | 'day' | 'week' | 'month';

export interface AnalyticsMetric {
  id: string;
  metricType: MetricType;
  period: Period;
  periodStart: string;
  periodEnd: string;
  chainId: number | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface SearchAnalytics {
  id: string;
  queryHash: string;
  queryText: string | null;
  filters: Record<string, unknown>;
  resultCount: number;
  latencyMs: number | null;
  chainIds: number[];
  createdAt: string;
}

export interface FilterUsage {
  filterName: string;
  filterValue: string;
  usageCount: number;
}

export interface ApiEndpointUsage {
  endpoint: string;
  method: string;
  requestCount: number;
  avgLatencyMs: number | null;
  successRate: number;
}

export interface PlatformStats {
  totalAgents: number;
  activeAgents: number;
  totalSearches: number;
  totalClassifications: number;
  totalFeedback: number;
  chainDistribution: Record<number, number>;
  protocolAdoption: {
    mcp: number;
    a2a: number;
    x402: number;
  };
}

export interface AnalyticsSummary {
  period: Period;
  periodStart: string;
  periodEnd: string;
  platformStats: PlatformStats;
  popularFilters: FilterUsage[];
  topEndpoints: ApiEndpointUsage[];
  searchVolume: {
    total: number;
    avgLatencyMs: number;
    avgResultCount: number;
  };
  chainActivity: Record<number, {
    agents: number;
    searches: number;
    feedback: number;
  }>;
}

/**
 * Get period boundaries for aggregation
 */
export function getPeriodBoundaries(period: Period, date: Date = new Date()): { start: string; end: string } {
  const d = new Date(date);

  switch (period) {
    case 'hour': {
      d.setMinutes(0, 0, 0);
      const start = d.toISOString().replace('T', ' ').substring(0, 19);
      d.setHours(d.getHours() + 1);
      const end = d.toISOString().replace('T', ' ').substring(0, 19);
      return { start, end };
    }
    case 'day': {
      d.setHours(0, 0, 0, 0);
      const start = d.toISOString().replace('T', ' ').substring(0, 19);
      d.setDate(d.getDate() + 1);
      const end = d.toISOString().replace('T', ' ').substring(0, 19);
      return { start, end };
    }
    case 'week': {
      const dayOfWeek = d.getDay();
      d.setDate(d.getDate() - dayOfWeek);
      d.setHours(0, 0, 0, 0);
      const start = d.toISOString().replace('T', ' ').substring(0, 19);
      d.setDate(d.getDate() + 7);
      const end = d.toISOString().replace('T', ' ').substring(0, 19);
      return { start, end };
    }
    case 'month': {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      const start = d.toISOString().replace('T', ' ').substring(0, 19);
      d.setMonth(d.getMonth() + 1);
      const end = d.toISOString().replace('T', ' ').substring(0, 19);
      return { start, end };
    }
  }
}

/**
 * Record a search query for analytics
 */
export async function recordSearchAnalytics(
  db: D1Database,
  data: {
    queryText?: string;
    filters?: Record<string, unknown>;
    resultCount: number;
    latencyMs?: number;
    chainIds?: number[];
  }
): Promise<void> {
  try {
    const queryHash = await hashQuery(data.queryText ?? '', data.filters ?? {});
    const id = generateId();

    await db
      .prepare(
        `INSERT INTO analytics_search (id, query_hash, query_text, filters, result_count, latency_ms, chain_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        queryHash,
        data.queryText ?? null,
        JSON.stringify(data.filters ?? {}),
        data.resultCount,
        data.latencyMs ?? null,
        JSON.stringify(data.chainIds ?? [])
      )
      .run();
  } catch (error) {
    // Analytics should not break primary functionality
    console.error('Failed to record search analytics', {
      error: error instanceof Error ? error.message : String(error),
      queryText: data.queryText?.substring(0, 50),
    });
    // Don't re-throw
  }
}

/**
 * Record filter usage for analytics
 */
export async function recordFilterUsage(
  db: D1Database,
  filterName: string,
  filterValue: string,
  period: Period = 'day'
): Promise<void> {
  try {
    const { start } = getPeriodBoundaries(period);
    const id = generateId();

    await db
      .prepare(
        `INSERT INTO analytics_filters (id, filter_name, filter_value, usage_count, period, period_start)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(filter_name, filter_value, period, period_start)
         DO UPDATE SET usage_count = usage_count + 1, updated_at = datetime('now')`
      )
      .bind(id, filterName, filterValue, period, start)
      .run();
  } catch (error) {
    // Analytics should not break primary functionality
    console.error('Failed to record filter usage', {
      error: error instanceof Error ? error.message : String(error),
      filterName,
      filterValue,
    });
    // Don't re-throw
  }
}

/**
 * Record API endpoint usage
 */
export async function recordApiUsage(
  db: D1Database,
  data: {
    endpoint: string;
    method: string;
    statusCode: number;
    latencyMs?: number;
    apiKeyId?: string;
  }
): Promise<void> {
  try {
    const { start } = getPeriodBoundaries('hour');
    const id = generateId();

    await db
      .prepare(
        `INSERT INTO analytics_api_usage (id, endpoint, method, status_code, latency_ms, api_key_id, period, period_start, request_count)
         VALUES (?, ?, ?, ?, ?, ?, 'hour', ?, 1)
         ON CONFLICT(endpoint, method, status_code, api_key_id, period, period_start)
         DO UPDATE SET request_count = request_count + 1, updated_at = datetime('now')`
      )
      .bind(
        id,
        data.endpoint,
        data.method,
        data.statusCode,
        data.latencyMs ?? null,
        data.apiKeyId ?? null,
        start
      )
      .run();
  } catch (error) {
    // Analytics should not break primary functionality
    console.error('Failed to record API usage', {
      error: error instanceof Error ? error.message : String(error),
      endpoint: data.endpoint,
      method: data.method,
    });
    // Don't re-throw
  }
}

/**
 * Get platform statistics
 */
export async function getPlatformStats(db: D1Database): Promise<PlatformStats> {
  // Get agent counts from classifications (as proxy for indexed agents)
  const agentStats = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= datetime('now', '-24 hours') THEN 1 END) as active_24h
       FROM agent_classifications`
    )
    .first<{ total: number; active_24h: number }>();

  // Get search count
  const searchStats = await db
    .prepare(`SELECT COUNT(*) as total FROM analytics_search`)
    .first<{ total: number }>();

  // Get classification count
  const classificationStats = await db
    .prepare(`SELECT COUNT(*) as total FROM agent_classifications`)
    .first<{ total: number }>();

  // Get feedback count
  const feedbackStats = await db
    .prepare(`SELECT COUNT(*) as total FROM agent_feedback`)
    .first<{ total: number }>();

  // Get chain distribution
  const chainDistribution = await db
    .prepare(
      `SELECT chain_id, COUNT(*) as count
       FROM agent_classifications
       GROUP BY chain_id`
    )
    .all<{ chain_id: number; count: number }>();

  // Get protocol adoption (from Qdrant sync or fallback to 0)
  // Note: Protocol flags may not exist in all table schemas
  let protocolStats: { mcp_count: number; a2a_count: number; x402_count: number } | null = null;
  try {
    protocolStats = await db
      .prepare(
        `SELECT
          COUNT(CASE WHEN mcp = 1 THEN 1 END) as mcp_count,
          COUNT(CASE WHEN a2a = 1 THEN 1 END) as a2a_count,
          COUNT(CASE WHEN x402 = 1 THEN 1 END) as x402_count
         FROM agent_classifications`
      )
      .first<{ mcp_count: number; a2a_count: number; x402_count: number }>();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // Only catch specific schema errors, re-throw others
    if (errorMsg.includes('no such column') || errorMsg.includes('SQLITE_ERROR')) {
      console.warn('Protocol columns not in schema, defaulting to 0', { error: errorMsg });
      protocolStats = { mcp_count: 0, a2a_count: 0, x402_count: 0 };
    } else {
      console.error('Unexpected error fetching protocol stats', { error: errorMsg });
      throw error;
    }
  }

  const chainDist: Record<number, number> = {};
  for (const row of chainDistribution.results ?? []) {
    chainDist[row.chain_id] = row.count;
  }

  return {
    totalAgents: agentStats?.total ?? 0,
    activeAgents: agentStats?.active_24h ?? 0,
    totalSearches: searchStats?.total ?? 0,
    totalClassifications: classificationStats?.total ?? 0,
    totalFeedback: feedbackStats?.total ?? 0,
    chainDistribution: chainDist,
    protocolAdoption: {
      mcp: protocolStats?.mcp_count ?? 0,
      a2a: protocolStats?.a2a_count ?? 0,
      x402: protocolStats?.x402_count ?? 0,
    },
  };
}

/**
 * Get popular filters for a period
 */
export async function getPopularFilters(
  db: D1Database,
  period: Period = 'day',
  limit = 20
): Promise<FilterUsage[]> {
  const { start } = getPeriodBoundaries(period);

  const results = await db
    .prepare(
      `SELECT filter_name, filter_value, SUM(usage_count) as usage_count
       FROM analytics_filters
       WHERE period = ? AND period_start >= ?
       GROUP BY filter_name, filter_value
       ORDER BY usage_count DESC
       LIMIT ?`
    )
    .bind(period, start, limit)
    .all<{ filter_name: string; filter_value: string; usage_count: number }>();

  return (results.results ?? []).map((row) => ({
    filterName: row.filter_name,
    filterValue: row.filter_value,
    usageCount: row.usage_count,
  }));
}

/**
 * Get top API endpoints by usage
 */
export async function getTopEndpoints(
  db: D1Database,
  period: Period = 'day',
  limit = 20
): Promise<ApiEndpointUsage[]> {
  const { start } = getPeriodBoundaries(period);

  const results = await db
    .prepare(
      `SELECT
        endpoint,
        method,
        SUM(request_count) as total_requests,
        AVG(latency_ms) as avg_latency,
        SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN request_count ELSE 0 END) * 1.0 / SUM(request_count) as success_rate
       FROM analytics_api_usage
       WHERE period_start >= ?
       GROUP BY endpoint, method
       ORDER BY total_requests DESC
       LIMIT ?`
    )
    .bind(start, limit)
    .all<{ endpoint: string; method: string; total_requests: number; avg_latency: number | null; success_rate: number }>();

  return (results.results ?? []).map((row) => ({
    endpoint: row.endpoint,
    method: row.method,
    requestCount: row.total_requests,
    avgLatencyMs: row.avg_latency,
    successRate: row.success_rate,
  }));
}

/**
 * Get search volume statistics
 */
export async function getSearchVolume(
  db: D1Database,
  period: Period = 'day'
): Promise<{ total: number; avgLatencyMs: number; avgResultCount: number }> {
  const { start } = getPeriodBoundaries(period);

  const stats = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        AVG(latency_ms) as avg_latency,
        AVG(result_count) as avg_results
       FROM analytics_search
       WHERE created_at >= ?`
    )
    .bind(start)
    .first<{ total: number; avg_latency: number | null; avg_results: number | null }>();

  return {
    total: stats?.total ?? 0,
    avgLatencyMs: stats?.avg_latency ?? 0,
    avgResultCount: stats?.avg_results ?? 0,
  };
}

/**
 * Get chain activity breakdown
 */
export async function getChainActivity(
  db: D1Database,
  period: Period = 'day'
): Promise<Record<number, { agents: number; searches: number; feedback: number }>> {
  const { start } = getPeriodBoundaries(period);

  // Get agents by chain
  const agentsByChain = await db
    .prepare(
      `SELECT chain_id, COUNT(*) as count
       FROM agent_classifications
       WHERE created_at >= ?
       GROUP BY chain_id`
    )
    .bind(start)
    .all<{ chain_id: number; count: number }>();

  // Get feedback by chain
  const feedbackByChain = await db
    .prepare(
      `SELECT chain_id, COUNT(*) as count
       FROM agent_feedback
       WHERE created_at >= ?
       GROUP BY chain_id`
    )
    .bind(start)
    .all<{ chain_id: number; count: number }>();

  const result: Record<number, { agents: number; searches: number; feedback: number }> = {};

  // Aggregate agents
  for (const row of agentsByChain.results ?? []) {
    const entry = result[row.chain_id] ?? { agents: 0, searches: 0, feedback: 0 };
    entry.agents = row.count;
    result[row.chain_id] = entry;
  }

  // Aggregate feedback
  for (const row of feedbackByChain.results ?? []) {
    const entry = result[row.chain_id] ?? { agents: 0, searches: 0, feedback: 0 };
    entry.feedback = row.count;
    result[row.chain_id] = entry;
  }

  // Note: Search analytics doesn't have direct chain association in the current schema
  // Would need to parse chain_ids JSON for per-chain search stats

  return result;
}

/**
 * Get full analytics summary
 */
export async function getAnalyticsSummary(
  db: D1Database,
  period: Period = 'day'
): Promise<AnalyticsSummary> {
  const boundaries = getPeriodBoundaries(period);

  const [platformStats, popularFilters, topEndpoints, searchVolume, chainActivity] = await Promise.all([
    getPlatformStats(db),
    getPopularFilters(db, period),
    getTopEndpoints(db, period),
    getSearchVolume(db, period),
    getChainActivity(db, period),
  ]);

  return {
    period,
    periodStart: boundaries.start,
    periodEnd: boundaries.end,
    platformStats,
    popularFilters,
    topEndpoints,
    searchVolume,
    chainActivity,
  };
}

/**
 * Run hourly aggregation
 */
export async function runHourlyAggregation(db: D1Database): Promise<void> {
  const now = new Date();
  const { start, end } = getPeriodBoundaries('hour', now);

  // Update aggregation state
  await db
    .prepare(
      `UPDATE analytics_aggregation_state
       SET status = 'running', updated_at = datetime('now')
       WHERE key = 'global'`
    )
    .run();

  try {
    // Aggregate agent metrics
    const agentMetrics = await db
      .prepare(
        `SELECT
          chain_id,
          COUNT(*) as total,
          COUNT(CASE WHEN mcp = 1 THEN 1 END) as mcp_count,
          COUNT(CASE WHEN a2a = 1 THEN 1 END) as a2a_count
         FROM agent_classifications
         WHERE created_at >= ? AND created_at < ?
         GROUP BY chain_id`
      )
      .bind(start, end)
      .all<{ chain_id: number; total: number; mcp_count: number; a2a_count: number }>();

    // Store aggregated metrics
    for (const row of agentMetrics.results ?? []) {
      const id = generateId();
      await db
        .prepare(
          `INSERT OR REPLACE INTO analytics_metrics (id, metric_type, period, period_start, period_end, chain_id, data)
           VALUES (?, 'agents', 'hour', ?, ?, ?, ?)`
        )
        .bind(
          id,
          start,
          end,
          row.chain_id,
          JSON.stringify({
            total: row.total,
            mcpEnabled: row.mcp_count,
            a2aEnabled: row.a2a_count,
          })
        )
        .run();
    }

    // Aggregate search metrics
    const searchMetrics = await db
      .prepare(
        `SELECT
          COUNT(*) as total,
          AVG(latency_ms) as avg_latency,
          AVG(result_count) as avg_results
         FROM analytics_search
         WHERE created_at >= ? AND created_at < ?`
      )
      .bind(start, end)
      .first<{ total: number; avg_latency: number | null; avg_results: number | null }>();

    if (searchMetrics && searchMetrics.total > 0) {
      const id = generateId();
      await db
        .prepare(
          `INSERT OR REPLACE INTO analytics_metrics (id, metric_type, period, period_start, period_end, chain_id, data)
           VALUES (?, 'search', 'hour', ?, ?, NULL, ?)`
        )
        .bind(
          id,
          start,
          end,
          JSON.stringify({
            total: searchMetrics.total,
            avgLatencyMs: searchMetrics.avg_latency,
            avgResultCount: searchMetrics.avg_results,
          })
        )
        .run();
    }

    // Update state on success
    await db
      .prepare(
        `UPDATE analytics_aggregation_state
         SET status = 'idle', last_hourly_aggregation = ?, error = NULL, updated_at = datetime('now')
         WHERE key = 'global'`
      )
      .bind(start)
      .run();
  } catch (error) {
    // Update state on error
    await db
      .prepare(
        `UPDATE analytics_aggregation_state
         SET status = 'error', error = ?, updated_at = datetime('now')
         WHERE key = 'global'`
      )
      .bind(error instanceof Error ? error.message : 'Unknown error')
      .run();
    throw error;
  }
}

/**
 * Get historical metrics for a time range
 */
export async function getHistoricalMetrics(
  db: D1Database,
  metricType: MetricType,
  options: {
    period?: Period;
    chainId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}
): Promise<AnalyticsMetric[]> {
  const { period = 'hour', chainId, startDate, endDate, limit = 168 } = options; // Default 7 days of hourly data

  let query = `SELECT * FROM analytics_metrics WHERE metric_type = ? AND period = ?`;
  const params: (string | number)[] = [metricType, period];

  if (chainId !== undefined) {
    query += ' AND chain_id = ?';
    params.push(chainId);
  }

  if (startDate) {
    query += ' AND period_start >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND period_end <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY period_start DESC LIMIT ?';
  params.push(limit);

  const results = await db
    .prepare(query)
    .bind(...params)
    .all<{
      id: string;
      metric_type: string;
      period: string;
      period_start: string;
      period_end: string;
      chain_id: number | null;
      data: string;
      created_at: string;
    }>();

  return (results.results ?? []).map((row) => ({
    id: row.id,
    metricType: row.metric_type as MetricType,
    period: row.period as Period,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    chainId: row.chain_id,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
  }));
}

/**
 * Hash a search query for deduplication
 */
async function hashQuery(queryText: string, filters: Record<string, unknown>): Promise<string> {
  const input = `${queryText}:${JSON.stringify(filters)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
