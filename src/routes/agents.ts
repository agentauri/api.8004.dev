/**
 * Agents endpoints
 * @module routes/agents
 */

import {
  enqueueClassificationsBatch,
  getClassification,
  getClassificationsBatch,
  getReputationsBatch,
} from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  type ListAgentsQuery,
  agentIdSchema,
  listAgentsQuerySchema,
  parseAgentId,
  parseClassificationRow,
} from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createIPFSService } from '@/services/ipfs';
import { resolveClassification, toOASFClassification } from '@/services/oasf-resolver';
import { createReputationService } from '@/services/reputation';
import { createSDKService } from '@/services/sdk';
import { createSearchService } from '@/services/search';
import type {
  AgentDetailResponse,
  AgentListResponse,
  AgentSummary,
  Env,
  OASFSource,
  Variables,
} from '@/types';
import { Hono } from 'hono';
import { classify } from './classify';
import { reputation } from './reputation';

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
      case 'relevance': {
        // For relevance, use searchScore if available, otherwise by id
        const scoreA = a.searchScore ?? 0;
        const scoreB = b.searchScore ?? 0;
        return (scoreB - scoreA) * multiplier;
      }
      case 'name':
        return a.name.localeCompare(b.name) * multiplier;
      case 'createdAt': {
        // Sort by tokenId as proxy for creation order (lower tokenId = older)
        const tokenA = Number.parseInt(a.tokenId, 10) || 0;
        const tokenB = Number.parseInt(b.tokenId, 10) || 0;
        return (tokenA - tokenB) * multiplier;
      }
      case 'reputation': {
        // Sort by reputation score (agents without reputation go last)
        const repA = a.reputationScore ?? -1;
        const repB = b.reputationScore ?? -1;
        return (repA - repB) * multiplier;
      }
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex handler with multiple code paths for search vs SDK, OR vs AND mode
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

  // Resolve chain IDs: prefer 'chainIds[]' (URL array), then 'chainIds', then 'chains' (CSV), then 'chainId' (single)
  const chainIds =
    query['chainIds[]'] ??
    query.chainIds ??
    query.chains ??
    (query.chainId ? [query.chainId] : undefined);

  // If search query provided, use semantic search
  if (query.q) {
    const searchService = createSearchService(c.env.SEARCH_SERVICE_URL);
    const searchResults = await searchService.search({
      query: query.q,
      limit: query.limit,
      minScore: query.minScore,
      cursor: query.cursor,
      filters: {
        chainIds,
        active: query.active,
        mcp: query.mcp,
        a2a: query.a2a,
        x402: query.x402,
        skills: query.skills,
        domains: query.domains,
        filterMode: query.filterMode,
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
          operators: agent?.operators ?? [],
          ens: agent?.ens,
          did: agent?.did,
          walletAddress: agent?.walletAddress,
          oasf,
          oasfSource: (oasf ? 'llm-classification' : 'none') as OASFSource,
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
          const fallbackOasf = parseClassificationRow(classificationsMap.get(searchResult.agentId));
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
            operators: [],
            ens: undefined,
            did: undefined,
            walletAddress: undefined,
            oasf: fallbackOasf,
            oasfSource: (fallbackOasf ? 'llm-classification' : 'none') as OASFSource,
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

    // Trigger background classification for unclassified agents (non-blocking)
    const unclassifiedIds = sortedAgents
      .filter((a) => !a.oasf)
      .slice(0, 10) // Limit to 10 per request to avoid spam
      .map((a) => a.id);

    if (unclassifiedIds.length > 0) {
      // Use waitUntil to properly register the background task with Workers runtime
      c.executionCtx.waitUntil(
        enqueueClassificationsBatch(c.env.DB, unclassifiedIds).catch((err) => {
          console.error('Failed to enqueue classifications:', err);
        })
      );
    }

    await cache.set(cacheKey, response, CACHE_TTL.AGENTS);
    return c.json(response);
  }

  // Otherwise, use SDK directly with cursor-based pagination
  // Check if OR mode with multiple boolean filters
  const booleanFilters: Array<'mcp' | 'a2a' | 'x402'> = [];
  if (query.mcp) booleanFilters.push('mcp');
  if (query.a2a) booleanFilters.push('a2a');
  if (query.x402) booleanFilters.push('x402');

  const isOrMode = query.filterMode === 'OR' && booleanFilters.length > 1;

  let agentsResult: { items: AgentSummary[]; nextCursor?: string };

  if (isOrMode) {
    // OR mode: run separate queries for each boolean filter and merge results
    const baseParams = {
      chainIds,
      limit: query.limit,
      active: query.active,
    };

    const queryPromises = booleanFilters.map((filter) =>
      sdk.getAgents({
        ...baseParams,
        hasMcp: filter === 'mcp' ? true : undefined,
        hasA2a: filter === 'a2a' ? true : undefined,
        hasX402: filter === 'x402' ? true : undefined,
      })
    );

    const results = await Promise.all(queryPromises);

    // Merge and deduplicate by agent ID
    const agentMap = new Map<string, AgentSummary>();
    for (const result of results) {
      for (const agent of result.items) {
        if (!agentMap.has(agent.id)) {
          agentMap.set(agent.id, agent);
        }
      }
    }

    const mergedItems = [...agentMap.values()].slice(0, query.limit);
    agentsResult = {
      items: mergedItems,
      // Cannot provide cursor for merged OR results
      nextCursor: undefined,
    };
  } else {
    // AND mode (default): single query with all filters
    agentsResult = await sdk.getAgents({
      chainIds,
      limit: query.limit,
      cursor: query.cursor,
      active: query.active,
      hasMcp: query.mcp,
      hasA2a: query.a2a,
      hasX402: query.x402,
    });
  }

  // Batch fetch classifications and reputations for all agents (N+1 fix)
  const agentIds = agentsResult.items.map((a) => a.id);
  const [classificationsMap, reputationsMap] = await Promise.all([
    getClassificationsBatch(c.env.DB, agentIds),
    getReputationsBatch(c.env.DB, agentIds),
  ]);

  // Enrich with classifications and reputations from batch result
  let enrichedAgents = agentsResult.items.map((agent) => {
    const classificationRow = classificationsMap.get(agent.id);
    const oasf = parseClassificationRow(classificationRow);
    const reputationRow = reputationsMap.get(agent.id);
    return {
      ...agent,
      oasf,
      oasfSource: (oasf ? 'llm-classification' : 'none') as OASFSource,
      reputationScore: reputationRow?.average_score,
      reputationCount: reputationRow?.feedback_count,
    };
  });

  // Apply domains filtering (post-fetch since SDK doesn't support it)
  if (query.domains?.length) {
    enrichedAgents = enrichedAgents.filter((agent) => {
      if (!agent.oasf?.domains) return false;
      const agentDomains = agent.oasf.domains.map((d) => d.slug);
      return query.domains?.some((d) => agentDomains.includes(d));
    });
  }

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

  // Trigger background classification for unclassified agents (non-blocking)
  const unclassifiedIds = sortedAgents
    .filter((a) => !a.oasf)
    .slice(0, 10) // Limit to 10 per request to avoid spam
    .map((a) => a.id);

  if (unclassifiedIds.length > 0) {
    // Use waitUntil to properly register the background task with Workers runtime
    c.executionCtx.waitUntil(
      enqueueClassificationsBatch(c.env.DB, unclassifiedIds).catch((err) => {
        console.error('Failed to enqueue classifications:', err);
      })
    );
  }

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

  // Create IPFS service for fetching metadata
  const ipfsService = createIPFSService(cache, {
    gatewayUrl: c.env.IPFS_GATEWAY_URL,
    timeoutMs: c.env.IPFS_TIMEOUT_MS ? Number.parseInt(c.env.IPFS_TIMEOUT_MS, 10) : undefined,
  });

  // Fetch IPFS metadata, classification, and reputation in parallel
  const [ipfsMetadata, classificationRow, reputationData] = await Promise.all([
    agent.registration.metadataUri
      ? ipfsService.fetchMetadata(agent.registration.metadataUri, agentId)
      : Promise.resolve(null),
    getClassification(c.env.DB, agentId),
    createReputationService(c.env.DB).getAgentReputation(agentId),
  ]);

  // Parse DB classification
  const dbClassification = parseClassificationRow(classificationRow);

  // Resolve OASF with priority (creator-defined > LLM > none)
  const resolvedClassification = resolveClassification(ipfsMetadata, dbClassification);
  const oasf = toOASFClassification(resolvedClassification);

  // Build response with IPFS metadata and resolved OASF
  const response: AgentDetailResponse = {
    success: true,
    data: {
      ...agent,
      oasf,
      oasfSource: resolvedClassification.source,
      reputation: reputationData ?? undefined,
      reputationScore: reputationData?.averageScore,
      reputationCount: reputationData?.count,
      // Include OASF endpoint from IPFS if available
      endpoints: {
        ...agent.endpoints,
        oasf: ipfsMetadata?.oasfEndpoint,
      },
      // Include IPFS metadata (social links, external URL, attributes)
      ipfsMetadata: ipfsMetadata
        ? {
            socialLinks: ipfsMetadata.socialLinks,
            externalUrl: ipfsMetadata.externalUrl,
            attributes: ipfsMetadata.attributes,
          }
        : undefined,
    },
  };

  await cache.set(cacheKey, response, CACHE_TTL.AGENT_DETAIL);
  return c.json(response);
});

// Mount classification routes
agents.route('/:agentId/classify', classify);

// Mount reputation routes
agents.route('/:agentId/reputation', reputation);

export { agents };
