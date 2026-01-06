/**
 * Search endpoint (Qdrant-based)
 * Simplified version using native Qdrant filtering, sorting, and pagination
 * @module routes/search-qdrant
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { getClassificationsBatch } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  parseClassificationRow,
  type SearchRequestBody,
  searchRequestSchema,
} from '@/lib/utils/validation';
import { CACHE_TTL, createCacheService } from '@/services/cache';
import { createQdrantSearchService, searchFiltersToAgentFilters } from '@/services/qdrant-search';
import type { AgentSummary, Env, OASFSource, SearchResponse, Variables } from '@/types';

const search = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
search.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * POST /api/v1/search
 * Perform semantic search for agents
 * All filtering, sorting, and pagination handled natively by Qdrant
 */
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

  // Check response cache only for first page
  if (!body.cursor) {
    const cacheKey = responseCache.generateKey('search:qdrant', body);
    const cached = await responseCache.get<SearchResponse>(cacheKey);
    if (cached) {
      return c.json(cached);
    }
  }

  // Create Qdrant search service
  const searchService = createQdrantSearchService(c.env);

  // Build filters for Qdrant (ALL filters supported natively!)
  const filters = body.filters
    ? searchFiltersToAgentFilters({
        chainIds: body.filters.chainIds,
        active: body.filters.active,
        mcp: body.filters.mcp,
        a2a: body.filters.a2a,
        x402: body.filters.x402,
        skills: body.filters.skills,
        domains: body.filters.domains,
        filterMode: body.filters.filterMode,
        // Extended filters (matching GET /agents for consistency)
        mcpTools: body.filters.mcpTools,
        a2aSkills: body.filters.a2aSkills,
        // Reputation filters
        minRep: body.filters.minRep,
        maxRep: body.filters.maxRep,
        // Wallet filters
        owner: body.filters.owner,
        walletAddress: body.filters.walletAddress,
        // Trust model filters
        trustModels: body.filters.trustModels,
        hasTrusts: body.filters.hasTrusts,
        // Reachability filters
        reachableA2a: body.filters.reachableA2a,
        reachableMcp: body.filters.reachableMcp,
        // Registration file filter
        hasRegistrationFile: body.filters.hasRegistrationFile,
      })
    : undefined;

  // Perform search with Qdrant - ALL in one request!
  const searchResult = await searchService.search({
    query: body.query,
    limit: body.limit,
    minScore: body.minScore,
    cursor: body.cursor,
    offset: body.offset,
    filters,
  });

  // Batch fetch classifications from D1 database
  const agentIds = searchResult.results.map((r) => r.agentId);
  const classificationsMap = await getClassificationsBatch(c.env.DB, agentIds);

  // Check if filtering by skills/domains is active
  const isFilteringByOasf = Boolean(body.filters?.skills || body.filters?.domains);

  // Transform results to AgentSummary format
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Search result transformation requires OASF source selection logic
  const agents: AgentSummary[] = searchResult.results.map((result) => {
    const tokenId = result.agentId.split(':')[1] ?? '0';
    const qdrantSkills = result.metadata?.skills ?? [];
    const qdrantDomains = result.metadata?.domains ?? [];

    // Get classification from D1
    const classificationRow = classificationsMap.get(result.agentId);
    const d1Oasf = parseClassificationRow(classificationRow);

    // Get classification from Qdrant metadata
    const hasQdrantOasf = qdrantSkills.length > 0 || qdrantDomains.length > 0;
    const qdrantOasf = hasQdrantOasf
      ? {
          skills: qdrantSkills.map((slug) => ({ slug, confidence: 1 })),
          domains: qdrantDomains.map((slug) => ({ slug, confidence: 1 })),
          confidence: 1,
          classifiedAt: new Date().toISOString(),
          modelVersion: 'qdrant-indexed',
        }
      : undefined;

    // When filtering by skills/domains, prefer Qdrant metadata to ensure consistency
    // between filter criteria and displayed results. Otherwise prefer D1 (more detailed).
    const oasf = isFilteringByOasf ? (qdrantOasf ?? d1Oasf) : (d1Oasf ?? qdrantOasf);

    return {
      id: result.agentId,
      chainId: result.chainId,
      tokenId,
      name: result.name,
      description: result.description,
      image: result.metadata?.image,
      active: result.metadata?.active ?? true,
      hasMcp: result.metadata?.hasMcp ?? false,
      hasA2a: result.metadata?.hasA2a ?? false,
      x402Support: result.metadata?.x402Support ?? false,
      supportedTrust: result.metadata?.x402Support ? ['x402'] : [],
      operators: [],
      ens: result.metadata?.ens,
      did: result.metadata?.did,
      oasf,
      oasfSource: (oasf ? 'llm-classification' : 'none') as OASFSource,
      searchScore: result.score,
      matchReasons: result.matchReasons,
      reputationScore: result.metadata?.reputation,
    };
  });

  // Build response
  const response: SearchResponse = {
    success: true,
    data: agents,
    meta: {
      query: body.query,
      total: searchResult.total,
      hasMore: searchResult.hasMore,
      nextCursor: searchResult.nextCursor,
      byChain: searchResult.byChain,
      searchMode: 'vector',
    },
  };

  // Cache full response only for first page
  if (!body.cursor) {
    const cacheKey = responseCache.generateKey('search:qdrant', body);
    await responseCache.set(cacheKey, response, CACHE_TTL.SEARCH);
  }

  return c.json(response);
});

export { search };
