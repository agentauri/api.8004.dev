/**
 * Search endpoint
 * @module routes/search
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { getClassificationsBatch } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { applyFilters } from '@/lib/utils/filters';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  parseAgentId,
  parseClassificationRow,
  type SearchRequestBody,
  searchRequestSchema,
} from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createSDKService } from '@/services/sdk';
import { createSearchService } from '@/services/search';
import type {
  AgentDetail,
  AgentSummary,
  Env,
  OASFSource,
  SearchMode,
  SearchModeInput,
  SearchResponse,
  TrustMethod,
  Variables,
} from '@/types';

const search = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
search.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Perform SDK-based name substring search
 * Used when searchMode='name' or as fallback when vector search returns 0 results
 */
async function performNameSearch(
  env: Env,
  sdk: ReturnType<typeof createSDKService>,
  body: SearchRequestBody,
  searchModeLabel: SearchMode
): Promise<{
  agents: AgentSummary[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
  byChain?: Record<number, number>;
  searchMode: SearchMode;
}> {
  // Use SDK search with substring matching
  // DON'T pass mcp/a2a/x402 to SDK - the external SDK doesn't handle false values correctly
  // We'll apply all boolean filters ourselves via applyFilters after getting results
  const sdkSearchResult = await sdk.search({
    query: body.query,
    chainIds: body.filters?.chainIds,
    active: body.filters?.active,
    // Note: mcp/a2a/x402/filterMode NOT passed - we handle them in applyFilters
    limit: body.limit * 3, // Over-fetch for post-filtering
    cursor: body.cursor,
  });

  // Batch fetch classifications for OASF filtering
  const agentIds = sdkSearchResult.items.map((item) => item.agent.id);
  const classificationsMap = await getClassificationsBatch(env.DB, agentIds);

  // Add OASF classifications to agents
  const agentsWithOasf: AgentSummary[] = sdkSearchResult.items.map((item) => {
    const classificationRow = classificationsMap.get(item.agent.id);
    const oasf = parseClassificationRow(classificationRow);
    return {
      ...item.agent,
      oasf,
      oasfSource: (oasf ? 'llm-classification' : 'none') as OASFSource,
      searchScore: item.score,
      matchReasons: item.matchReasons,
    };
  });

  // Apply ALL filters including boolean filters (mcp, a2a, x402)
  // The SDK doesn't reliably filter these, so we must apply them here
  const filteredAgents = applyFilters(agentsWithOasf, body.filters);

  const finalAgents = filteredAgents.slice(0, body.limit);
  const total = filteredAgents.length;
  const hasMore = filteredAgents.length > body.limit;

  return {
    agents: finalAgents,
    total,
    hasMore,
    nextCursor: sdkSearchResult.nextCursor,
    byChain: sdkSearchResult.byChain,
    searchMode: searchModeLabel,
  };
}

/**
 * POST /api/v1/search
 * Perform semantic search for agents with SDK fallback
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Search endpoint requires vector search with SDK fallback and agent enrichment
search.post('/', async (c) => {
  // Parse and validate request body
  let body: SearchRequestBody;
  try {
    const rawBody = await c.req.json();
    body = searchRequestSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errors.validationError(c, error.issues[0]?.message ?? 'Invalid request body');
    }
    return errors.badRequest(c, 'Invalid JSON body');
  }

  // Cache for full API response (only for first page without cursor)
  const responseCache = createCacheService(c.env.CACHE, CACHE_TTL.SEARCH);

  // Check response cache only for first page (no cursor)
  if (!body.cursor) {
    const cacheKey = responseCache.generateKey('search', body);
    const cached = await responseCache.get<SearchResponse>(cacheKey);
    if (cached) {
      return c.json(cached);
    }
  }

  // Create SDK service (used for both enrichment and fallback)
  const sdk = createSDKService(c.env);

  // Get search mode (default to 'auto' for backward compatibility)
  const searchModeInput: SearchModeInput = body.searchMode ?? 'auto';

  // Track which search mode we used
  let searchMode: SearchMode = 'vector';
  let finalAgents: AgentSummary[] = [];
  let total = 0;
  let hasMore = false;
  let nextCursor: string | undefined;
  let byChain: Record<number, number> | undefined;

  // If searchMode is 'name', skip vector search entirely
  if (searchModeInput === 'name') {
    try {
      const result = await performNameSearch(c.env, sdk, body, 'name');
      finalAgents = result.agents;
      total = result.total;
      hasMore = result.hasMore;
      nextCursor = result.nextCursor;
      byChain = result.byChain;
      searchMode = 'name';
    } catch (sdkError) {
      c.get('logger').logError('SDK name search failed', sdkError);
      return errors.internalError(c, 'Search service error');
    }
  } else {
    // For 'semantic' or 'auto' mode, try vector search first
    try {
      // ========== PRIMARY: VECTOR SEARCH ==========
      const searchResultsCache = createCacheService(c.env.CACHE, CACHE_TTL.SEARCH_RESULTS);
      const searchService = createSearchService(
        c.env.SEARCH_SERVICE_URL,
        searchResultsCache,
        c.env
      );

      // Determine over-fetch amount based on filters
      const hasBooleanFilters =
        body.filters?.mcp !== undefined ||
        body.filters?.a2a !== undefined ||
        body.filters?.x402 !== undefined ||
        (body.filters?.chainIds && body.filters.chainIds.length > 0);

      const hasOASFFilters =
        (body.filters?.skills && body.filters.skills.length > 0) ||
        (body.filters?.domains && body.filters.domains.length > 0);

      let fetchLimit = body.limit;
      if (hasOASFFilters) {
        fetchLimit = Math.min(body.limit * 10, 100);
      } else if (hasBooleanFilters) {
        fetchLimit = Math.min(body.limit * 3, 100);
      }

      // Only pass filters that work upstream
      const upstreamFilters = body.filters ? { active: body.filters.active } : undefined;

      const searchResults = await searchService.search({
        query: body.query,
        limit: fetchLimit,
        minScore: body.minScore,
        cursor: body.cursor,
        offset: body.offset,
        filters: upstreamFilters,
      });

      // If vector search returns 0 results and searchMode is 'auto', fall back to SDK name search
      // For 'semantic' mode, don't fall back - return empty results
      if (searchResults.results.length === 0 && !body.cursor) {
        if (searchModeInput === 'auto') {
          throw new Error('Vector search returned 0 results, trying SDK name fallback');
        }
        // For 'semantic' mode, return empty results (continue with empty searchResults)
      }

      // Batch fetch classifications
      const agentIds = searchResults.results.map((r) => r.agentId);
      const classificationsMap = await getClassificationsBatch(c.env.DB, agentIds);

      // Enrich with SDK data
      const agentCache = createCacheService(c.env.CACHE, CACHE_TTL.AGENT_DETAIL);
      const agentEnrichments = await Promise.allSettled(
        searchResults.results.map(async (result) => {
          const { chainId, tokenId } = parseAgentId(result.agentId);
          const cacheKey = CACHE_KEYS.agentDetail(result.agentId);
          const cached = await agentCache.get<AgentDetail>(cacheKey);
          if (cached) {
            return { agentId: result.agentId, ...cached };
          }
          const agent = await sdk.getAgent(chainId, tokenId);
          if (agent) {
            await agentCache.set(cacheKey, agent, CACHE_TTL.AGENT_DETAIL);
            return { agentId: result.agentId, ...agent };
          }
          return null;
        })
      );

      // Build enrichment map
      type EnrichmentData = {
        hasMcp: boolean;
        hasA2a: boolean;
        x402Support: boolean;
        supportedTrust: TrustMethod[];
        image?: string;
        operators?: string[];
        ens?: string;
        did?: string;
        walletAddress?: string;
      };
      const enrichmentMap = new Map<string, EnrichmentData>();
      for (let i = 0; i < agentEnrichments.length; i++) {
        const enrichment = agentEnrichments[i];
        const agentId = searchResults.results[i]?.agentId;
        if (agentId && enrichment?.status === 'fulfilled' && enrichment.value) {
          const v = enrichment.value;
          enrichmentMap.set(agentId, {
            hasMcp: v.hasMcp,
            hasA2a: v.hasA2a,
            x402Support: v.x402Support,
            supportedTrust: v.supportedTrust,
            image: v.image,
            operators: v.operators,
            ens: v.ens,
            did: v.did,
            walletAddress: v.walletAddress,
          });
        }
      }

      // Transform to AgentSummary format
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Agent enrichment requires multiple metadata extractions
      const enrichedAgents: AgentSummary[] = searchResults.results.map((result) => {
        const { tokenId } = parseAgentId(result.agentId);
        const meta = result.metadata || {};
        const classificationRow = classificationsMap.get(result.agentId);
        const oasf = parseClassificationRow(classificationRow);
        const sdkData = enrichmentMap.get(result.agentId);

        let hasMcp: boolean;
        let hasA2a: boolean;
        let x402Support: boolean;
        let supportedTrust: TrustMethod[];
        let image: string | undefined;
        let operators: string[] | undefined;
        let ens: string | undefined;
        let did: string | undefined;
        let walletAddress: string | undefined;

        if (sdkData) {
          hasMcp = sdkData.hasMcp;
          hasA2a = sdkData.hasA2a;
          x402Support = sdkData.x402Support;
          supportedTrust = sdkData.supportedTrust;
          image = sdkData.image;
          operators = sdkData.operators;
          ens = sdkData.ens;
          did = sdkData.did;
          walletAddress = sdkData.walletAddress;
        } else {
          const mcpTools = Array.isArray(meta.mcpTools) ? meta.mcpTools : [];
          const mcpPrompts = Array.isArray(meta.mcpPrompts) ? meta.mcpPrompts : [];
          const mcpResources = Array.isArray(meta.mcpResources) ? meta.mcpResources : [];
          const a2aSkills = Array.isArray(meta.a2aSkills) ? meta.a2aSkills : [];
          const supportedTrusts = Array.isArray(meta.supportedTrusts) ? meta.supportedTrusts : [];

          hasMcp = mcpTools.length > 0 || mcpPrompts.length > 0 || mcpResources.length > 0;
          hasA2a = a2aSkills.length > 0;
          x402Support = meta.x402support === true;
          supportedTrust = [];
          if (supportedTrusts.includes('x402') || meta.x402support === true)
            supportedTrust.push('x402');
          if (supportedTrusts.includes('eas')) supportedTrust.push('eas');
          image = typeof meta.image === 'string' ? meta.image : undefined;
          operators = Array.isArray(meta.operators) ? meta.operators : [];
          ens = typeof meta.ens === 'string' ? meta.ens : undefined;
          did = typeof meta.did === 'string' ? meta.did : undefined;
          walletAddress = typeof meta.agentWallet === 'string' ? meta.agentWallet : undefined;
        }

        const mcpPrompts = Array.isArray(meta.mcpPrompts) ? meta.mcpPrompts : [];
        const mcpResources = Array.isArray(meta.mcpResources) ? meta.mcpResources : [];

        return {
          id: result.agentId,
          chainId: result.chainId,
          tokenId,
          name: result.name,
          description: result.description,
          image,
          active: typeof meta.active === 'boolean' ? meta.active : true,
          hasMcp,
          hasA2a,
          x402Support,
          supportedTrust,
          operators: operators ?? [],
          ens,
          did,
          walletAddress,
          oasf,
          oasfSource: (oasf ? 'llm-classification' : 'none') as OASFSource,
          searchScore: result.score,
          matchReasons: result.matchReasons,
          inputModes: mcpPrompts.length > 0 ? ['mcp-prompt'] : undefined,
          outputModes: mcpResources.length > 0 ? ['mcp-resource'] : undefined,
        };
      });

      // Apply filters
      const filteredAgents = applyFilters(enrichedAgents, body.filters);
      finalAgents = filteredAgents.slice(0, body.limit);
      total = filteredAgents.length;
      hasMore = filteredAgents.length > body.limit;
      nextCursor = searchResults.nextCursor;
      byChain = searchResults.byChain;
      searchMode = 'vector';
    } catch (vectorSearchError) {
      // ========== FALLBACK: SDK NAME SEARCH (only for 'auto' mode) ==========
      // For 'semantic' mode, we would have already returned above (no fallback)
      c.get('logger').warn('Vector search failed, falling back to SDK name search', {
        error: vectorSearchError instanceof Error ? vectorSearchError.message : String(vectorSearchError),
      });

      try {
        const result = await performNameSearch(c.env, sdk, body, 'fallback');
        finalAgents = result.agents;
        total = result.total;
        hasMore = result.hasMore;
        nextCursor = result.nextCursor;
        byChain = result.byChain;
        searchMode = 'fallback';
      } catch (sdkError) {
        // Both searches failed
        c.get('logger').logError('SDK fallback search also failed', sdkError);
        return errors.internalError(c, 'Search service error');
      }
    }
  }

  // Build response
  const response: SearchResponse = {
    success: true,
    data: finalAgents,
    meta: {
      query: body.query,
      total,
      hasMore,
      nextCursor,
      byChain,
      searchMode,
    },
  };

  // Cache full response only for first page
  if (!body.cursor) {
    const cacheKey = responseCache.generateKey('search', body);
    await responseCache.set(cacheKey, response, CACHE_TTL.SEARCH);
  }

  return c.json(response);
});

export { search };
