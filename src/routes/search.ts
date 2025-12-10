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
import { createSDKService } from '@/services/sdk';
import { createSearchService } from '@/services/search';
import type { Env, OASFSource, SearchResponse, Variables } from '@/types';
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

    // Enrich search results with agent data and classifications
    const sdk = createSDKService(c.env);

    // Fetch chain stats for totals (cached)
    const chainStats = await sdk.getChainStats();

    const enrichedAgents = await Promise.all(
      searchResults.results.map(async (result) => {
        const { chainId, tokenId } = parseAgentId(result.agentId);
        const agent = await sdk.getAgent(chainId, tokenId);

        // Get classification from batch result
        const classificationRow = classificationsMap.get(result.agentId);
        const oasf = parseClassificationRow(classificationRow);

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
        };
      })
    );

    // Build stats breakdown by chain
    const stats = {
      total: chainStats.reduce((sum, c) => sum + c.totalCount, 0),
      withRegistrationFile: chainStats.reduce((sum, c) => sum + c.withRegistrationFileCount, 0),
      active: chainStats.reduce((sum, c) => sum + c.activeCount, 0),
      byChain: chainStats.map((c) => ({
        chainId: c.chainId,
        name: c.name,
        totalCount: c.totalCount,
        withRegistrationFileCount: c.withRegistrationFileCount,
        activeCount: c.activeCount,
      })),
    };

    const response: SearchResponse = {
      success: true,
      data: enrichedAgents,
      meta: {
        query: body.query,
        total: searchResults.total,
        hasMore: searchResults.hasMore,
        nextCursor: searchResults.nextCursor,
        byChain: searchResults.byChain,
        stats,
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
