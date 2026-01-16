/**
 * Platform statistics endpoint
 * @module routes/stats
 */

import { Hono } from 'hono';
import { getFeedbackStats, getTotalClassificationCount } from '@/db/queries';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import {
  buildSubgraphUrls,
  createSDKService,
  fetchProtocolStatsFromSubgraph,
} from '@/services/sdk';
import type { Env, PlatformStatsResponse, Variables } from '@/types';

const stats = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
stats.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/stats
 * Get platform-wide statistics
 *
 * Enhanced with Protocol stats from subgraph (totalValidations, unique tags)
 */
stats.get('/', async (c) => {
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.PLATFORM_STATS);
  const cacheKey = CACHE_KEYS.platformStats();

  // Check cache
  const cached = await cache.get<PlatformStatsResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Fetch chain stats and D1 counts in parallel
  const sdk = createSDKService(c.env);
  const [chainStats, feedbackStats, classificationCount] = await Promise.all([
    sdk.getChainStats(),
    getFeedbackStats(c.env.DB),
    getTotalClassificationCount(c.env.DB),
  ]);

  // Check if any chain has errors - don't cache stale data
  const hasErrors = chainStats.some((chain) => chain.status === 'error');

  // Fetch Protocol stats from subgraph for enhanced data
  const subgraphUrls = c.env.GRAPH_API_KEY ? buildSubgraphUrls(c.env.GRAPH_API_KEY) : {};
  const protocolStatsPromises = chainStats.map((chain) =>
    fetchProtocolStatsFromSubgraph(chain.chainId, subgraphUrls).catch(() => null)
  );
  const protocolStats = await Promise.all(protocolStatsPromises);

  // Aggregate totals
  const totalAgents = chainStats.reduce((sum, chain) => sum + chain.totalCount, 0);
  const withRegistrationFile = chainStats.reduce(
    (sum, chain) => sum + chain.withRegistrationFileCount,
    0
  );
  const activeAgents = chainStats.reduce((sum, chain) => sum + chain.activeCount, 0);

  // Aggregate Protocol stats (validations, tags)
  let totalValidations = 0;
  const allTags = new Set<string>();
  for (const protocol of protocolStats) {
    if (protocol) {
      totalValidations += protocol.totalValidations ?? 0;
      for (const tag of protocol.tags ?? []) {
        allTags.add(tag);
      }
    }
  }

  const response: PlatformStatsResponse = {
    success: true,
    data: {
      totalAgents,
      withRegistrationFile,
      activeAgents,
      totalFeedback: feedbackStats.total,
      totalClassifications: classificationCount,
      chainBreakdown: chainStats,
      // Enhanced stats from Protocol entity
      totalValidations,
      uniqueTags: Array.from(allTags).sort(),
    },
  };

  // Only cache if all chains succeeded
  if (!hasErrors) {
    await cache.set(cacheKey, response, CACHE_TTL.PLATFORM_STATS);
  }
  return c.json(response);
});

export { stats };
