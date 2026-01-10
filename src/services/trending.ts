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
 * Trending agent entry for API response
 * Matches FE BackendTrendingAgent interface
 */
export interface TrendingAgent {
  /** Agent identifier (format: "chainId:tokenId") */
  agentId: string;
  /** Chain ID */
  chainId: number;
  /** Token ID */
  tokenId: string;
  /** Agent display name */
  name: string;
  /** Agent image URL */
  image?: string;
  /** Current reputation score (0-100) */
  currentScore: number;
  /** Previous reputation score (before period) */
  previousScore: number;
  /** Absolute score change */
  scoreChange: number;
  /** Percentage change */
  percentageChange: number;
  /** Trend direction */
  trend: 'up' | 'down' | 'stable';
  /** Whether agent is active */
  active: boolean | null;
  /** MCP protocol support */
  hasMcp: boolean | null;
  /** A2A protocol support */
  hasA2a: boolean | null;
  /** x402 payment support */
  x402Support: boolean | null;
}

/**
 * Trending result
 * Matches FE BackendTrendingResponse.data structure
 */
export interface TrendingResult {
  agents: TrendingAgent[];
  period: '24h' | '7d' | '30d';
  generatedAt: string;
  nextRefreshAt?: string;
  /** Whether historical data is available for calculation */
  dataAvailable: boolean;
  /** Message when data not available */
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
      const generatedAt = new Date().toISOString();

      // Check if we have historical data
      const snapshotState = await getSnapshotState(env.DB);
      if (!snapshotState?.last_snapshot_date) {
        return {
          agents: [],
          period,
          generatedAt,
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
          agents: [],
          period,
          generatedAt,
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
        tokenId: string;
        current: number;
        previous: number;
        scoreChange: number;
        percentageChange: number;
      }> = [];

      for (const rep of currentReputations) {
        const previousData = historicalData.get(rep.agent_id);
        if (previousData) {
          const scoreChange = rep.average_score - previousData.score;
          const percentageChange = previousData.score > 0 ? (scoreChange / previousData.score) * 100 : 0;
          const [, tokenId] = rep.agent_id.split(':');

          changes.push({
            agentId: rep.agent_id,
            chainId: rep.chain_id,
            tokenId: tokenId ?? '0',
            current: rep.average_score,
            previous: previousData.score,
            scoreChange,
            percentageChange,
          });
        }
      }

      // Sort by absolute change (biggest movers first)
      changes.sort((a, b) => Math.abs(b.scoreChange) - Math.abs(a.scoreChange));

      // Take top N
      const topChanges = changes.slice(0, limit);

      // Build agents array with flat structure
      const agents: TrendingAgent[] = topChanges.map((change) => {
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (change.scoreChange > 1) trend = 'up';
        else if (change.scoreChange < -1) trend = 'down';

        return {
          agentId: change.agentId,
          chainId: change.chainId,
          tokenId: change.tokenId,
          name: `Agent #${change.tokenId}`,
          image: undefined,
          currentScore: Math.round(change.current * 100) / 100,
          previousScore: Math.round(change.previous * 100) / 100,
          scoreChange: Math.round(change.scoreChange * 100) / 100,
          percentageChange: Math.round(change.percentageChange * 10) / 10,
          trend,
          active: null,
          hasMcp: null,
          hasA2a: null,
          x402Support: null,
        };
      });

      // Enrich with agent data from Qdrant
      if (env.QDRANT_URL && env.QDRANT_API_KEY && agents.length > 0) {
        try {
          const { createQdrantClient } = await import('./qdrant');
          const qdrant = createQdrantClient({
            QDRANT_URL: env.QDRANT_URL,
            QDRANT_API_KEY: env.QDRANT_API_KEY,
            QDRANT_COLLECTION: env.QDRANT_COLLECTION || 'agents',
          });

          const agentIds = agents.map((a) => a.agentId);
          const points = await qdrant.getByIds(agentIds);

          // Create lookup map with all relevant fields
          interface QdrantTrendingPayload {
            name?: string;
            image?: string;
            active?: boolean;
            hasMcp?: boolean;
            hasA2a?: boolean;
            x402Support?: boolean;
          }

          const agentDataMap = new Map(
            points.map((p) => [p.id as string, p.payload as QdrantTrendingPayload])
          );

          // Enrich agents with Qdrant data
          for (const agent of agents) {
            const data = agentDataMap.get(agent.agentId);
            if (data) {
              if (data.name) agent.name = data.name;
              if (data.image) agent.image = data.image;
              if (data.active !== undefined) agent.active = data.active;
              if (data.hasMcp !== undefined) agent.hasMcp = data.hasMcp;
              if (data.hasA2a !== undefined) agent.hasA2a = data.hasA2a;
              if (data.x402Support !== undefined) agent.x402Support = data.x402Support;
            }
          }
        } catch (error) {
          console.warn('Trending: Qdrant enrichment failed:', error);
        }
      }

      return {
        agents,
        period,
        generatedAt,
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
