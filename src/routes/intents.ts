/**
 * Intent Templates API
 *
 * Endpoints for managing and matching intent templates.
 * Templates define multi-agent workflows with required capabilities.
 *
 * @module routes/intents
 */

import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_TTL, createCacheService } from '@/services/cache';
import { createIntentService } from '@/services/intent';
import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { z } from 'zod';

const intents = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
intents.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Query schema for listing templates
 */
const listTemplatesSchema = z.object({
  category: z.string().optional(),
  featured: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

/**
 * Query schema for matching
 */
const matchTemplateSchema = z.object({
  chainIds: z
    .string()
    .transform((v) => v.split(',').map((id) => Number.parseInt(id, 10)))
    .optional(),
  minReputation: z.coerce.number().min(0).max(100).optional(),
  limit: z.coerce.number().min(1).max(20).default(5),
});

/**
 * GET /api/v1/intents
 * List all intent templates
 */
intents.get('/', async (c) => {
  const queryResult = listTemplatesSchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.errors[0]?.message ?? 'Invalid query');
  }

  const { category, featured } = queryResult.data;
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.TAXONOMY);
  const cacheKey = `intents:list:${category ?? 'all'}:${featured ?? 'all'}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const intentService = createIntentService(c.env.DB, c.env);
  const templates = await intentService.getTemplates({
    category,
    featuredOnly: featured,
  });

  const response = {
    success: true as const,
    data: templates,
    meta: {
      total: templates.length,
      category: category ?? null,
      featuredOnly: featured ?? false,
    },
  };

  await cache.set(cacheKey, response, CACHE_TTL.TAXONOMY);
  return c.json(response);
});

/**
 * GET /api/v1/intents/categories
 * List template categories
 */
intents.get('/categories', async (c) => {
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.TAXONOMY);
  const cacheKey = 'intents:categories';

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const intentService = createIntentService(c.env.DB, c.env);
  const categories = await intentService.getCategories();

  const response = {
    success: true as const,
    data: categories,
  };

  await cache.set(cacheKey, response, CACHE_TTL.TAXONOMY);
  return c.json(response);
});

/**
 * GET /api/v1/intents/:templateId
 * Get a specific template
 */
intents.get('/:templateId', async (c) => {
  const templateId = c.req.param('templateId');

  const cache = createCacheService(c.env.CACHE, CACHE_TTL.TAXONOMY);
  const cacheKey = `intents:template:${templateId}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const intentService = createIntentService(c.env.DB, c.env);
  const template = await intentService.getTemplate(templateId);

  if (!template) {
    return errors.notFound(c, 'Template');
  }

  const response = {
    success: true as const,
    data: template,
  };

  await cache.set(cacheKey, response, CACHE_TTL.TAXONOMY);
  return c.json(response);
});

/**
 * POST /api/v1/intents/:templateId/match
 * Match agents to a template
 */
intents.post('/:templateId/match', async (c) => {
  const templateId = c.req.param('templateId');

  // Parse body or query params
  let constraints: z.infer<typeof matchTemplateSchema>;
  try {
    const body = await c.req.json().catch(() => ({}));
    const query = c.req.query();
    const merged = { ...query, ...body };
    const result = matchTemplateSchema.safeParse(merged);
    if (!result.success) {
      return errors.validationError(c, result.error.errors[0]?.message ?? 'Invalid request');
    }
    constraints = result.data;
  } catch (error) {
    console.error('Failed to parse match request body:', error);
    return errors.validationError(c, 'Invalid request body format');
  }

  const intentService = createIntentService(c.env.DB, c.env);
  const matchResult = await intentService.matchTemplate(templateId, {
    chainIds: constraints.chainIds,
    minReputation: constraints.minReputation,
    limit: constraints.limit,
  });

  if (!matchResult) {
    return errors.notFound(c, 'Template');
  }

  return c.json({
    success: true as const,
    data: {
      template: matchResult.template,
      steps: matchResult.steps.map((step) => ({
        step: {
          order: step.step.stepOrder,
          role: step.step.role,
          description: step.step.description,
          requiredSkills: step.step.requiredSkills,
        },
        matchedAgents: step.matchedAgents,
        bestMatch: step.bestMatch,
        ioCompatible: {
          withPrevious: step.ioCompatibleWithPrevious,
          withNext: step.ioCompatibleWithNext,
        },
      })),
      summary: {
        isComplete: matchResult.isComplete,
        canExecute: matchResult.canExecute,
        totalAgentsMatched: matchResult.totalAgentsMatched,
        stepsWithMatches: matchResult.steps.filter((s) => s.matchedAgents.length > 0).length,
        totalSteps: matchResult.steps.length,
      },
    },
  });
});

/**
 * GET /api/v1/intents/:templateId/match
 * Match agents to a template (GET version)
 */
intents.get('/:templateId/match', async (c) => {
  const templateId = c.req.param('templateId');

  const queryResult = matchTemplateSchema.safeParse(c.req.query());
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.errors[0]?.message ?? 'Invalid query');
  }

  const { chainIds, minReputation, limit } = queryResult.data;

  const intentService = createIntentService(c.env.DB, c.env);
  const matchResult = await intentService.matchTemplate(templateId, {
    chainIds,
    minReputation,
    limit,
  });

  if (!matchResult) {
    return errors.notFound(c, 'Template');
  }

  return c.json({
    success: true as const,
    data: {
      template: matchResult.template,
      steps: matchResult.steps.map((step) => ({
        step: {
          order: step.step.stepOrder,
          role: step.step.role,
          description: step.step.description,
          requiredSkills: step.step.requiredSkills,
        },
        matchedAgents: step.matchedAgents,
        bestMatch: step.bestMatch,
        ioCompatible: {
          withPrevious: step.ioCompatibleWithPrevious,
          withNext: step.ioCompatibleWithNext,
        },
      })),
      summary: {
        isComplete: matchResult.isComplete,
        canExecute: matchResult.canExecute,
        totalAgentsMatched: matchResult.totalAgentsMatched,
        stepsWithMatches: matchResult.steps.filter((s) => s.matchedAgents.length > 0).length,
        totalSteps: matchResult.steps.length,
      },
    },
  });
});

export { intents };
