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
 * Database feedback row type
 */
interface FeedbackRow {
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
}

/**
 * Transformed feedback for API response
 * Matches FE BackendGlobalFeedback interface
 */
interface TransformedFeedback {
  /** Feedback ID */
  id: string;
  /** Numeric score (0-100) */
  score: number;
  /** Feedback tags */
  tags: string[];
  /** Optional context/comment */
  context?: string;
  /** Submitter wallet address */
  submitter: string;
  /** Submission timestamp */
  submittedAt: string;
  /** Transaction hash */
  txHash?: string;
  /** EAS attestation UID */
  easUid?: string;
  /** Agent ID (format: chainId:tokenId) */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** Agent chain ID */
  agentChainId: number;
  /** Per-client feedback index (ERC-8004 v1.0) */
  feedbackIndex?: number;
  /** Service endpoint reference (ERC-8004 v1.0) */
  endpoint?: string;
}

/**
 * Convert database feedback row to API response format
 */
function transformFeedback(row: FeedbackRow): TransformedFeedback {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    // Ignore parse errors, use empty array
  }

  // Extract tokenId from agent_id for default name
  const [, tokenId] = row.agent_id.split(':');

  return {
    id: row.id,
    score: row.score,
    tags,
    context: row.context ?? undefined,
    submitter: row.submitter,
    submittedAt: row.submitted_at,
    txHash: row.tx_id ?? undefined,
    easUid: row.eas_uid ?? undefined,
    agentId: row.agent_id,
    agentName: `Agent #${tokenId ?? '0'}`,
    agentChainId: row.chain_id,
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

  // Enrich with agent names from Qdrant
  if (c.env.QDRANT_URL && c.env.QDRANT_API_KEY && transformedFeedbacks.length > 0) {
    try {
      const { createQdrantClient } = await import('@/services/qdrant');
      const qdrant = createQdrantClient({
        QDRANT_URL: c.env.QDRANT_URL,
        QDRANT_API_KEY: c.env.QDRANT_API_KEY,
        QDRANT_COLLECTION: c.env.QDRANT_COLLECTION || 'agents',
      });

      // Get unique agent IDs
      const uniqueAgentIds = [...new Set(transformedFeedbacks.map((f) => f.agentId))];
      const points = await qdrant.getByIds(uniqueAgentIds);

      // Create lookup map
      const agentNameMap = new Map(
        points.map((p) => [p.id as string, (p.payload as { name?: string })?.name])
      );

      // Enrich feedbacks with agent names
      for (const feedback of transformedFeedbacks) {
        const name = agentNameMap.get(feedback.agentId);
        if (name) {
          feedback.agentName = name;
        }
      }
    } catch (error) {
      // Qdrant enrichment failed, continue with default names
      console.warn('Feedbacks: Qdrant enrichment failed:', error);
    }
  }

  // Calculate pagination
  const hasMore = offset + transformedFeedbacks.length < feedbacksResult.total;
  let nextCursor: string | undefined;
  if (hasMore) {
    const nextOffset = offset + query.limit;
    nextCursor = Buffer.from(JSON.stringify({ _global_offset: nextOffset })).toString('base64url');
  }

  // Response structure matches FE BackendGlobalFeedbacksResponse
  const response = {
    success: true as const,
    data: transformedFeedbacks,
    meta: {
      total: feedbacksResult.total,
      limit: query.limit,
      hasMore,
      nextCursor,
    },
    stats: {
      total: feedbacksResult.total,
      positive: stats.positive,
      neutral: stats.neutral,
      negative: stats.negative,
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.FEEDBACKS_GLOBAL);

  return c.json(response);
});

export { feedbacks };
