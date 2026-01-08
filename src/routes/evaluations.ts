/**
 * Evaluations CRUD endpoint
 * @module routes/evaluations
 *
 * Provides listing, detail view, and queuing for agent evaluations.
 * Evaluations verify agent capabilities through benchmark testing.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  evaluationsQuerySchema,
  parseAgentId,
  queueEvaluationSchema,
} from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import {
  getEvaluationById,
  getEvaluationsPaginated,
  getQueueStats,
  hasQueuedEvaluation,
  queueEvaluation,
} from '@/services/evaluator';
import type { Env, Variables } from '@/types';

const evaluations = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
evaluations.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/evaluations
 * List all evaluations with optional filters
 */
evaluations.get('/', async (c) => {
  const rawQuery = c.req.query();
  const rawQueries = c.req.queries();

  // Handle array params (chainIds[]=X&chainIds[]=Y)
  if (rawQueries['chainIds[]'] && rawQueries['chainIds[]'].length > 1) {
    (rawQuery as Record<string, unknown>)['chainIds[]'] = rawQueries['chainIds[]'];
  }

  // Validate query params
  const queryResult = evaluationsQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.issues[0]?.message ?? 'Invalid query');
  }

  const query = queryResult.data;

  // Check cache
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.EVALUATIONS);
  const cacheKey = cache.generateKey(CACHE_KEYS.evaluations(''), query);

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

  // Fetch evaluations and queue stats in parallel
  const [evaluationsResult, queueStats] = await Promise.all([
    getEvaluationsPaginated(c.env.DB, {
      agentId: query.agentId,
      chainIds,
      status: query.status,
      minScore: query.minScore,
      maxScore: query.maxScore,
      limit: query.limit,
      offset,
    }),
    getQueueStats(c.env.DB),
  ]);

  // Calculate pagination
  const hasMore = offset + evaluationsResult.evaluations.length < evaluationsResult.total;
  let nextCursor: string | undefined;
  if (hasMore) {
    const nextOffset = offset + query.limit;
    nextCursor = Buffer.from(JSON.stringify({ _global_offset: nextOffset })).toString('base64url');
  }

  const response = {
    success: true as const,
    data: evaluationsResult.evaluations,
    meta: {
      total: evaluationsResult.total,
      hasMore,
      nextCursor,
      queue: queueStats,
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.EVALUATIONS);

  return c.json(response);
});

/**
 * POST /api/v1/evaluations
 * Queue a new evaluation for an agent
 */
evaluations.post('/', async (c) => {
  // Parse request body
  let body: ReturnType<typeof queueEvaluationSchema.parse>;
  try {
    const rawBody = await c.req.json();
    body = queueEvaluationSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errors.validationError(c, error.issues[0]?.message ?? 'Invalid request body');
    }
    return errors.badRequest(c, 'Invalid JSON body');
  }

  // Parse and validate agent ID
  let chainId: number;
  try {
    const parsed = parseAgentId(body.agentId);
    chainId = parsed.chainId;
  } catch {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  // Check if agent already has a pending evaluation
  if (!body.force) {
    const hasPending = await hasQueuedEvaluation(c.env.DB, body.agentId);
    if (hasPending) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ALREADY_QUEUED',
            message: 'Agent already has a pending evaluation. Use force=true to queue anyway.',
          },
        },
        409
      );
    }
  }

  // Queue the evaluation
  const queueItem = await queueEvaluation(c.env.DB, body.agentId, chainId, {
    skills: body.skills,
    priority: body.priority,
  });

  // Send to queue for processing
  try {
    await c.env.EVALUATION_QUEUE?.send({
      queueItemId: queueItem.id,
      agentId: body.agentId,
      chainId,
      skills: body.skills ?? [],
    });
  } catch (error) {
    console.error('Failed to send to evaluation queue:', error);
    // Continue even if queue send fails - item is in DB and can be processed later
  }

  return c.json(
    {
      success: true,
      data: queueItem,
      message: 'Evaluation queued successfully',
    },
    202
  );
});

/**
 * GET /api/v1/evaluations/:id
 * Get single evaluation by ID
 */
evaluations.get('/:id', async (c) => {
  const id = c.req.param('id');

  // Check cache
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.EVALUATION_DETAIL);
  const cacheKey = CACHE_KEYS.evaluationDetail(id);

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const evaluation = await getEvaluationById(c.env.DB, id);

  if (!evaluation) {
    return errors.notFound(c, 'Evaluation');
  }

  const response = {
    success: true as const,
    data: evaluation,
  };

  // Cache completed evaluations longer
  const ttl = evaluation.status === 'completed' ? CACHE_TTL.EVALUATION_DETAIL : 30;
  await cache.set(cacheKey, response, ttl);

  return c.json(response);
});

export { evaluations };
