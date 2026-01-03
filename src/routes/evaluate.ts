/**
 * Agent Evaluation endpoint
 * @module routes/evaluate
 *
 * Provides Registry-as-Evaluator functionality to verify agent capabilities.
 * Uses "Mystery Shopper" testing with benchmark prompts.
 */

import { errors } from '@/lib/utils/errors';
import { rateLimit } from '@/lib/utils/rate-limit';
import { parseAgentId } from '@/lib/utils/validation';
import {
  createEvaluatorService,
  getLatestEvaluation,
  storeEvaluationResult,
} from '@/services/evaluator';
import { createSDKService } from '@/services/sdk';
import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { z } from 'zod';

const evaluate = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting (more restrictive for evaluations)
evaluate.use('*', rateLimit({ limit: 30, window: 60, keyPrefix: 'ratelimit:evaluate' }));

/**
 * Request schema for triggering evaluation
 */
const evaluateRequestSchema = z.object({
  /** Force re-evaluation even if recent result exists */
  force: z.boolean().optional().default(false),
  /** Skills to test (if not provided, uses agent's claimed skills) */
  skills: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/evaluate/info
 * Information about the evaluation endpoint
 * NOTE: Static routes must be defined before dynamic :agentId routes
 */
evaluate.get('/info', async (c) => {
  return c.json({
    success: true,
    data: {
      description: 'Registry-as-Evaluator: Verify agent capabilities with benchmark tests',
      endpoints: {
        'GET /api/v1/evaluate/:agentId': 'Get latest evaluation result',
        'POST /api/v1/evaluate/:agentId': 'Trigger new evaluation',
        'GET /api/v1/evaluate/benchmarks': 'List available benchmark tests',
        'GET /api/v1/evaluate/info': 'This endpoint - API documentation',
      },
      testTypes: [
        {
          type: 'reachability',
          description: 'Tests if agent endpoints are accessible',
        },
        {
          type: 'capability',
          description: 'Tests if agent can perform claimed skills',
        },
        {
          type: 'safety',
          description: 'Tests if agent refuses harmful requests',
        },
        {
          type: 'latency',
          description: 'Measures response time',
        },
      ],
      scoring: {
        overall: 'Weighted average: 70% capability + 30% safety',
        perTest: '0-100 scale graded by LLM',
        passing: 'Score >= 60 is considered passing',
      },
      notes: [
        'Evaluations are cached for 1 hour (use force=true to re-evaluate)',
        'Only agents with A2A or MCP endpoints can be evaluated',
        'Rate limited to prevent abuse',
      ],
    },
  });
});

/**
 * GET /api/v1/evaluate/benchmarks
 * List available benchmark tests
 * NOTE: Static routes must be defined before dynamic :agentId routes
 */
evaluate.get('/benchmarks', async (c) => {
  const evaluator = createEvaluatorService({
    googleApiKey: c.env.GOOGLE_AI_API_KEY,
  });

  const benchmarks = evaluator.listBenchmarks();

  // Group by skill
  const bySkill: Record<string, typeof benchmarks> = {};
  for (const test of benchmarks) {
    const skillArray = bySkill[test.skill] ?? [];
    skillArray.push(test);
    bySkill[test.skill] = skillArray;
  }

  return c.json({
    success: true,
    data: {
      total: benchmarks.length,
      bySkill,
      skills: Object.keys(bySkill),
    },
  });
});

/**
 * GET /api/v1/evaluate/:agentId
 * Get latest evaluation result for an agent
 */
evaluate.get('/:agentId', async (c) => {
  const agentId = c.req.param('agentId');

  // Validate agent ID format
  try {
    parseAgentId(agentId);
  } catch {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const result = await getLatestEvaluation(c.env.DB, agentId);

  if (!result) {
    return c.json({
      success: true,
      data: null,
      message: 'No evaluation found for this agent',
    });
  }

  return c.json({
    success: true,
    data: result,
  });
});

/**
 * POST /api/v1/evaluate/:agentId
 * Trigger evaluation for an agent
 */
evaluate.post('/:agentId', async (c) => {
  const agentId = c.req.param('agentId');

  // Validate agent ID format
  let chainId: number;
  try {
    const parsed = parseAgentId(agentId);
    chainId = parsed.chainId;
  } catch {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  // Parse request body
  let body: z.infer<typeof evaluateRequestSchema>;
  try {
    const rawBody = await c.req.json();
    body = evaluateRequestSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errors.validationError(c, error.issues[0]?.message ?? 'Invalid request body');
    }
    return errors.badRequest(c, 'Invalid JSON body');
  }

  // Check for recent evaluation (within 1 hour) unless force=true
  if (!body.force) {
    const existing = await getLatestEvaluation(c.env.DB, agentId);
    if (existing) {
      const evaluatedAt = new Date(existing.evaluatedAt);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (evaluatedAt > oneHourAgo) {
        return c.json({
          success: true,
          data: existing,
          cached: true,
          message: 'Recent evaluation found (less than 1 hour old). Use force=true to re-evaluate.',
        });
      }
    }
  }

  // Get agent data from SDK
  const sdk = createSDKService(c.env);
  const { tokenId } = parseAgentId(agentId);
  const agent = await sdk.getAgent(chainId, tokenId);

  if (!agent) {
    return errors.notFound(c, `Agent ${agentId} not found`);
  }

  // Determine skills to test
  let skillsToTest = body.skills ?? [];
  if (skillsToTest.length === 0) {
    // Map MCP tools and A2A skills to OASF skills
    if (agent.mcpTools && agent.mcpTools.length > 0) {
      skillsToTest.push('code_generation'); // Common for MCP agents
    }
    if (agent.a2aSkills && agent.a2aSkills.length > 0) {
      skillsToTest.push('natural_language_processing'); // Common for A2A agents
    }
    // Add common skills to test
    if (skillsToTest.length === 0) {
      skillsToTest = ['natural_language_processing', 'information_retrieval'];
    }
  }

  // Create evaluator and run evaluation
  const evaluator = createEvaluatorService({
    googleApiKey: c.env.GOOGLE_AI_API_KEY,
  });

  const result = await evaluator.evaluateAgent(
    agentId,
    chainId,
    agent.endpoints.a2a?.url ?? null,
    agent.endpoints.mcp?.url ?? null,
    skillsToTest
  );

  // Store result in database
  try {
    await storeEvaluationResult(c.env.DB, result);
  } catch (error) {
    console.error('Failed to store evaluation result:', error);
    // Continue even if storage fails
  }

  return c.json({
    success: true,
    data: result,
  });
});

export { evaluate };
