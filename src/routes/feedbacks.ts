/**
 * Global feedbacks endpoint
 * @module routes/feedbacks
 */

import { Hono } from 'hono';
import { getAllFeedbacksPaginated, getFeedbackStats, type ScoreCategory } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { feedbacksQuerySchema } from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import type { Env, Variables } from '@/types';

const feedbacks = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
feedbacks.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Convert database feedback row to API response format
 */
function transformFeedback(row: {
  id: string;
  agent_id: string;
  chain_id: number;
  score: number;
  tags: string;
  context: string | null;
  feedback_uri: string | null;
  submitter: string;
  eas_uid: string | null;
  tx_id: string | null;
  feedback_index: number | null;
  endpoint: string | null;
  submitted_at: string;
}): {
  id: string;
  agentId: string;
  score: number;
  tags: string[];
  context?: string;
  submitter: string;
  timestamp: string;
  chainId: number;
  txHash?: string;
  /** Per-client feedback index (ERC-8004 v1.0) */
  feedbackIndex?: number;
  /** Service endpoint reference (ERC-8004 v1.0) */
  endpoint?: string;
} {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    // Ignore parse errors, use empty array
  }

  return {
    id: row.id,
    agentId: row.agent_id,
    score: row.score,
    tags,
    context: row.context ?? undefined,
    submitter: row.submitter,
    timestamp: row.submitted_at,
    chainId: row.chain_id,
    txHash: row.tx_id ?? undefined,
    feedbackIndex: row.feedback_index ?? undefined,
    endpoint: row.endpoint ?? undefined,
  };
}

/**
 * GET /api/v1/feedbacks
 * Get all feedbacks across all agents with pagination and filtering
 */
feedbacks.get('/', async (c) => {
  const rawQuery = c.req.query();
  const rawQueries = c.req.queries();

  // Handle array params (chainIds[]=X&chainIds[]=Y)
  if (rawQueries['chainIds[]'] && rawQueries['chainIds[]'].length > 1) {
    (rawQuery as Record<string, unknown>)['chainIds[]'] = rawQueries['chainIds[]'];
  }

  // Validate query params
  const queryResult = feedbacksQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.issues[0]?.message ?? 'Invalid query');
  }

  const query = queryResult.data;

  // Check cache
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.FEEDBACKS_GLOBAL);
  const cacheKey = cache.generateKey(CACHE_KEYS.feedbacksGlobal(''), query);

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
      const decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf-8')) as {
        _global_offset?: number;
      };
      offset = decoded._global_offset ?? 0;
    } catch {
      // Invalid cursor, use default offset
    }
  }

  // Fetch feedbacks and stats in parallel
  const [feedbacksResult, stats] = await Promise.all([
    getAllFeedbacksPaginated(c.env.DB, {
      chainIds,
      scoreCategory: query.scoreCategory as ScoreCategory | undefined,
      limit: query.limit,
      offset,
    }),
    getFeedbackStats(c.env.DB, chainIds),
  ]);

  // Transform feedbacks
  const transformedFeedbacks = feedbacksResult.feedbacks.map(transformFeedback);

  // Calculate pagination
  const hasMore = offset + transformedFeedbacks.length < feedbacksResult.total;
  let nextCursor: string | undefined;
  if (hasMore) {
    const nextOffset = offset + query.limit;
    nextCursor = Buffer.from(JSON.stringify({ _global_offset: nextOffset })).toString('base64url');
  }

  const response = {
    success: true as const,
    data: transformedFeedbacks,
    meta: {
      total: feedbacksResult.total,
      hasMore,
      nextCursor,
      stats: {
        positive: stats.positive,
        neutral: stats.neutral,
        negative: stats.negative,
      },
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.FEEDBACKS_GLOBAL);

  return c.json(response);
});

export { feedbacks };
