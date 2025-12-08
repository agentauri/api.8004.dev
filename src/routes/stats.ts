/**
 * Platform statistics endpoint
 * @module routes/stats
 */

import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createSDKService } from '@/services/sdk';
import type { Env, PlatformStatsResponse, Variables } from '@/types';
import { Hono } from 'hono';

const stats = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
stats.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/stats
 * Get platform-wide statistics
 */
stats.get('/', async (c) => {
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.PLATFORM_STATS);
  const cacheKey = CACHE_KEYS.platformStats();

  // Check cache
  const cached = await cache.get<PlatformStatsResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Fetch chain stats and aggregate
  const sdk = createSDKService(c.env);
  const chainStats = await sdk.getChainStats();

  // Aggregate totals
  const totalAgents = chainStats.reduce((sum, chain) => sum + chain.agentCount, 0);
  const activeAgents = chainStats.reduce((sum, chain) => sum + chain.activeCount, 0);

  const response: PlatformStatsResponse = {
    success: true,
    data: {
      totalAgents,
      activeAgents,
      chainBreakdown: chainStats,
    },
  };

  await cache.set(cacheKey, response, CACHE_TTL.PLATFORM_STATS);
  return c.json(response);
});

export { stats };
