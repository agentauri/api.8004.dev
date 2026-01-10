/**
 * Leaderboard service for ranking agents by reputation
 * @module services/leaderboard
 */

import { getAgentsRankedByReputation, getReputationAtDate } from '@/db/queries';
import type { Env } from '@/types';

/**
 * Trend direction type (matches FE BackendLeaderboardEntry)
 */
export type LeaderboardTrend = 'up' | 'down' | 'stable';

/**
 * Leaderboard entry for API response
 * Matches FE BackendLeaderboardEntry interface
 */
export interface LeaderboardEntry {
  /** Agent identifier (format: "chainId:tokenId") */
  agentId: string;
  /** Chain ID */
  chainId: number;
  /** Token ID */
  tokenId: string;
  /** Agent display name */
  name: string;
  /** Agent description */
  description: string;
  /** Agent image URL */
  image?: string;
  /** Reputation score (0-100) */
  score: number;
  /** Number of feedback entries */
  feedbackCount: number;
  /** Reputation trend direction */
  trend: LeaderboardTrend;
  /** Whether agent is active */
  active: boolean | null;
  /** MCP protocol support */
  hasMcp: boolean | null;
  /** A2A protocol support */
  hasA2a: boolean | null;
  /** x402 payment support */
  x402Support: boolean | null;
  /** Registration timestamp */
  registeredAt?: string;
}

/**
 * Leaderboard result
 */
export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
  period: 'all' | '30d' | '7d' | '24h';
  generatedAt: string;
}

/**
 * Leaderboard query parameters
 */
export interface LeaderboardQueryParams {
  period: 'all' | '30d' | '7d' | '24h';
  chainIds?: number[];
  mcp?: boolean;
  a2a?: boolean;
  x402?: boolean;
  limit: number;
  offset: number;
}

/**
 * Qdrant payload structure for agent data
 */
interface QdrantAgentPayload {
  name?: string;
  description?: string;
  image?: string;
  active?: boolean;
  hasMcp?: boolean;
  hasA2a?: boolean;
  x402Support?: boolean;
  registeredAt?: string;
  createdAt?: string;
}

/**
 * Get date string for period calculation
 */
function getDateForPeriod(period: '30d' | '7d' | '24h'): string {
  const now = new Date();
  switch (period) {
    case '24h':
      now.setDate(now.getDate() - 1);
      break;
    case '7d':
      now.setDate(now.getDate() - 7);
      break;
    case '30d':
      now.setDate(now.getDate() - 30);
      break;
  }
  return now.toISOString().split('T')[0] as string;
}

/**
 * Calculate trend by comparing current vs previous score
 * Returns 'stable' for new agents (FE expects only 'up' | 'down' | 'stable')
 */
function calculateTrend(currentScore: number, previousScore: number | undefined): LeaderboardTrend {
  if (previousScore === undefined) {
    return 'stable'; // New agents show as stable
  }
  const diff = currentScore - previousScore;
  if (Math.abs(diff) < 1) {
    return 'stable';
  }
  return diff > 0 ? 'up' : 'down';
}

/**
 * Leaderboard service interface
 */
export interface LeaderboardService {
  /**
   * Get leaderboard entries
   */
  getLeaderboard(params: LeaderboardQueryParams): Promise<LeaderboardResult>;
}

/**
 * Create leaderboard service
 */
export function createLeaderboardService(env: Env): LeaderboardService {
  return {
    async getLeaderboard(params: LeaderboardQueryParams): Promise<LeaderboardResult> {
      const { period, chainIds, limit, offset } = params;

      // Query reputation data sorted by score
      const { agents: reputations, total } = await getAgentsRankedByReputation(env.DB, {
        chainIds,
        limit,
        offset,
      });

      // Get historical data for trend calculation (if not 'all' period)
      let previousScores: Map<string, { score: number; feedbackCount: number }> | undefined;
      if (period !== 'all') {
        const previousDate = getDateForPeriod(period);
        previousScores = await getReputationAtDate(env.DB, previousDate);
      }

      // Build initial entries with basic data
      const entries: LeaderboardEntry[] = reputations.map((rep) => {
        const [chainIdStr, tokenId] = rep.agent_id.split(':');
        const chainId = Number.parseInt(chainIdStr ?? '0', 10);

        const previousData = previousScores?.get(rep.agent_id);
        const trend = calculateTrend(rep.average_score, previousData?.score);

        return {
          agentId: rep.agent_id,
          chainId,
          tokenId: tokenId ?? '0',
          name: `Agent #${tokenId}`,
          description: '',
          image: undefined,
          score: Math.round(rep.average_score * 100) / 100,
          feedbackCount: rep.feedback_count,
          trend,
          active: null,
          hasMcp: null,
          hasA2a: null,
          x402Support: null,
          registeredAt: undefined,
        };
      });

      // Enrich with agent data from Qdrant
      if (env.QDRANT_URL && env.QDRANT_API_KEY && entries.length > 0) {
        try {
          const { createQdrantClient } = await import('./qdrant');
          const qdrant = createQdrantClient({
            QDRANT_URL: env.QDRANT_URL,
            QDRANT_API_KEY: env.QDRANT_API_KEY,
            QDRANT_COLLECTION: env.QDRANT_COLLECTION || 'agents',
          });

          const agentIds = entries.map((e) => e.agentId);
          const points = await qdrant.getByIds(agentIds);

          // Create lookup map
          const agentDataMap = new Map(
            points.map((p) => [p.id as string, p.payload as QdrantAgentPayload])
          );

          // Enrich entries with Qdrant data
          for (const entry of entries) {
            const data = agentDataMap.get(entry.agentId);
            if (data) {
              if (data.name) entry.name = data.name;
              if (data.description) entry.description = data.description;
              if (data.image) entry.image = data.image;
              if (data.active !== undefined) entry.active = data.active;
              if (data.hasMcp !== undefined) entry.hasMcp = data.hasMcp;
              if (data.hasA2a !== undefined) entry.hasA2a = data.hasA2a;
              if (data.x402Support !== undefined) entry.x402Support = data.x402Support;
              // Use registeredAt or fallback to createdAt
              entry.registeredAt = data.registeredAt ?? data.createdAt;
            }
          }
        } catch (error) {
          // Qdrant enrichment failed, continue with basic data
          console.warn('Leaderboard: Qdrant enrichment failed:', error);
        }
      }

      // Calculate pagination
      const hasMore = offset + entries.length < total;
      let nextCursor: string | undefined;
      if (hasMore) {
        const nextOffset = offset + limit;
        nextCursor = Buffer.from(JSON.stringify({ _global_offset: nextOffset })).toString('base64url');
      }

      return {
        entries,
        total,
        limit,
        hasMore,
        nextCursor,
        period,
        generatedAt: new Date().toISOString(),
      };
    },
  };
}
