/**
 * Platform statistics endpoint
 * @module routes/stats
 */

import { Hono } from 'hono';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createSDKService } from '@/services/sdk';
import type { Env, PlatformStatsResponse, Variables } from '@/types';

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

  // Check if any chain has errors - don't cache stale data
  const hasErrors = chainStats.some((chain) => chain.status === 'error');

  // Aggregate totals
  const totalAgents = chainStats.reduce((sum, chain) => sum + chain.totalCount, 0);
  const withRegistrationFile = chainStats.reduce(
    (sum, chain) => sum + chain.withRegistrationFileCount,
    0
  );
  const activeAgents = chainStats.reduce((sum, chain) => sum + chain.activeCount, 0);

  const response: PlatformStatsResponse = {
    success: true,
    data: {
      totalAgents,
      withRegistrationFile,
      activeAgents,
      chainBreakdown: chainStats,
    },
  };

  // Only cache if all chains succeeded
  if (!hasErrors) {
    await cache.set(cacheKey, response, CACHE_TTL.PLATFORM_STATS);
  }
  return c.json(response);
});

export { stats };
