/**
 * Chains endpoint
 * @module routes/chains
 */

import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createSDKService } from '@/services/sdk';
import type { ChainStatsResponse, Env, Variables } from '@/types';
import { Hono } from 'hono';

const chains = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
chains.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/chains
 * Get statistics for all supported chains
 */
chains.get('/', async (c) => {
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.CHAIN_STATS);
  const cacheKey = CACHE_KEYS.chainStats();

  // Check cache
  const cached = await cache.get<ChainStatsResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Fetch chain stats
  const sdk = createSDKService(c.env);
  const stats = await sdk.getChainStats();

  const response: ChainStatsResponse = {
    success: true,
    data: stats,
  };

  await cache.set(cacheKey, response, CACHE_TTL.CHAIN_STATS);
  return c.json(response);
});

export { chains };
