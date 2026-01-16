/**
 * Validations endpoints
 * @module routes/validations
 *
 * Fetches validation data from the subgraph
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { validateAndParseAgentId } from '@/lib/utils/validation';
import {
  buildSubgraphUrls,
  fetchAgentStatsFromSubgraph,
  fetchValidationsFromSubgraph,
  type SubgraphAgentStats,
  type SubgraphValidation,
} from '@/services/sdk';
import type { Env, Variables } from '@/types';

const validations = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
validations.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Validation record in API response format
 */
interface ValidationResponse {
  id: string;
  validatorAddress: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  tag?: string;
  requestUri?: string;
  responseUri?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transform subgraph validation to API format
 */
function transformValidation(validation: SubgraphValidation): ValidationResponse {
  return {
    id: validation.id,
    validatorAddress: validation.validatorAddress,
    status: validation.status,
    tag: validation.tag || undefined,
    requestUri: validation.requestUri || undefined,
    responseUri: validation.responseUri || undefined,
    createdAt: new Date(Number.parseInt(validation.createdAt, 10) * 1000).toISOString(),
    updatedAt: new Date(Number.parseInt(validation.updatedAt, 10) * 1000).toISOString(),
  };
}

/**
 * GET /api/v1/agents/:agentId/validations
 * Get validations for an agent
 */
validations.get('/', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const parsed = validateAndParseAgentId(agentId);
  if (!parsed) {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const limitParam = c.req.query('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;
  const validLimit = Math.min(Math.max(1, limit), 1000);

  const { chainId } = parsed;

  // Fetch validations from subgraph
  const subgraphUrls = c.env.GRAPH_API_KEY ? buildSubgraphUrls(c.env.GRAPH_API_KEY) : {};
  const subgraphValidations = await fetchValidationsFromSubgraph(
    chainId,
    agentId,
    subgraphUrls,
    validLimit
  );

  if (subgraphValidations.length === 0) {
    return c.json({
      success: true,
      data: [],
      meta: {
        total: 0,
        limit: validLimit,
      },
    });
  }

  // Calculate summary stats
  const completedCount = subgraphValidations.filter((v) => v.status === 'COMPLETED').length;
  const pendingCount = subgraphValidations.filter((v) => v.status === 'PENDING').length;
  const failedCount = subgraphValidations.filter((v) => v.status === 'FAILED').length;

  return c.json({
    success: true,
    data: subgraphValidations.map(transformValidation),
    meta: {
      total: subgraphValidations.length,
      limit: validLimit,
      summary: {
        completed: completedCount,
        pending: pendingCount,
        failed: failedCount,
      },
    },
  });
});

/**
 * GET /api/v1/agents/:agentId/validations/summary
 * Get validation summary for an agent
 * Includes AgentStats from subgraph when available (validation scores, score distribution)
 */
validations.get('/summary', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const parsed = validateAndParseAgentId(agentId);
  if (!parsed) {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const { chainId } = parsed;

  // Fetch validations and AgentStats in parallel
  const subgraphUrls = c.env.GRAPH_API_KEY ? buildSubgraphUrls(c.env.GRAPH_API_KEY) : {};
  const [subgraphValidations, agentStats] = await Promise.all([
    fetchValidationsFromSubgraph(chainId, agentId, subgraphUrls, 1000),
    fetchAgentStatsFromSubgraph(chainId, agentId, subgraphUrls),
  ]);

  const completedCount = subgraphValidations.filter((v) => v.status === 'COMPLETED').length;
  const pendingCount = subgraphValidations.filter((v) => v.status === 'PENDING').length;
  const failedCount = subgraphValidations.filter((v) => v.status === 'FAILED').length;

  // Get unique validators
  const uniqueValidators = new Set(subgraphValidations.map((v) => v.validatorAddress));

  // Get unique tags
  const uniqueTags = new Set(subgraphValidations.map((v) => v.tag).filter(Boolean));

  // Calculate validation score - prefer AgentStats if available, fallback to simple calculation
  const validationScore = agentStats?.averageValidationScore ?? (
    subgraphValidations.length > 0
      ? Math.round((completedCount / subgraphValidations.length) * 100)
      : 0
  );

  return c.json({
    success: true,
    data: {
      agentId,
      totalCount: agentStats?.totalValidations ?? subgraphValidations.length,
      completed: agentStats?.completedValidations ?? completedCount,
      pending: agentStats?.pendingValidations ?? pendingCount,
      failed: failedCount,
      uniqueValidators: agentStats?.uniqueValidators ?? uniqueValidators.size,
      tags: Array.from(uniqueTags),
      validationScore,
      // Include AgentStats data when available (from subgraph v1.0)
      ...(agentStats && {
        stats: {
          totalFeedback: agentStats.totalFeedback,
          averageFeedbackScore: agentStats.averageScore,
          averageValidationScore: agentStats.averageValidationScore,
          scoreDistribution: agentStats.scoreDistribution,
          uniqueSubmitters: agentStats.uniqueSubmitters,
          updatedAt: agentStats.updatedAt
            ? new Date(Number.parseInt(agentStats.updatedAt, 10) * 1000).toISOString()
            : undefined,
        },
      }),
    },
  });
});

export { validations };
