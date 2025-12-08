/**
 * Agents endpoints
 * @module routes/agents
 */

import { getClassification, getClassificationsBatch, getReputationsBatch } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  agentIdSchema,
  type ListAgentsQuery,
  listAgentsQuerySchema,
  parseAgentId,
  parseClassificationRow,
} from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createReputationService } from '@/services/reputation';
import { createSDKService } from '@/services/sdk';
import { createSearchService } from '@/services/search';
import type { AgentDetailResponse, AgentListResponse, AgentSummary, Env, Variables } from '@/types';
import { Hono } from 'hono';
import { classify } from './classify';

/**
 * Sort agents based on query parameters
 */
function sortAgents(
  agents: AgentSummary[],
  sort: ListAgentsQuery['sort'],
  order: ListAgentsQuery['order']
): AgentSummary[] {
  const sortField = sort ?? 'relevance';
  const sortOrder = order ?? 'desc';
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  return [...agents].sort((a, b) => {
    switch (sortField) {
      case 'relevance':
        // For relevance, use searchScore if available, otherwise by id
        const scoreA = a.searchScore ?? 0;
        const scoreB = b.searchScore ?? 0;
        return (scoreB - scoreA) * multiplier;
      case 'name':
        return a.name.localeCompare(b.name) * multiplier;
      case 'createdAt':
        // Sort by tokenId as proxy for creation order (lower tokenId = older)
        const tokenA = Number.parseInt(a.tokenId, 10) || 0;
        const tokenB = Number.parseInt(b.tokenId, 10) || 0;
        return (tokenA - tokenB) * multiplier;
      case 'reputation':
        // Sort by reputation score (agents without reputation go last)
        const repA = a.reputationScore ?? -1;
        const repB = b.reputationScore ?? -1;
        return (repA - repB) * multiplier;
      default:
        return 0;
    }
  });
}

/**
 * Filter agents by reputation score range
 */
function filterByReputation(
  agents: AgentSummary[],
  minRep?: number,
  maxRep?: number
): AgentSummary[] {
  if (minRep === undefined && maxRep === undefined) {
    return agents;
  }

  return agents.filter((agent) => {
    const score = agent.reputationScore;
    // Agents without reputation are excluded if min/max filters are applied
    if (score === undefined) {
      return false;
    }
    if (minRep !== undefined && score < minRep) {
      return false;
    }
    if (maxRep !== undefined && score > maxRep) {
      return false;
    }
    return true;
  });
}

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

  // Resolve chain IDs: prefer 'chains' over 'chainId' for backwards compatibility
  const chainIds = query.chains ?? (query.chainId ? [query.chainId] : undefined);

  // If search query provided, use semantic search
  if (query.q) {
    const searchService = createSearchService(c.env.SEARCH_SERVICE_URL);
    const searchResults = await searchService.search({
      query: query.q,
      limit: query.limit,
      minScore: query.minScore,
      filters: {
        chainIds,
        active: query.active,
        mcp: query.mcp,
        a2a: query.a2a,
        skills: query.skills,
        domains: query.domains,
      },
    });

    // Batch fetch classifications and reputations for all search results (N+1 fix)
    const agentIds = searchResults.results.map((r) => r.agentId);
    const [classificationsMap, reputationsMap] = await Promise.all([
      getClassificationsBatch(c.env.DB, agentIds),
      getReputationsBatch(c.env.DB, agentIds),
    ]);

    // Enrich search results with full agent data
    // Use Promise.allSettled for graceful error handling - failed fetches use search data fallback
    const enrichedResults = await Promise.allSettled(
      searchResults.results.map(async (result) => {
        const { chainId, tokenId } = parseAgentId(result.agentId);
        const agent = await sdk.getAgent(chainId, tokenId);

        // Get classification from batch result
        const classificationRow = classificationsMap.get(result.agentId);
        const oasf = parseClassificationRow(classificationRow);

        // Get reputation from batch result
        const reputationRow = reputationsMap.get(result.agentId);

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
          supportedTrust: agent?.supportedTrust ?? [],
          oasf,
          searchScore: result.score,
          reputationScore: reputationRow?.average_score,
          reputationCount: reputationRow?.feedback_count,
        };
      })
    );

    // Filter successful results and log failures
    const enrichedAgents = enrichedResults
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        // Log failed enrichment but use search result data as fallback
        const searchResult = searchResults.results[index];
        console.error(`Failed to enrich agent ${searchResult?.agentId}:`, result.reason);
        if (searchResult) {
          const { tokenId } = parseAgentId(searchResult.agentId);
          const reputationRow = reputationsMap.get(searchResult.agentId);
          return {
            id: searchResult.agentId,
            chainId: searchResult.chainId,
            tokenId,
            name: searchResult.name,
            description: searchResult.description,
            image: undefined,
            active: true,
            hasMcp: false,
            hasA2a: false,
            x402Support: false,
            supportedTrust: [],
            oasf: parseClassificationRow(classificationsMap.get(searchResult.agentId)),
            searchScore: searchResult.score,
            reputationScore: reputationRow?.average_score,
            reputationCount: reputationRow?.feedback_count,
          };
        }
        return null;
      })
      .filter((agent): agent is NonNullable<typeof agent> => agent !== null);

    // Apply reputation filtering
    const filteredAgents = filterByReputation(enrichedAgents, query.minRep, query.maxRep);

    // Apply sorting
    const sortedAgents = sortAgents(filteredAgents, query.sort, query.order);

    const response: AgentListResponse = {
      success: true,
      data: sortedAgents,
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
    chainIds,
    limit: query.limit,
    cursor: query.cursor,
    active: query.active,
    hasMcp: query.mcp,
    hasA2a: query.a2a,
  });

  // Batch fetch classifications and reputations for all agents (N+1 fix)
  const agentIds = agentsResult.items.map((a) => a.id);
  const [classificationsMap, reputationsMap] = await Promise.all([
    getClassificationsBatch(c.env.DB, agentIds),
    getReputationsBatch(c.env.DB, agentIds),
  ]);

  // Enrich with classifications and reputations from batch result
  const enrichedAgents = agentsResult.items.map((agent) => {
    const classificationRow = classificationsMap.get(agent.id);
    const oasf = parseClassificationRow(classificationRow);
    const reputationRow = reputationsMap.get(agent.id);
    return {
      ...agent,
      oasf,
      reputationScore: reputationRow?.average_score,
      reputationCount: reputationRow?.feedback_count,
    };
  });

  // Apply reputation filtering
  const filteredAgents = filterByReputation(enrichedAgents, query.minRep, query.maxRep);

  // Apply sorting
  const sortedAgents = sortAgents(filteredAgents, query.sort, query.order);

  const response: AgentListResponse = {
    success: true,
    data: sortedAgents,
    meta: {
      total: sortedAgents.length,
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
  const oasf = parseClassificationRow(classificationRow);

  // Get full reputation data
  const reputationService = createReputationService(c.env.DB);
  const reputation = await reputationService.getAgentReputation(agentId);

  const response: AgentDetailResponse = {
    success: true,
    data: {
      ...agent,
      oasf,
      reputation: reputation ?? undefined,
      reputationScore: reputation?.averageScore,
      reputationCount: reputation?.count,
    },
  };

  await cache.set(cacheKey, response, CACHE_TTL.AGENT_DETAIL);
  return c.json(response);
});

// Mount classification routes
agents.route('/:agentId/classify', classify);

export { agents };
