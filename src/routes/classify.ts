/**
 * Classification endpoints
 * @module routes/classify
 */

import { Hono } from 'hono';
import { enqueueClassification, getClassification, getQueueStatus } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { classifyRequestSchema, parseClassificationRow } from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import type {
  ClassificationPendingResponse,
  ClassificationQueuedResponse,
  ClassificationResponse,
  Env,
  Variables,
} from '@/types';

const classify = new Hono<{ Bindings: Env; Variables: Variables }>();

// Stricter rate limit for classification endpoints
classify.use('*', rateLimit(rateLimitConfigs.classification));

/**
 * GET /api/v1/agents/:agentId/classify
 * Get classification for an agent
 */
classify.get('/', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const cache = createCacheService(c.env.CACHE, CACHE_TTL.CLASSIFICATION);
  const cacheKey = CACHE_KEYS.classification(agentId);

  // Check cache first
  const cached = await cache.get<ClassificationResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Check database
  const classificationRow = await getClassification(c.env.DB, agentId);
  const parsed = parseClassificationRow(classificationRow);
  if (parsed) {
    const response: ClassificationResponse = {
      success: true,
      data: parsed,
    };

    // Cache the result
    await cache.set(cacheKey, response, CACHE_TTL.CLASSIFICATION);
    return c.json(response);
  }

  // Check if classification is in progress
  const queueStatus = await getQueueStatus(c.env.DB, agentId);
  if (queueStatus && (queueStatus.status === 'pending' || queueStatus.status === 'processing')) {
    const response: ClassificationPendingResponse = {
      success: true,
      status: queueStatus.status,
      estimatedTime: 30,
    };
    return c.json(response, 202);
  }

  // No classification found
  return errors.notFound(c, 'Classification');
});

/**
 * POST /api/v1/agents/:agentId/classify
 * Request classification for an agent
 */
classify.post('/', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  // Parse request body
  let body: { force: boolean };
  try {
    const rawBody = await c.req.json();
    body = classifyRequestSchema.parse(rawBody);
  } catch {
    body = { force: false };
  }

  // Check if already classified (unless force)
  if (!body.force) {
    const existingClassification = await getClassification(c.env.DB, agentId);
    if (existingClassification) {
      const response: ClassificationQueuedResponse = {
        success: true,
        status: 'already_classified',
        agentId,
      };
      return c.json(response);
    }
  }

  // Check if already queued
  const queueStatus = await getQueueStatus(c.env.DB, agentId);
  if (queueStatus && (queueStatus.status === 'pending' || queueStatus.status === 'processing')) {
    const response: ClassificationPendingResponse = {
      success: true,
      status: queueStatus.status,
      estimatedTime: 30,
    };
    return c.json(response, 202);
  }

  // Record in database queue first (before sending to queue)
  // This prevents race condition where queue processes before DB record exists
  await enqueueClassification(c.env.DB, agentId);

  // Queue the classification job
  await c.env.CLASSIFICATION_QUEUE.send({
    agentId,
    force: body.force,
  });

  // Invalidate cache if force re-classification
  if (body.force) {
    const cache = createCacheService(c.env.CACHE, CACHE_TTL.CLASSIFICATION);
    await cache.delete(CACHE_KEYS.classification(agentId));
  }

  const response: ClassificationQueuedResponse = {
    success: true,
    status: 'queued',
    agentId,
  };
  return c.json(response, 202);
});

export { classify };
