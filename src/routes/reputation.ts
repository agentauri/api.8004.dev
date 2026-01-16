/**
 * Reputation endpoints
 * @module routes/reputation
 */

import { Hono } from 'hono';
import { getDetailedScoreDistribution } from '@/db/queries';
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

  const [agentReputation, recentFeedback, detailedDistribution] = await Promise.all([
    reputationService.getAgentReputation(agentId),
    reputationService.getAgentFeedback(agentId, 10),
    getDetailedScoreDistribution(c.env.DB, agentId),
  ]);

  const response: ReputationResponse = {
    success: true,
    data: {
      agentId,
      reputation: agentReputation
        ? {
            ...agentReputation,
            detailedDistribution,
          }
        : {
            count: 0,
            averageScore: 0,
            distribution: { low: 0, medium: 0, high: 0 },
            detailedDistribution: {
              veryLow: 0,
              low: 0,
              medium: 0,
              high: 0,
              veryHigh: 0,
            },
          },
      recentFeedback,
    },
  };

  return c.json(response);
});

/**
 * GET /api/v1/agents/:agentId/reputation/history
 * Get reputation history over time for an agent
 * Query params:
 * - period: 7d, 30d, 90d, 1y (default: 30d)
 */
reputation.get('/history', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const periodParam = c.req.query('period') ?? '30d';
  const validPeriods = ['7d', '30d', '90d', '1y'];

  if (!validPeriods.includes(periodParam)) {
    return errors.validationError(c, `Invalid period. Must be one of: ${validPeriods.join(', ')}`);
  }

  // Calculate date range based on period
  const now = new Date();
  let startDate: Date;
  switch (periodParam) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const reputationService = createReputationService(c.env.DB);
  const history = await reputationService.getReputationHistory(
    agentId,
    startDate.toISOString().split('T')[0] ?? '',
    now.toISOString().split('T')[0] ?? ''
  );

  return c.json({
    success: true,
    data: history,
    meta: {
      agentId,
      period: periodParam,
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      dataPoints: history.length,
    },
  });
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
