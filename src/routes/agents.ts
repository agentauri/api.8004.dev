/**
 * Agents endpoints
 * @module routes/agents
 */

import { getClassification } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { agentIdSchema, listAgentsQuerySchema, parseAgentId } from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createSDKService } from '@/services/sdk';
import { createSearchService } from '@/services/search';
import type { AgentDetailResponse, AgentListResponse, Env, Variables } from '@/types';
import { Hono } from 'hono';
import { classify } from './classify';

const agents = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
agents.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/agents
 * List agents with optional filters and search
 */
agents.get('/', async (c) => {
  // Parse and validate query parameters
  const rawQuery = c.req.query();
  const queryResult = listAgentsQuerySchema.safeParse(rawQuery);

  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.errors[0]?.message ?? 'Invalid query');
  }

  const query = queryResult.data;
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENTS);

  // Generate cache key
  const cacheKey = cache.generateKey('agents:list', query);

  // Check cache
  const cached = await cache.get<AgentListResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const sdk = createSDKService(c.env);

  // If search query provided, use semantic search
  if (query.q) {
    const searchService = createSearchService(c.env.SEARCH_SERVICE_URL);
    const searchResults = await searchService.search({
      query: query.q,
      limit: query.limit,
      minScore: query.minScore,
      filters: {
        chainIds: query.chainId ? [query.chainId] : undefined,
        active: query.active,
        mcp: query.mcp,
        a2a: query.a2a,
        skills: query.skills,
        domains: query.domains,
      },
    });

    // Enrich search results with full agent data
    const enrichedAgents = await Promise.all(
      searchResults.results.map(async (result) => {
        const { chainId, tokenId } = parseAgentId(result.agentId);
        const agent = await sdk.getAgent(chainId, tokenId);

        // Get classification if available
        const classificationRow = await getClassification(c.env.DB, result.agentId);
        const oasf = classificationRow
          ? {
              skills: JSON.parse(classificationRow.skills),
              domains: JSON.parse(classificationRow.domains),
              confidence: classificationRow.confidence,
              classifiedAt: classificationRow.classified_at,
              modelVersion: classificationRow.model_version,
            }
          : undefined;

        return {
          id: result.agentId,
          chainId: result.chainId,
          tokenId,
          name: agent?.name ?? result.name,
          description: agent?.description ?? result.description,
          image: agent?.image,
          active: agent?.active ?? true,
          hasMcp: agent?.hasMcp ?? false,
          hasA2a: agent?.hasA2a ?? false,
          x402Support: agent?.x402Support ?? false,
          oasf,
          searchScore: result.score,
        };
      })
    );

    const response: AgentListResponse = {
      success: true,
      data: enrichedAgents,
      meta: {
        total: searchResults.total,
        hasMore: searchResults.hasMore,
        nextCursor: searchResults.nextCursor,
      },
    };

    await cache.set(cacheKey, response, CACHE_TTL.AGENTS);
    return c.json(response);
  }

  // Otherwise, use SDK directly with cursor-based pagination
  const agentsResult = await sdk.getAgents({
    chainIds: query.chainId ? [query.chainId] : undefined,
    limit: query.limit,
    cursor: query.cursor,
    active: query.active,
    hasMcp: query.mcp,
    hasA2a: query.a2a,
  });

  // Enrich with classifications
  const enrichedAgents = await Promise.all(
    agentsResult.items.map(async (agent) => {
      const classificationRow = await getClassification(c.env.DB, agent.id);
      const oasf = classificationRow
        ? {
            skills: JSON.parse(classificationRow.skills),
            domains: JSON.parse(classificationRow.domains),
            confidence: classificationRow.confidence,
            classifiedAt: classificationRow.classified_at,
            modelVersion: classificationRow.model_version,
          }
        : undefined;

      return { ...agent, oasf };
    })
  );

  const response: AgentListResponse = {
    success: true,
    data: enrichedAgents,
    meta: {
      total: enrichedAgents.length,
      hasMore: !!agentsResult.nextCursor,
      nextCursor: agentsResult.nextCursor,
    },
  };

  await cache.set(cacheKey, response, CACHE_TTL.AGENTS);
  return c.json(response);
});

/**
 * GET /api/v1/agents/:agentId
 * Get single agent details
 */
agents.get('/:agentId', async (c) => {
  const agentIdParam = c.req.param('agentId');

  // Validate agent ID format
  const agentIdResult = agentIdSchema.safeParse(agentIdParam);
  if (!agentIdResult.success) {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const agentId = agentIdResult.data;
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENT_DETAIL);
  const cacheKey = CACHE_KEYS.agentDetail(agentId);

  // Check cache
  const cached = await cache.get<AgentDetailResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const { chainId, tokenId } = parseAgentId(agentId);
  const sdk = createSDKService(c.env);
  const agent = await sdk.getAgent(chainId, tokenId);

  if (!agent) {
    return errors.notFound(c, 'Agent');
  }

  // Get classification
  const classificationRow = await getClassification(c.env.DB, agentId);
  const oasf = classificationRow
    ? {
        skills: JSON.parse(classificationRow.skills),
        domains: JSON.parse(classificationRow.domains),
        confidence: classificationRow.confidence,
        classifiedAt: classificationRow.classified_at,
        modelVersion: classificationRow.model_version,
      }
    : undefined;

  const response: AgentDetailResponse = {
    success: true,
    data: { ...agent, oasf },
  };

  await cache.set(cacheKey, response, CACHE_TTL.AGENT_DETAIL);
  return c.json(response);
});

// Mount classification routes
agents.route('/:agentId/classify', classify);

export { agents };
