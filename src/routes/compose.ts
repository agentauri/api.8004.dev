/**
 * Team Composition Route
 * @module routes/compose
 *
 * POST /api/v1/compose - Build a team of complementary agents for a task
 */

import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_TTL, createCacheService } from '@/services/cache';
import { type ComposeRequest, composeTeam } from '@/services/compose';
import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { z } from 'zod';

const compose = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting (more restrictive as this is compute-intensive)
compose.use('*', rateLimit(rateLimitConfigs.classification));

/**
 * Validation schema for compose request
 */
const composeRequestSchema = z.object({
  task: z
    .string()
    .min(10, 'Task description must be at least 10 characters')
    .max(2000, 'Task description must be at most 2000 characters'),
  teamSize: z.number().int().min(1).max(10).optional(),
  requiredSkills: z.array(z.string()).max(20).optional(),
  requiredDomains: z.array(z.string()).max(20).optional(),
  minReputation: z.number().min(0).max(100).optional(),
  requireMcp: z.boolean().optional(),
  requireA2a: z.boolean().optional(),
  chainIds: z.array(z.number().int()).max(10).optional(),
});

/**
 * POST /api/v1/compose
 * Build a team of complementary agents for a given task
 *
 * Request body:
 * {
 *   "task": "Build a data pipeline that collects, analyzes, and visualizes sales data",
 *   "teamSize": 3,
 *   "requiredSkills": ["data_analysis"],
 *   "requiredDomains": ["finance"],
 *   "minReputation": 50,
 *   "requireMcp": true,
 *   "chainIds": [11155111]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "analysis": { ... },
 *     "team": [ { agentId, role, contributedSkills, ... } ],
 *     "teamFitnessScore": 0.85,
 *     "coveredSkills": [...],
 *     "skillGaps": [...],
 *     "coveredDomains": [...]
 *   }
 * }
 */
compose.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errors.validationError(c, 'Invalid JSON body');
  }

  const result = composeRequestSchema.safeParse(body);
  if (!result.success) {
    return errors.validationError(c, result.error.errors[0]?.message ?? 'Invalid request');
  }

  const request: ComposeRequest = result.data;

  // Check cache
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENTS);
  const cacheKey = cache.generateKey('compose', request as unknown as Record<string, unknown>);

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  try {
    const composition = await composeTeam(c.env, request);

    const response = {
      success: true as const,
      data: composition,
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, CACHE_TTL.AGENTS);

    return c.json(response);
  } catch (error) {
    console.error('Compose error:', error);
    return errors.internalError(c, 'Failed to compose team');
  }
});

/**
 * GET /api/v1/compose/info
 * Get information about the compose endpoint
 */
compose.get('/info', async (c) => {
  return c.json({
    success: true,
    data: {
      description: 'Build a team of complementary agents for a given task',
      endpoint: 'POST /api/v1/compose',
      requestSchema: {
        task: {
          type: 'string',
          required: true,
          minLength: 10,
          maxLength: 2000,
          description: 'Task or goal description',
        },
        teamSize: {
          type: 'number',
          required: false,
          min: 1,
          max: 10,
          default: 'auto-detected',
          description: 'Preferred team size',
        },
        requiredSkills: {
          type: 'string[]',
          required: false,
          maxItems: 20,
          description: 'OASF skill slugs that must be covered',
        },
        requiredDomains: {
          type: 'string[]',
          required: false,
          maxItems: 20,
          description: 'OASF domain slugs that must be covered',
        },
        minReputation: {
          type: 'number',
          required: false,
          min: 0,
          max: 100,
          description: 'Minimum agent reputation score',
        },
        requireMcp: {
          type: 'boolean',
          required: false,
          description: 'Only include agents with MCP endpoints',
        },
        requireA2a: {
          type: 'boolean',
          required: false,
          description: 'Only include agents with A2A endpoints',
        },
        chainIds: {
          type: 'number[]',
          required: false,
          maxItems: 10,
          description: 'Filter by chain IDs',
        },
      },
      response: {
        analysis: 'Task analysis with identified skills and domains',
        team: 'Array of team members with roles and fitness scores',
        teamFitnessScore: 'Overall team fitness score (0-1)',
        coveredSkills: 'Skills covered by the team',
        skillGaps: 'Skills not covered (gaps)',
        coveredDomains: 'Domains covered by the team',
        compositionTimeMs: 'Time taken to compose the team',
      },
      example: {
        request: {
          task: 'Build a data pipeline that collects financial data, analyzes trends, and generates reports',
          teamSize: 3,
          requiredDomains: ['finance'],
          minReputation: 50,
        },
        response: {
          analysis: {
            task: '...',
            requiredSkills: [
              { skill: 'data_collection', priority: 'required', reason: '...' },
              { skill: 'data_analysis', priority: 'required', reason: '...' },
            ],
            suggestedTeamSize: 3,
          },
          team: [
            {
              agentId: '11155111:123',
              role: 'Data Analyst',
              contributedSkills: ['data_analysis', 'data_visualization'],
              fitnessScore: 0.9,
            },
          ],
          teamFitnessScore: 0.85,
          coveredSkills: ['data_collection', 'data_analysis', 'report_generation'],
          skillGaps: [],
        },
      },
      notes: [
        'Team composition uses semantic search and skill matching',
        'Skill requirements are auto-detected from task description',
        'Team members are selected to maximize skill coverage',
        'Each member is assigned a role based on their primary skills',
        'Use requiredSkills to ensure specific capabilities are included',
      ],
    },
  });
});

export { compose };
