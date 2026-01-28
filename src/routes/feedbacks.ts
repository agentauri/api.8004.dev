/**
 * Global feedbacks endpoint
 * @module routes/feedbacks
 */

import { Hono } from 'hono';
import { getAllFeedbacksPaginated, getFeedbackStats, type ScoreCategory } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { feedbacksQuerySchema, validateAndParseAgentId } from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import {
  buildSubgraphUrls,
  fetchFeedbackResponsesFromSubgraph,
  type SubgraphFeedbackResponse,
} from '@/services/sdk';
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
  } catch (error) {
    // Log parse errors for debugging data quality issues
    console.warn(
      `transformFeedback: Invalid tags JSON for feedback ${row.id}:`,
      row.tags?.substring(0, 100),
      error instanceof Error ? error.message : String(error)
    );
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

  // Handle array params (chainIds[]=X&chainIds[]=Y, reviewers[]=X, agentIds[]=X)
  if (rawQueries['chainIds[]'] && rawQueries['chainIds[]'].length > 1) {
    (rawQuery as Record<string, unknown>)['chainIds[]'] = rawQueries['chainIds[]'];
  }
  if (rawQueries['reviewers[]'] && rawQueries['reviewers[]'].length > 1) {
    (rawQuery as Record<string, unknown>)['reviewers[]'] = rawQueries['reviewers[]'];
  }
  if (rawQueries['agentIds[]'] && rawQueries['agentIds[]'].length > 1) {
    (rawQuery as Record<string, unknown>)['agentIds[]'] = rawQueries['agentIds[]'];
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
  // Resolve reviewers
  const reviewers = query['reviewers[]'] ?? query.reviewers;
  // Resolve agentIds
  const agentIds = query['agentIds[]'] ?? query.agentIds;

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
      reviewers,
      agentIds,
      feedbackIndex: query.feedbackIndex,
      limit: query.limit,
      offset,
    }),
    getFeedbackStats(c.env.DB, chainIds),
  ]);

  // Transform feedbacks
  const transformedFeedbacks = feedbacksResult.feedbacks.map(transformFeedback);

  // Enrich with agent names from Qdrant
  let enrichmentFailed = false;
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
      // Qdrant enrichment failed, continue with default names but flag it
      enrichmentFailed = true;
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
      enrichmentStatus: enrichmentFailed ? ('partial' as const) : ('complete' as const),
    },
    stats: {
      total: feedbacksResult.total,
      positive: stats.positive,
      neutral: stats.neutral,
      negative: stats.negative,
    },
    warnings: enrichmentFailed
      ? ['Agent names may be incomplete due to Qdrant unavailability']
      : undefined,
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.FEEDBACKS_GLOBAL);

  return c.json(response);
});

/**
 * Feedback response entry in API format
 */
interface FeedbackResponseEntry {
  id: string;
  responder: string;
  responseUri?: string;
  responseHash?: string;
  createdAt: string;
}

/**
 * Transform subgraph feedback response to API format
 */
function transformFeedbackResponse(response: SubgraphFeedbackResponse): FeedbackResponseEntry {
  return {
    id: response.id,
    responder: response.responder,
    responseUri: response.responseUri ?? undefined,
    responseHash: response.responseHash ?? undefined,
    createdAt: new Date(Number.parseInt(response.createdAt, 10) * 1000).toISOString(),
  };
}

/**
 * GET /api/v1/feedbacks/:feedbackId/responses
 * Get responses for a specific feedback entry
 *
 * Feedback responses are submitted via the appendResponse() function
 * in the ReputationRegistry contract.
 *
 * Note: feedbackId format is typically "chainId:tokenId:feedbackIndex" or similar
 * depending on how the subgraph constructs feedback IDs.
 */
feedbacks.get('/:feedbackId/responses', async (c) => {
  const feedbackId = c.req.param('feedbackId');

  if (!feedbackId) {
    return errors.validationError(c, 'Feedback ID is required');
  }

  // Validate feedbackId format: should be "chainId:agentId:..." with at least 2 parts
  // and chainId must be a valid number
  if (!/^\d+:.+/.test(feedbackId)) {
    return errors.validationError(
      c,
      'Invalid feedback ID format. Expected: chainId:agentId:clientAddress:feedbackIndex'
    );
  }

  // Extract chainId from feedbackId
  // Feedback IDs are typically formatted as "chainId:agentId:clientAddress:feedbackIndex"
  // We need the chainId to know which subgraph to query
  const parts = feedbackId.split(':');
  const chainIdStr = parts[0];
  if (!chainIdStr) {
    return errors.validationError(c, 'Invalid feedback ID format');
  }

  const chainId = Number.parseInt(chainIdStr, 10);
  if (Number.isNaN(chainId)) {
    return errors.validationError(c, 'Invalid chain ID in feedback ID');
  }

  // Fetch responses from subgraph
  const subgraphUrls = c.env.GRAPH_API_KEY ? buildSubgraphUrls(c.env.GRAPH_API_KEY) : {};
  const subgraphResponses = await fetchFeedbackResponsesFromSubgraph(
    chainId,
    feedbackId,
    subgraphUrls
  );

  const responses = subgraphResponses.map(transformFeedbackResponse);

  return c.json({
    success: true,
    data: {
      feedbackId,
      responses,
      count: responses.length,
    },
  });
});

export { feedbacks };
