/**
 * Reputation endpoints
 * @module routes/reputation
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { createReputationService } from '@/services/reputation';
import type { Env, ReputationResponse, Variables } from '@/types';

const reputation = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
reputation.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/agents/:agentId/reputation
 * Get reputation and recent feedback for an agent
 */
reputation.get('/', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const reputationService = createReputationService(c.env.DB);

  const [agentReputation, recentFeedback] = await Promise.all([
    reputationService.getAgentReputation(agentId),
    reputationService.getAgentFeedback(agentId, 10),
  ]);

  const response: ReputationResponse = {
    success: true,
    data: {
      agentId,
      reputation: agentReputation ?? {
        count: 0,
        averageScore: 0,
        distribution: { low: 0, medium: 0, high: 0 },
      },
      recentFeedback,
    },
  };

  return c.json(response);
});

/**
 * GET /api/v1/agents/:agentId/reputation/feedback
 * Get paginated feedback list for an agent
 */
reputation.get('/feedback', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const limitParam = c.req.query('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;

  // Validate limit
  const validLimit = Math.min(Math.max(1, limit), 100);

  const reputationService = createReputationService(c.env.DB);
  const feedback = await reputationService.getAgentFeedback(agentId, validLimit);

  return c.json({
    success: true,
    data: feedback,
    meta: {
      total: feedback.length,
      limit: validLimit,
    },
  });
});

export { reputation };
