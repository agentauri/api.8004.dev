/**
 * Trending service for agents with highest reputation changes
 * @module services/trending
 */

import {
  getReputationAtDate,
  getSnapshotState,
  insertReputationSnapshot,
  updateSnapshotState,
} from '@/db/queries';
import type { AgentReputationRow } from '@/db/schema';
import type { Env } from '@/types';

/**
 * Trending entry for API response
 */
export interface TrendingEntry {
  agent: {
    id: string;
    name: string;
    image?: string;
    chainId: number;
  };
  currentScore: number;
  previousScore: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * Trending result
 */
export interface TrendingResult {
  entries: TrendingEntry[];
  period: string;
  dataAvailable: boolean;
  message?: string;
}

/**
 * Trending query parameters
 */
export interface TrendingQueryParams {
  period: '24h' | '7d' | '30d';
  limit: number;
}

/**
 * Snapshot result
 */
export interface SnapshotResult {
  agentsSnapshotted: number;
  errors: string[];
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0] as string;
}

/**
 * Get date string for N days ago
 */
function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0] as string;
}

/**
 * Get days from period
 */
function periodToDays(period: '24h' | '7d' | '30d'): number {
  switch (period) {
    case '24h':
      return 1;
    case '7d':
      return 7;
    case '30d':
      return 30;
  }
}

/**
 * Trending service interface
 */
export interface TrendingService {
  /**
   * Get trending agents by reputation change
   */
  getTrending(params: TrendingQueryParams): Promise<TrendingResult>;

  /**
   * Take daily reputation snapshot (called by cron)
   */
  takeSnapshot(): Promise<SnapshotResult>;

  /**
   * Check if history is available for a period
   */
  hasHistoryForPeriod(days: number): Promise<boolean>;
}

/**
 * Create trending service
 */
export function createTrendingService(env: Env): TrendingService {
  return {
    async getTrending(params: TrendingQueryParams): Promise<TrendingResult> {
      const { period, limit } = params;
      const days = periodToDays(period);

      // Check if we have historical data
      const snapshotState = await getSnapshotState(env.DB);
      if (!snapshotState?.last_snapshot_date) {
        return {
          entries: [],
          period,
          dataAvailable: false,
          message: 'Trending data not yet available. Historical snapshots start from today.',
        };
      }

      // Get comparison date
      const compareDate = getDateDaysAgo(days);

      // Get historical reputation data
      const historicalData = await getReputationAtDate(env.DB, compareDate);

      // If no historical data for this period, return graceful message
      if (historicalData.size === 0) {
        return {
          entries: [],
          period,
          dataAvailable: false,
          message: `No historical data available for ${period} period. Trending will be available after ${days} days.`,
        };
      }

      // Get current reputation data
      const result = await env.DB.prepare(
        `SELECT * FROM agent_reputation
         WHERE feedback_count > 0
         ORDER BY average_score DESC
         LIMIT 500`
      ).all<AgentReputationRow>();

      const currentReputations = result.results ?? [];

      // Calculate changes and sort by absolute change
      const changes: Array<{
        agentId: string;
        chainId: number;
        current: number;
        previous: number;
        change: number;
        changePercent: number;
      }> = [];

      for (const rep of currentReputations) {
        const previousData = historicalData.get(rep.agent_id);
        if (previousData) {
          const change = rep.average_score - previousData.score;
          const changePercent = previousData.score > 0 ? (change / previousData.score) * 100 : 0;

          changes.push({
            agentId: rep.agent_id,
            chainId: rep.chain_id,
            current: rep.average_score,
            previous: previousData.score,
            change,
            changePercent,
          });
        }
      }

      // Sort by absolute change (biggest movers first)
      changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      // Take top N
      const topChanges = changes.slice(0, limit);

      // Build entries
      const entries: TrendingEntry[] = topChanges.map((change) => {
        const [chainIdStr, tokenId] = change.agentId.split(':');
        const chainId = Number.parseInt(chainIdStr ?? '0', 10);

        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (change.change > 1) trend = 'up';
        else if (change.change < -1) trend = 'down';

        return {
          agent: {
            id: change.agentId,
            name: `Agent ${tokenId}`,
            chainId,
          },
          currentScore: Math.round(change.current * 100) / 100,
          previousScore: Math.round(change.previous * 100) / 100,
          change: Math.round(change.change * 100) / 100,
          changePercent: Math.round(change.changePercent * 10) / 10,
          trend,
        };
      });

      // Enrich with agent names from Qdrant
      if (env.QDRANT_URL && env.QDRANT_API_KEY && entries.length > 0) {
        try {
          const { createQdrantClient } = await import('./qdrant');
          const qdrant = createQdrantClient({
            QDRANT_URL: env.QDRANT_URL,
            QDRANT_API_KEY: env.QDRANT_API_KEY,
            QDRANT_COLLECTION: env.QDRANT_COLLECTION || 'agents',
          });

          const agentIds = entries.map((e) => e.agent.id);
          const points = await qdrant.getByIds(agentIds);

          const agentDataMap = new Map(
            points.map((p) => [
              p.id as string,
              {
                name: (p.payload as { name?: string })?.name,
                image: (p.payload as { image?: string })?.image,
              },
            ])
          );

          for (const entry of entries) {
            const data = agentDataMap.get(entry.agent.id);
            if (data?.name) {
              entry.agent.name = data.name;
            }
            if (data?.image) {
              entry.agent.image = data.image;
            }
          }
        } catch (error) {
          console.warn('Trending: Qdrant enrichment failed:', error);
        }
      }

      return {
        entries,
        period,
        dataAvailable: true,
      };
    },

    async takeSnapshot(): Promise<SnapshotResult> {
      const today = getTodayDate();
      const errors: string[] = [];

      // Check if we already took a snapshot today
      const snapshotState = await getSnapshotState(env.DB);
      if (snapshotState?.last_snapshot_date === today) {
        console.info('Snapshot already taken today');
        return { agentsSnapshotted: 0, errors: [] };
      }

      // Get all agents with reputation
      const result = await env.DB.prepare(
        `SELECT * FROM agent_reputation WHERE feedback_count > 0`
      ).all<AgentReputationRow>();

      const agents = result.results ?? [];
      let snapshotted = 0;

      for (const agent of agents) {
        try {
          await insertReputationSnapshot(env.DB, {
            agent_id: agent.agent_id,
            chain_id: agent.chain_id,
            snapshot_date: today,
            reputation_score: agent.average_score,
            feedback_count: agent.feedback_count,
          });
          snapshotted++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${agent.agent_id}: ${errorMsg}`);
        }
      }

      // Update snapshot state
      await updateSnapshotState(
        env.DB,
        today,
        snapshotted,
        errors.length > 0 ? errors.join('; ') : undefined
      );

      console.info(`Snapshot complete: ${snapshotted} agents, ${errors.length} errors`);
      return { agentsSnapshotted: snapshotted, errors };
    },

    async hasHistoryForPeriod(days: number): Promise<boolean> {
      const compareDate = getDateDaysAgo(days);
      const data = await getReputationAtDate(env.DB, compareDate);
      return data.size > 0;
    },
  };
}
