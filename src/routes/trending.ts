/**
 * Trending agents endpoint
 * @module routes/trending
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { trendingQuerySchema } from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createTrendingService } from '@/services/trending';
import type { Env, Variables } from '@/types';

const trending = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
trending.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/trending
 * Get agents with highest reputation changes in the specified period
 */
trending.get('/', async (c) => {
  // Validate query params
  const queryResult = trendingQuerySchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.issues[0]?.message ?? 'Invalid query');
  }

  const query = queryResult.data;

  // Check cache
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.TRENDING);
  const cacheKey = CACHE_KEYS.trending(query.period);

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Get trending data
  const service = createTrendingService(c.env);
  const result = await service.getTrending({
    period: query.period,
    limit: query.limit,
  });

  // Response structure matches FE BackendTrendingResponse
  const response = {
    success: true as const,
    data: {
      agents: result.agents,
      period: result.period,
      generatedAt: result.generatedAt,
      nextRefreshAt: result.nextRefreshAt,
    },
    meta: {
      dataAvailable: result.dataAvailable,
      message: result.message,
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.TRENDING);

  return c.json(response);
});

export { trending };
