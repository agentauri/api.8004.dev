/**
 * Search endpoint
 * @module routes/search
 */

import { getClassificationsBatch } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  type SearchRequestBody,
  parseAgentId,
  parseClassificationRow,
  searchRequestSchema,
} from '@/lib/utils/validation';
import { CACHE_TTL, createCacheService } from '@/services/cache';
import { createSearchService } from '@/services/search';
import type { Env, OASFSource, SearchResponse, TrustMethod, Variables } from '@/types';
import { Hono } from 'hono';

const search = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
search.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * POST /api/v1/search
 * Perform semantic search for agents
 */
search.post('/', async (c) => {
  // Parse and validate request body
  let body: SearchRequestBody;
  try {
    const rawBody = await c.req.json();
    body = searchRequestSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as { errors?: Array<{ message: string }> };
      return errors.validationError(c, zodError.errors?.[0]?.message ?? 'Invalid request body');
    }
    return errors.badRequest(c, 'Invalid JSON body');
  }

  try {
    // Cache for search results pagination (used by search service)
    const searchResultsCache = createCacheService(c.env.CACHE, CACHE_TTL.SEARCH_RESULTS);

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

    // Perform search (pass cache for pagination support)
    const searchService = createSearchService(c.env.SEARCH_SERVICE_URL, searchResultsCache);
    const searchResults = await searchService.search({
      query: body.query,
      limit: body.limit,
      minScore: body.minScore,
      cursor: body.cursor,
      offset: body.offset,
      filters: body.filters,
    });

    // Batch fetch classifications for all search results (N+1 fix)
    const agentIds = searchResults.results.map((r) => r.agentId);
    const classificationsMap = await getClassificationsBatch(c.env.DB, agentIds);

    // Enrich search results using metadata from search service (no SDK calls needed)
    // The search service already includes all agent data in the metadata field
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Agent enrichment requires multiple metadata extractions
    const enrichedAgents = searchResults.results.map((result) => {
      const { tokenId } = parseAgentId(result.agentId);
      const meta = result.metadata || {};

      // Get classification from batch result
      const classificationRow = classificationsMap.get(result.agentId);
      const oasf = parseClassificationRow(classificationRow);

      // Extract arrays from metadata
      const mcpTools = Array.isArray(meta.mcpTools) ? meta.mcpTools : [];
      const mcpPrompts = Array.isArray(meta.mcpPrompts) ? meta.mcpPrompts : [];
      const mcpResources = Array.isArray(meta.mcpResources) ? meta.mcpResources : [];
      const a2aSkills = Array.isArray(meta.a2aSkills) ? meta.a2aSkills : [];
      const supportedTrusts = Array.isArray(meta.supportedTrusts) ? meta.supportedTrusts : [];

      // Calculate hasMcp and hasA2a from arrays
      const hasMcp = mcpTools.length > 0 || mcpPrompts.length > 0 || mcpResources.length > 0;
      const hasA2a = a2aSkills.length > 0;

      // Map supportedTrusts to TrustMethod types
      const supportedTrust: TrustMethod[] = [];
      if (supportedTrusts.includes('x402') || meta.x402support === true) {
        supportedTrust.push('x402');
      }
      if (supportedTrusts.includes('eas')) {
        supportedTrust.push('eas');
      }

      return {
        id: result.agentId,
        chainId: result.chainId,
        tokenId,
        name: result.name,
        description: result.description,
        image: typeof meta.image === 'string' ? meta.image : undefined,
        active: typeof meta.active === 'boolean' ? meta.active : true,
        hasMcp,
        hasA2a,
        x402Support: meta.x402support === true,
        supportedTrust,
        operators: Array.isArray(meta.operators) ? meta.operators : [],
        ens: typeof meta.ens === 'string' ? meta.ens : undefined,
        did: typeof meta.did === 'string' ? meta.did : undefined,
        walletAddress: typeof meta.agentWallet === 'string' ? meta.agentWallet : undefined,
        oasf,
        oasfSource: (oasf ? 'llm-classification' : 'none') as OASFSource,
        searchScore: result.score,
        matchReasons: result.matchReasons,
        inputModes: mcpPrompts.length > 0 ? ['mcp-prompt'] : undefined,
        outputModes: mcpResources.length > 0 ? ['mcp-resource'] : undefined,
      };
    });

    // Note: Chain stats are now optional for search results to avoid slow SDK calls
    // If stats are critical, they should be fetched from a cached endpoint separately

    const response: SearchResponse = {
      success: true,
      data: enrichedAgents,
      meta: {
        query: body.query,
        total: searchResults.total,
        hasMore: searchResults.hasMore,
        nextCursor: searchResults.nextCursor,
        byChain: searchResults.byChain,
      },
    };

    // Cache full response only for first page (no cursor in request)
    if (!body.cursor) {
      const cacheKey = responseCache.generateKey('search', body);
      await responseCache.set(cacheKey, response, CACHE_TTL.SEARCH);
    }

    return c.json(response);
  } catch (error) {
    console.error('Search error:', error);
    return errors.internalError(c, 'Search service error');
  }
});

export { search };
