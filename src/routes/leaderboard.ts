/**
 * Leaderboard endpoint
 * @module routes/leaderboard
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { leaderboardQuerySchema } from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createLeaderboardService } from '@/services/leaderboard';
import type { Env, Variables } from '@/types';

const leaderboard = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
leaderboard.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/leaderboard
 * Get agents ranked by reputation score
 */
leaderboard.get('/', async (c) => {
  const rawQuery = c.req.query();
  const rawQueries = c.req.queries();

  // Handle array params (chainIds[]=X&chainIds[]=Y)
  if (rawQueries['chainIds[]'] && rawQueries['chainIds[]'].length > 1) {
    (rawQuery as Record<string, unknown>)['chainIds[]'] = rawQueries['chainIds[]'];
  }

  // Validate query params
  const queryResult = leaderboardQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.issues[0]?.message ?? 'Invalid query');
  }

  const query = queryResult.data;

  // Check cache
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.LEADERBOARD);
  const cacheKey = cache.generateKey(CACHE_KEYS.leaderboard(query.period), query);

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Resolve chain IDs
  const chainIds = query['chainIds[]'] ?? query.chainIds;

  // Calculate offset from cursor or offset param
  let offset = query.offset ?? 0;
  if (query.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(query.cursor, 'base64').toString('utf-8')) as {
        _global_offset?: number;
      };
      offset = decoded._global_offset ?? 0;
    } catch {
      // Invalid cursor, use default offset
    }
  }

  // Get leaderboard data
  const service = createLeaderboardService(c.env);
  const result = await service.getLeaderboard({
    period: query.period,
    chainIds,
    mcp: query.mcp,
    a2a: query.a2a,
    x402: query.x402,
    limit: query.limit,
    offset,
  });

  const response = {
    success: true as const,
    data: result.entries,
    meta: {
      total: result.total,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      period: result.period,
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.LEADERBOARD);

  return c.json(response);
});

export { leaderboard };
