/**
 * Chains endpoint
 * @module routes/chains
 */

import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createSDKService } from '@/services/sdk';
import type { ChainStats, ChainStatsResponse, Env, Variables } from '@/types';
import { Hono } from 'hono';

/** Extended TTL for fallback cache (1 hour) - used when SDK fails */
const FALLBACK_CACHE_TTL = 3600;

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

  // Check if any chain has errors and try to recover from fallback cache
  const hasErrors = stats.some((s) => s.status === 'error');
  let finalStats = stats;

  if (hasErrors) {
    // Try to recover failed chains from fallback cache
    const recoveredStats = await Promise.all(
      stats.map(async (stat) => {
        if (stat.status === 'error') {
          const fallbackKey = CACHE_KEYS.chainStatsFallback(stat.chainId);
          const fallback = await cache.get<ChainStats>(fallbackKey);
          if (fallback) {
            console.info(`Using fallback cache for chain ${stat.chainId}`);
            return { ...fallback, status: 'cached' as const };
          }
        }
        return stat;
      })
    );
    finalStats = recoveredStats;
  }

  // Store successful stats in fallback cache for future use
  await Promise.all(
    finalStats.map(async (stat) => {
      if (stat.status === 'ok') {
        const fallbackKey = CACHE_KEYS.chainStatsFallback(stat.chainId);
        await cache.set(fallbackKey, stat, FALLBACK_CACHE_TTL);
      }
    })
  );

  const response: ChainStatsResponse = {
    success: true,
    data: finalStats,
  };

  // Only cache the full response if all chains succeeded
  if (!hasErrors) {
    await cache.set(cacheKey, response, CACHE_TTL.CHAIN_STATS);
  }

  return c.json(response);
});

export { chains };
