/**
 * Taxonomy endpoint
 * @module routes/taxonomy
 */

import { Hono } from 'hono';
import { getTaxonomy } from '@/lib/oasf/taxonomy';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { taxonomyQuerySchema } from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import type { Env, TaxonomyResponse, Variables } from '@/types';

const taxonomy = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
taxonomy.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/taxonomy
 * Get OASF taxonomy tree
 */
taxonomy.get('/', async (c) => {
  // Parse and validate query parameters
  const rawQuery = c.req.query();
  const queryResult = taxonomyQuerySchema.safeParse(rawQuery);

  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.issues[0]?.message ?? 'Invalid query');
  }

  const query = queryResult.data;
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.TAXONOMY);
  const cacheKey = CACHE_KEYS.taxonomy(query.type);

  // Check cache
  const cached = await cache.get<TaxonomyResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Get taxonomy data
  const taxonomyData = getTaxonomy(query.type);

  const response: TaxonomyResponse = {
    success: true,
    data: taxonomyData,
  };

  await cache.set(cacheKey, response, CACHE_TTL.TAXONOMY);
  return c.json(response);
});

export { taxonomy };
