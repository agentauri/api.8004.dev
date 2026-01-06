/**
 * Agent health monitoring endpoints
 * @module routes/health-agent
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { createReliabilityService } from '@/services/reliability';
import { agentIdSchema } from '@/lib/utils/validation';
import type { Env, Variables } from '@/types';

const healthAgent = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
healthAgent.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/agents/:agentId/health
 * Get health status for an agent
 *
 * Returns:
 * - status: healthy/degraded/unhealthy/unknown
 * - uptimePercentage: overall uptime (0-100)
 * - mcp: MCP endpoint health details
 * - a2a: A2A endpoint health details
 * - lastCheckedAt: timestamp of last health check
 */
healthAgent.get('/', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  // Validate agent ID format
  const validationResult = agentIdSchema.safeParse(agentId);
  if (!validationResult.success) {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const reliabilityService = createReliabilityService(c.env.DB);
  const health = await reliabilityService.computeHealthStatus(agentId);

  return c.json({
    success: true,
    data: {
      agentId,
      ...health,
    },
  });
});

export { healthAgent };
