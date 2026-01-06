/**
 * Leaderboard service for ranking agents by reputation
 * @module services/leaderboard
 */

import { getAgentsRankedByReputation, getReputationAtDate } from '@/db/queries';
import type { Env } from '@/types';

/**
 * Trend direction type
 */
export type LeaderboardTrend = 'up' | 'down' | 'stable' | 'new';

/**
 * Leaderboard entry for API response
 */
export interface LeaderboardEntry {
  rank: number;
  agent: {
    id: string;
    name: string;
    image?: string;
    chainId: number;
  };
  reputation: number;
  feedbackCount: number;
  previousRank?: number;
  trend: LeaderboardTrend;
}

/**
 * Leaderboard result
 */
export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
  period: string;
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
 */
function calculateTrend(currentScore: number, previousScore: number | undefined): LeaderboardTrend {
  if (previousScore === undefined) {
    return 'new';
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

      // Get agent details from Qdrant for names/images
      // For now, we'll use the agent_id format and extract chain info
      // In a full implementation, we would batch fetch from Qdrant
      const entries: LeaderboardEntry[] = reputations.map((rep, index) => {
        const [chainIdStr, tokenId] = rep.agent_id.split(':');
        const chainId = Number.parseInt(chainIdStr ?? '0', 10);

        const previousData = previousScores?.get(rep.agent_id);
        const trend = calculateTrend(rep.average_score, previousData?.score);

        return {
          rank: offset + index + 1,
          agent: {
            id: rep.agent_id,
            name: `Agent ${tokenId}`, // Will be enriched with Qdrant data
            chainId,
          },
          reputation: Math.round(rep.average_score * 100) / 100,
          feedbackCount: rep.feedback_count,
          trend,
        };
      });

      // Try to enrich with agent names from Qdrant
      if (env.QDRANT_URL && env.QDRANT_API_KEY) {
        try {
          const { createQdrantClient } = await import('./qdrant');
          const qdrant = createQdrantClient({
            QDRANT_URL: env.QDRANT_URL,
            QDRANT_API_KEY: env.QDRANT_API_KEY,
            QDRANT_COLLECTION: env.QDRANT_COLLECTION || 'agents',
          });

          const agentIds = entries.map((e) => e.agent.id);
          const points = await qdrant.getByIds(agentIds);

          // Create lookup map
          const agentDataMap = new Map(
            points.map((p) => [
              p.id as string,
              {
                name: (p.payload as { name?: string })?.name,
                image: (p.payload as { image?: string })?.image,
              },
            ])
          );

          // Enrich entries
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
          // Qdrant enrichment failed, continue with basic data
          console.warn('Leaderboard: Qdrant enrichment failed:', error);
        }
      }

      // Calculate pagination
      const hasMore = offset + entries.length < total;
      let nextCursor: string | undefined;
      if (hasMore) {
        const nextOffset = offset + limit;
        nextCursor = Buffer.from(JSON.stringify({ _global_offset: nextOffset })).toString('base64');
      }

      return {
        entries,
        total,
        hasMore,
        nextCursor,
        period,
      };
    },
  };
}
