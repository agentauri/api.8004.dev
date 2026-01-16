/**
 * Tags endpoint
 * @module routes/tags
 *
 * Provides unique feedback tags across all agents
 */

import { Hono } from 'hono';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import type { Env, Variables } from '@/types';

const tags = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
tags.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Response type for tags endpoint
 */
interface TagsResponse {
  success: true;
  data: {
    tags: string[];
    count: number;
  };
}

/**
 * GET /api/v1/tags
 * Get all unique feedback tags across all agents
 *
 * Query params:
 * - chainIds[]: Filter by chain IDs (optional)
 * - limit: Maximum number of tags to return (default: 100, max: 1000)
 */
tags.get('/', async (c) => {
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.TAXONOMY);
  const chainIdsParam = c.req.queries('chainIds[]');
  const limitParam = c.req.query('limit');

  // Build cache key
  const cacheKeyParts: string[] = [];
  if (chainIdsParam && chainIdsParam.length > 0) {
    cacheKeyParts.push(`chains:${chainIdsParam.sort().join(',')}`);
  }
  if (limitParam) {
    cacheKeyParts.push(`limit:${limitParam}`);
  }
  const cacheKey = CACHE_KEYS.tags(cacheKeyParts.join(':') || 'all');

  // Check cache
  const cached = await cache.get<TagsResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Parse limit
  const limit = Math.min(Math.max(1, Number.parseInt(limitParam ?? '100', 10) || 100), 1000);

  // Parse chain IDs
  const chainIds =
    chainIdsParam && chainIdsParam.length > 0
      ? chainIdsParam.map((id) => Number.parseInt(id, 10)).filter((id) => !Number.isNaN(id))
      : null;

  // Build SQL query to get unique tags
  // Tags are stored as JSON arrays in the tags column
  let query: string;
  let params: (string | number)[] = [];

  if (chainIds && chainIds.length > 0) {
    const placeholders = chainIds.map(() => '?').join(',');
    query = `
      SELECT DISTINCT tags
      FROM agent_feedback
      WHERE chain_id IN (${placeholders})
      AND tags != '[]'
      ORDER BY submitted_at DESC
      LIMIT 5000
    `;
    params = chainIds;
  } else {
    query = `
      SELECT DISTINCT tags
      FROM agent_feedback
      WHERE tags != '[]'
      ORDER BY submitted_at DESC
      LIMIT 5000
    `;
  }

  const result = await c.env.DB.prepare(query)
    .bind(...params)
    .all<{ tags: string }>();

  // Extract unique tags from JSON arrays
  const allTags = new Set<string>();
  for (const row of result.results ?? []) {
    try {
      const parsedTags = JSON.parse(row.tags) as string[];
      for (const tag of parsedTags) {
        if (tag && typeof tag === 'string' && tag.trim()) {
          allTags.add(tag.trim());
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Convert to sorted array and apply limit
  const sortedTags = Array.from(allTags).sort();
  const limitedTags = sortedTags.slice(0, limit);

  const response: TagsResponse = {
    success: true,
    data: {
      tags: limitedTags,
      count: limitedTags.length,
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.TAXONOMY);

  return c.json(response);
});

export { tags };
