/**
 * Agents endpoints (Qdrant-based)
 * Simplified version using native Qdrant filtering, sorting, and pagination
 * @module routes/agents-qdrant
 */

import { Hono } from 'hono';
import { enqueueClassificationsBatch, getClassification } from '@/db/queries';
import { buildOASFFromQdrantMetadata, determineOASFSource } from '@/lib/utils/agent-transform';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  agentEvaluationsQuerySchema,
  agentIdSchema,
  listAgentsQuerySchema,
  parseAgentId,
  parseClassificationRow,
} from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { findComplementaryAgents, findIOCompatibleAgents } from '@/services/complementarity';
import { getAgentEvaluations } from '@/services/evaluator';
import { createIPFSService } from '@/services/ipfs';
import { resolveClassification, toOASFClassification } from '@/services/oasf-resolver';
import { sortAgents } from '@/services/pagination-cache';
import { createQdrantClient } from '@/services/qdrant';
import { createQdrantSearchService, searchFiltersToAgentFilters } from '@/services/qdrant-search';
import { createReputationService } from '@/services/reputation';
import { createSDKService } from '@/services/sdk';
import type { McpCapabilitiesDetail } from '@/types/agent';
import type {
  AgentDetailResponse,
  AgentListResponse,
  AgentSummary,
  ChainStats,
  Env,
  OASFSource,
  SearchResultItem,
  Variables,
} from '@/types';
import {
  buildAgentSummary,
  buildOASFClassification,
} from '@/lib/utils/agent-transform';
import { classify } from './classify';
import { healthAgent } from './health-agent';
import { reputation } from './reputation';
import { verification } from './verification';

/**
 * Convert SearchResultItem to AgentSummary for similar agents response
 * Uses centralized transformation utilities
 */
function searchResultToAgentSummary(result: SearchResultItem): AgentSummary {
  const qdrantSkills = result.metadata?.skills ?? [];
  const qdrantDomains = result.metadata?.domains ?? [];

  const oasf = buildOASFClassification({
    skills: qdrantSkills,
    domains: qdrantDomains,
    skillsWithConfidence: result.metadata?.skills_with_confidence,
    domainsWithConfidence: result.metadata?.domains_with_confidence,
    confidence: result.metadata?.classification_confidence,
    classifiedAt: result.metadata?.classification_at,
    modelVersion: result.metadata?.classification_model,
  });

  return buildAgentSummary(
    {
      agentId: result.agentId,
      name: result.name,
      description: result.description,
      image: result.metadata?.image,
      active: result.metadata?.active ?? true,
      hasMcp: result.metadata?.hasMcp ?? false,
      hasA2a: result.metadata?.hasA2a ?? false,
      x402Support: result.metadata?.x402Support ?? false,
      operators: result.metadata?.operators,
      ens: result.metadata?.ens,
      did: result.metadata?.did,
      walletAddress: result.metadata?.walletAddress,
      owner: result.metadata?.owner,
      reputationScore: result.metadata?.reputation,
      searchScore: result.score,
      erc8004Version: result.metadata?.erc8004Version,
    },
    oasf
  );
}

/**
 * Enqueue classification jobs for unclassified agents
 */
async function enqueueClassificationsWithQueue(env: Env, agentIds: string[]): Promise<number> {
  if (agentIds.length === 0) return 0;

  const enqueuedAgentIds = await enqueueClassificationsBatch(env.DB, agentIds);
  if (enqueuedAgentIds.length === 0) return 0;

  const sendPromises = enqueuedAgentIds.map((agentId) =>
    env.CLASSIFICATION_QUEUE.send({ agentId, force: false })
  );
  await Promise.all(sendPromises);

  return enqueuedAgentIds.length;
}

/**
 * Get chain stats with caching
 */
async function getCachedChainStats(
  env: Env,
  sdk: ReturnType<typeof createSDKService>
): Promise<ChainStats[]> {
  const cache = createCacheService(env.CACHE, CACHE_TTL.CHAIN_STATS);
  const cacheKey = CACHE_KEYS.chainStats();

  const cached = await cache.get<{ data: ChainStats[] }>(cacheKey);
  if (cached?.data) {
    return cached.data;
  }

  const stats = await sdk.getChainStats();
  const hasErrors = stats.some((s) => s.status === 'error');
  if (!hasErrors) {
    await cache.set(cacheKey, { success: true, data: stats }, CACHE_TTL.CHAIN_STATS);
  }

  return stats;
}

const agents = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
agents.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/agents
 * List agents with optional filters and search
 * All filtering, sorting, and pagination handled natively by Qdrant
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Main agent list endpoint handles 20+ filter types requiring extensive branching
agents.get('/', async (c) => {
  // Parse and validate query parameters
  const rawQuery = c.req.query();
  const rawQueries = c.req.queries();

  // Merge array values for bracket notation (chainIds[], skills[], domains[], etc.)
  const arrayParams = ['chainIds[]', 'skills[]', 'domains[]', 'mcpTools[]', 'a2aSkills[]'];
  for (const param of arrayParams) {
    if (rawQueries[param] && rawQueries[param].length > 1) {
      (rawQuery as Record<string, unknown>)[param] = rawQueries[param];
    }
  }

  const queryResult = listAgentsQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.issues[0]?.message ?? 'Invalid query');
  }

  const query = queryResult.data;
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENTS);
  const cacheKey = cache.generateKey('agents:list:qdrant', query);

  // Check cache
  const cached = await cache.get<AgentListResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Resolve chain IDs
  const chainIds =
    query['chainIds[]'] ??
    query.chainIds ??
    query.chains ??
    (query.chainId ? [query.chainId] : undefined);

  // Calculate offset from page, offset param, or cursor
  // Priority: page > offset > cursor
  let offset: number | undefined;
  if (query.page) {
    offset = (query.page - 1) * query.limit;
  } else if (query.offset !== undefined) {
    offset = query.offset;
  } else if (query.cursor) {
    // Decode cursor to extract offset
    try {
      const decoded = Buffer.from(query.cursor, 'base64url').toString('utf-8');
      const cursorData = JSON.parse(decoded) as { _global_offset?: number };
      const cursorOffset = cursorData._global_offset ?? 0;
      // Validate offset bounds to prevent negative values from malicious cursors
      offset = cursorOffset >= 0 ? cursorOffset : 0;
    } catch {
      // Invalid cursor, start from beginning
      offset = undefined;
    }
  }

  // Create Qdrant search service
  const searchService = createQdrantSearchService(c.env);

  // Resolve array filters (merge CSV and bracket notation)
  const skills = query['skills[]'] ?? query.skills;
  const domains = query['domains[]'] ?? query.domains;
  const mcpTools = query['mcpTools[]'] ?? query.mcpTools;
  const a2aSkills = query['a2aSkills[]'] ?? query.a2aSkills;

  // Build filters for Qdrant (ALL filters supported natively!)
  const filters = searchFiltersToAgentFilters({
    chainIds,
    active: query.active,
    mcp: query.mcp,
    a2a: query.a2a,
    x402: query.x402,
    skills,
    domains,
    filterMode: query.filterMode,
    // Extended filters
    mcpTools,
    a2aSkills,
    minRep: query.minRep,
    maxRep: query.maxRep,
    // Wallet filters
    owner: query.owner,
    walletAddress: query.walletAddress,
    // Trust model filters
    trustModels: query.trustModels,
    hasTrusts: query.hasTrusts,
    // Reachability filters
    reachableA2a: query.reachableA2a,
    reachableMcp: query.reachableMcp,
    // Registration file filter
    hasRegistrationFile: query.hasRegistrationFile,
    // Exact match filters (new)
    ens: query.ens,
    did: query.did,
    // Exclusion filters (notIn)
    excludeChainIds: query.excludeChainIds,
    excludeSkills: query.excludeSkills,
    excludeDomains: query.excludeDomains,
  });

  // Perform search with Qdrant
  const searchResult = await searchService.search({
    query: query.q,
    limit: query.limit,
    minScore: query.minScore,
    cursor: query.cursor,
    offset,
    filters,
    sort: query.sort,
    order: query.order,
  });

  // SDK fallback: If Qdrant returns 0 results and no semantic query, try SDK directly
  // This handles the case when Qdrant is empty or needs resyncing
  // Note: Only fall back if user is NOT explicitly asking for hasRegistrationFile=false,
  // since SDK only returns agents WITH registration files
  const sdk = createSDKService(c.env, c.env.CACHE);

  const shouldFallback =
    searchResult.results.length === 0 && !query.q && query.hasRegistrationFile !== false; // Don't fallback if user wants agents without reg files

  if (shouldFallback) {
    console.info('Qdrant returned 0 results, falling back to SDK...');
    try {
      const effectiveOffset = offset ?? 0;

      // For sorted pagination, we need to fetch ALL matching items to ensure correct global order
      // Since SDK doesn't support server-side sorting by name, we must fetch, sort, then slice
      // When sorting is requested (non-relevance), fetch a large window to ensure correct ordering
      const needsClientSort = query.sort && query.sort !== 'relevance';
      const fetchLimit = needsClientSort
        ? Math.max(500, effectiveOffset + query.limit + 1) // Fetch at least 500 items for sorted queries
        : effectiveOffset + query.limit + 1;

      // Note: We don't pass cursor to SDK since we handle pagination via offset
      // The SDK has its own cursor format that's incompatible with our offset-based cursors
      const sdkResult = await sdk.getAgents({
        limit: fetchLimit,
        hasRegistrationFile: query.hasRegistrationFile ?? true,
        chainIds,
        active: query.active,
        hasMcp: query.mcp,
        hasA2a: query.a2a,
        hasX402: query.x402,
      });

      // Convert SDK results to search results format
      if (sdkResult.items.length > 0) {
        const allSdkAgents: AgentSummary[] = sdkResult.items.map((item) => ({
          id: item.id,
          chainId: Number(item.id.split(':')[0]),
          tokenId: item.id.split(':')[1] ?? '0',
          name: item.name,
          description: item.description,
          image: item.image,
          active: item.active,
          hasMcp: item.hasMcp,
          hasA2a: item.hasA2a,
          x402Support: item.x402Support,
          supportedTrust: item.x402Support ? ['x402'] : [],
          operators: item.operators,
          ens: item.ens,
          did: item.did,
          oasf: undefined,
          oasfSource: 'none' as OASFSource,
          searchScore: undefined,
          matchReasons: [],
          reputationScore: undefined,
        }));

        // Apply sorting to SDK fallback results if requested
        let sortedSdkAgents = allSdkAgents;
        if (query.sort && query.sort !== 'relevance') {
          sortedSdkAgents = sortAgents(allSdkAgents, query.sort, query.order ?? 'desc');
        }

        // Apply offset pagination - slice from offset to offset + limit
        const paginatedAgents = sortedSdkAgents.slice(
          effectiveOffset,
          effectiveOffset + query.limit
        );
        const hasMore = sortedSdkAgents.length > effectiveOffset + query.limit;

        // Get chain stats for totals
        const chainStats = await getCachedChainStats(c.env, sdk);
        const stats = {
          total: chainStats.reduce((sum, s) => sum + s.totalCount, 0),
          withRegistrationFile: chainStats.reduce((sum, s) => sum + s.withRegistrationFileCount, 0),
          active: chainStats.reduce((sum, s) => sum + s.activeCount, 0),
          byChain: chainStats.map((s) => ({
            chainId: s.chainId,
            name: s.name,
            totalCount: s.totalCount,
            withRegistrationFileCount: s.withRegistrationFileCount,
            activeCount: s.activeCount,
          })),
        };

        // Generate cursor for next page based on offset
        const nextOffset = effectiveOffset + query.limit;
        const nextCursor = hasMore
          ? Buffer.from(JSON.stringify({ _global_offset: nextOffset })).toString('base64url')
          : undefined;

        const fallbackResponse: AgentListResponse = {
          success: true,
          data: paginatedAgents,
          meta: {
            total: sdkResult.total ?? allSdkAgents.length,
            hasMore,
            nextCursor,
            stats,
            searchMode: 'fallback',
          },
        };

        // Cache the SDK fallback response for a short time
        await cache.set(cacheKey, fallbackResponse, CACHE_TTL.AGENTS);
        return c.json(fallbackResponse);
      }
    } catch (sdkError) {
      console.error(
        'SDK fallback failed:',
        sdkError instanceof Error ? sdkError.message : sdkError
      );
      // Continue with empty Qdrant results if SDK also fails
    }
  }

  // Transform results to AgentSummary format using Qdrant payload directly
  // Classifications are synced from D1 to Qdrant every 15 min via d1-sync-worker
  // Phase 2 adds confidence scores to Qdrant payload
  let agents: AgentSummary[] = searchResult.results.map((result) => {
    const oasf = buildOASFFromQdrantMetadata(result.metadata);

    return {
      id: result.agentId,
      chainId: result.chainId,
      tokenId: result.agentId.split(':')[1] ?? '0',
      name: result.name,
      description: result.description,
      image: result.metadata?.image,
      active: result.metadata?.active ?? true,
      hasMcp: result.metadata?.hasMcp ?? false,
      hasA2a: result.metadata?.hasA2a ?? false,
      x402Support: result.metadata?.x402Support ?? false,
      supportedTrust: result.metadata?.x402Support ? ['x402'] : [],
      owner: result.metadata?.owner,
      operators: result.metadata?.operators ?? [],
      ens: result.metadata?.ens,
      did: result.metadata?.did,
      walletAddress: result.metadata?.walletAddress,
      oasf,
      oasfSource: determineOASFSource(oasf),
      searchScore: result.score,
      matchReasons: result.matchReasons,
      reputationScore: result.metadata?.reputation,
    };
  });

  // NOTE: Reputation filtering is now handled natively by Qdrant via filter-builder.ts
  // No client-side filtering needed - Qdrant's reputation range filter is applied in searchFiltersToAgentFilters

  // Apply custom sorting if requested (Qdrant returns by score, we need to re-sort for name/createdAt)
  if (query.sort && query.sort !== 'relevance') {
    agents = sortAgents(agents, query.sort, query.order ?? 'desc');
  }

  // Get chain stats for totals (SDK already created above for fallback)
  const chainStats = await getCachedChainStats(c.env, sdk);
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

  const response: AgentListResponse = {
    success: true,
    data: agents,
    meta: {
      total: searchResult.total,
      hasMore: searchResult.hasMore,
      nextCursor: searchResult.nextCursor,
      stats,
      searchMode: query.q ? 'vector' : undefined,
    },
  };

  // Trigger background classification for unclassified agents
  const unclassifiedIds = agents
    .filter((a) => !a.oasf)
    .slice(0, 10)
    .map((a) => a.id);

  if (unclassifiedIds.length > 0) {
    c.executionCtx.waitUntil(
      enqueueClassificationsWithQueue(c.env, unclassifiedIds).catch((err) => {
        console.error('Failed to enqueue classifications:', err);
      })
    );
  }

  await cache.set(cacheKey, response, CACHE_TTL.AGENTS);
  return c.json(response);
});

/**
 * GET /api/v1/agents/batch
 * Get multiple agents by IDs in a single request
 * Max 50 IDs per request
 */
agents.get('/batch', async (c) => {
  const idsParam = c.req.query('ids');

  if (!idsParam) {
    return errors.validationError(c, 'Missing required parameter: ids');
  }

  // Parse and validate IDs
  const ids = idsParam
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (ids.length === 0) {
    return errors.validationError(c, 'At least one agent ID is required');
  }

  if (ids.length > 50) {
    return errors.validationError(c, 'Maximum 50 IDs allowed per request');
  }

  // Validate each ID format
  const invalidIds: string[] = [];
  const validIds: string[] = [];
  for (const id of ids) {
    const result = agentIdSchema.safeParse(id);
    if (result.success) {
      validIds.push(id);
    } else {
      invalidIds.push(id);
    }
  }

  if (invalidIds.length > 0 && validIds.length === 0) {
    return errors.validationError(
      c,
      `Invalid agent ID format. Expected chainId:tokenId. Invalid IDs: ${invalidIds.slice(0, 5).join(', ')}${invalidIds.length > 5 ? '...' : ''}`
    );
  }

  // Fetch agents from SDK
  const sdk = createSDKService(c.env, c.env.CACHE);
  const foundAgents: Array<{
    id: string;
    chainId: number;
    tokenId: string;
    name: string;
    description: string;
    image?: string;
    active: boolean;
    hasMcp: boolean;
    hasA2a: boolean;
    x402Support: boolean;
  }> = [];
  const missingIds: string[] = [];

  // Fetch each agent in parallel
  const fetchPromises = validIds.map(async (agentId) => {
    const { chainId, tokenId } = parseAgentId(agentId);
    try {
      const agent = await sdk.getAgent(chainId, tokenId);
      if (agent) {
        return {
          found: true as const,
          agent: {
            id: agentId,
            chainId,
            tokenId,
            name: agent.name,
            description: agent.description,
            image: agent.image,
            active: agent.active,
            hasMcp: agent.hasMcp,
            hasA2a: agent.hasA2a,
            x402Support: agent.x402Support,
          },
        };
      }
      return { found: false as const, id: agentId };
    } catch {
      return { found: false as const, id: agentId };
    }
  });

  const results = await Promise.all(fetchPromises);

  for (const result of results) {
    if (result.found) {
      foundAgents.push(result.agent);
    } else {
      missingIds.push(result.id);
    }
  }

  return c.json({
    success: true,
    data: foundAgents,
    meta: {
      requested: validIds.length,
      found: foundAgents.length,
      missing: missingIds,
      invalid: invalidIds,
    },
  });
});

/**
 * GET /api/v1/agents/:agentId
 * Get single agent details
 */
agents.get('/:agentId', async (c) => {
  const agentIdParam = c.req.param('agentId');

  const agentIdResult = agentIdSchema.safeParse(agentIdParam);
  if (!agentIdResult.success) {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const agentId = agentIdResult.data;
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENT_DETAIL);
  const cacheKey = CACHE_KEYS.agentDetail(agentId);

  const cached = await cache.get<AgentDetailResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const { chainId, tokenId } = parseAgentId(agentId);
  const sdk = createSDKService(c.env, c.env.CACHE);
  const agent = await sdk.getAgent(chainId, tokenId);

  if (!agent) {
    return errors.notFound(c, 'Agent');
  }

  const ipfsService = createIPFSService(cache, {
    gatewayUrl: c.env.IPFS_GATEWAY_URL,
    timeoutMs: c.env.IPFS_TIMEOUT_MS ? Number.parseInt(c.env.IPFS_TIMEOUT_MS, 10) : undefined,
  });

  // Create Qdrant client to fetch MCP capabilities
  const qdrant = createQdrantClient({
    QDRANT_URL: c.env.QDRANT_URL!,
    QDRANT_API_KEY: c.env.QDRANT_API_KEY!,
    QDRANT_COLLECTION: c.env.QDRANT_COLLECTION ?? 'agents',
  });

  const [ipfsMetadata, classificationRow, reputationData, qdrantAgent] = await Promise.all([
    agent.registration.metadataUri
      ? ipfsService.fetchMetadata(agent.registration.metadataUri, agentId)
      : Promise.resolve(null),
    getClassification(c.env.DB, agentId),
    createReputationService(c.env.DB).getAgentReputation(agentId),
    qdrant.getByAgentId(agentId).catch(() => null), // Graceful fallback if Qdrant fails
  ]);

  const dbClassification = parseClassificationRow(classificationRow);
  const resolvedClassification = resolveClassification(ipfsMetadata, dbClassification);
  const oasf = toOASFClassification(resolvedClassification);

  // Extract MCP capabilities from Qdrant payload if available
  let mcpCapabilities: McpCapabilitiesDetail | undefined;
  if (qdrantAgent?.payload) {
    const p = qdrantAgent.payload;
    if (p.mcp_tools_detailed || p.mcp_prompts_detailed || p.mcp_resources_detailed) {
      mcpCapabilities = {
        tools: (p.mcp_tools_detailed ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        prompts: (p.mcp_prompts_detailed ?? []).map((pr) => ({
          name: pr.name,
          description: pr.description,
          arguments: pr.arguments?.map((a) => ({
            name: a.name,
            description: a.description,
            required: a.required,
          })),
        })),
        resources: (p.mcp_resources_detailed ?? []).map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        })),
        fetchedAt: p.mcp_capabilities_fetched_at,
        error: p.mcp_capabilities_error,
      };
    }
  }

  const response: AgentDetailResponse = {
    success: true,
    data: {
      ...agent,
      owner: agent.registration?.owner,
      oasf,
      oasfSource: resolvedClassification.source,
      reputation: reputationData ?? undefined,
      reputationScore: reputationData?.averageScore,
      reputationCount: reputationData?.count,
      endpoints: {
        ...agent.endpoints,
        oasf: ipfsMetadata?.oasfEndpoint,
      },
      mcpCapabilities,
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

/**
 * GET /api/v1/agents/:agentId/similar
 * Find agents with similar OASF classification
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Similar agents requires OASF matching with error handling
agents.get('/:agentId/similar', async (c) => {
  const agentIdParam = c.req.param('agentId');

  const result = agentIdSchema.safeParse(agentIdParam);
  if (!result.success) {
    return errors.validationError(c, result.error.issues[0]?.message ?? 'Invalid agent ID');
  }
  const agentId = result.data;

  const parsed = parseAgentId(agentId);
  if (!parsed) {
    return errors.validationError(c, 'Invalid agent ID format. Expected: chainId:tokenId');
  }

  const limitParam = c.req.query('limit');
  const limit = limitParam ? Math.min(Math.max(1, Number.parseInt(limitParam, 10)), 20) : 10;

  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENTS);
  const cacheKey = `${CACHE_KEYS.agentDetail(agentId)}:similar:${limit}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  try {
    const classification = await getClassification(c.env.DB, agentId);
    if (!classification) {
      return c.json({
        success: true,
        data: [],
        message: 'Agent has no classification - cannot find similar agents',
      });
    }

    let targetSkills: string[] = [];
    let targetDomains: string[] = [];
    try {
      const skills = JSON.parse(classification.skills);
      targetSkills = skills.map((s: { slug: string }) => s.slug);
    } catch (error) {
      console.error(
        `Invalid skills JSON for agent ${agentId}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
    try {
      const domains = JSON.parse(classification.domains);
      targetDomains = domains.map((d: { slug: string }) => d.slug);
    } catch (error) {
      console.error(
        `Invalid domains JSON for agent ${agentId}:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    if (targetSkills.length === 0 && targetDomains.length === 0) {
      return c.json({
        success: true,
        data: [],
        message: 'Agent has no skills or domains - cannot find similar agents',
      });
    }

    // Use Qdrant to search for agents with matching skills/domains
    const searchService = createQdrantSearchService(c.env);

    // Search by skills first, then domains
    const allResults: SearchResultItem[] = [];
    const seen = new Set<string>();

    if (targetSkills.length > 0) {
      const skillsResult = await searchService.search({
        limit: 50,
        filters: { skills: targetSkills },
      });
      for (const r of skillsResult.results) {
        if (r.agentId !== agentId && !seen.has(r.agentId)) {
          allResults.push(r);
          seen.add(r.agentId);
        }
      }
    }

    // Also search by domains if not enough results
    if (allResults.length < 50 && targetDomains.length > 0) {
      const domainsResult = await searchService.search({
        limit: 50,
        filters: { domains: targetDomains },
      });
      for (const r of domainsResult.results) {
        if (r.agentId !== agentId && !seen.has(r.agentId)) {
          allResults.push(r);
          seen.add(r.agentId);
        }
      }
    }

    // Compute similarity scores based on skill/domain overlap
    interface SimilarAgent extends AgentSummary {
      similarityScore: number;
      matchedSkills: string[];
      matchedDomains: string[];
    }

    const scoredAgents: SimilarAgent[] = allResults.map((r) => {
      const agentSkills = r.metadata?.skills ?? [];
      const agentDomains = r.metadata?.domains ?? [];

      // Calculate overlap
      const matchedSkills = targetSkills.filter((s) => agentSkills.includes(s));
      const matchedDomains = targetDomains.filter((d) => agentDomains.includes(d));

      // Jaccard-like similarity score
      const skillUnion = new Set([...targetSkills, ...agentSkills]).size;
      const domainUnion = new Set([...targetDomains, ...agentDomains]).size;

      const skillSimilarity = skillUnion > 0 ? matchedSkills.length / skillUnion : 0;
      const domainSimilarity = domainUnion > 0 ? matchedDomains.length / domainUnion : 0;

      // Weight skills more heavily (60% skills, 40% domains), return score as 0-1
      const similarityScore =
        Math.round((skillSimilarity * 0.6 + domainSimilarity * 0.4) * 100) / 100;

      return {
        ...searchResultToAgentSummary(r),
        similarityScore,
        matchedSkills,
        matchedDomains,
      };
    });

    // Sort by similarity score and take top N
    scoredAgents.sort((a, b) => b.similarityScore - a.similarityScore);
    const topSimilar = scoredAgents.filter((a) => a.similarityScore > 0).slice(0, limit);

    const response = {
      success: true as const,
      data: topSimilar,
      meta: {
        total: topSimilar.length,
        limit,
        targetAgent: agentId,
      },
    };

    await cache.set(cacheKey, response, CACHE_TTL.AGENTS);
    return c.json(response);
  } catch (error) {
    console.error('Similar agents error:', error);
    return errors.internalError(c, 'Failed to find similar agents');
  }
});

/**
 * GET /api/v1/agents/:agentId/complementary
 * Find agents that complement this agent (work well together, not substitutes)
 *
 * Complementary agents have:
 * - Different skills that work well together in workflows
 * - Some domain overlap (can communicate about same topics)
 * - Compatible protocol capabilities (MCP + A2A agents work together)
 * - Compatible trust models
 */
agents.get('/:agentId/complementary', async (c) => {
  const agentIdParam = c.req.param('agentId');

  const result = agentIdSchema.safeParse(agentIdParam);
  if (!result.success) {
    return errors.validationError(c, result.error.issues[0]?.message ?? 'Invalid agent ID');
  }
  const agentId = result.data;

  const parsed = parseAgentId(agentId);
  if (!parsed) {
    return errors.validationError(c, 'Invalid agent ID format. Expected: chainId:tokenId');
  }

  const limitParam = c.req.query('limit');
  const limit = limitParam ? Math.min(Math.max(1, Number.parseInt(limitParam, 10)), 20) : 10;

  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENTS);
  const cacheKey = `${CACHE_KEYS.agentDetail(agentId)}:complementary:${limit}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  try {
    const complementaryResult = await findComplementaryAgents(c.env, agentId, limit);

    const response = {
      success: true as const,
      data: complementaryResult.complementaryAgents,
      meta: {
        total: complementaryResult.complementaryAgents.length,
        limit,
        sourceAgentId: agentId,
        sourceSkills: complementaryResult.sourceSkills,
        sourceDomains: complementaryResult.sourceDomains,
        analysisTimeMs: complementaryResult.analysisTimeMs,
      },
    };

    await cache.set(cacheKey, response, CACHE_TTL.AGENTS);
    return c.json(response);
  } catch (error) {
    console.error('Complementary agents error:', error);
    return errors.internalError(c, 'Failed to find complementary agents');
  }
});

/**
 * GET /api/v1/agents/:agentId/compatible
 * Find I/O compatible agents for multi-agent pipelines
 *
 * Returns agents that can be chained together:
 * - Upstream: Agents whose output_modes match source's input_modes
 *   (can send data TO the source agent)
 * - Downstream: Agents whose input_modes match source's output_modes
 *   (can receive data FROM the source agent)
 */
agents.get('/:agentId/compatible', async (c) => {
  const agentIdParam = c.req.param('agentId');

  const result = agentIdSchema.safeParse(agentIdParam);
  if (!result.success) {
    return errors.validationError(c, result.error.issues[0]?.message ?? 'Invalid agent ID');
  }
  const agentId = result.data;

  const parsed = parseAgentId(agentId);
  if (!parsed) {
    return errors.validationError(c, 'Invalid agent ID format. Expected: chainId:tokenId');
  }

  const limitParam = c.req.query('limit');
  const limit = limitParam ? Math.min(Math.max(1, Number.parseInt(limitParam, 10)), 20) : 10;

  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENTS);
  const cacheKey = `${CACHE_KEYS.agentDetail(agentId)}:compatible:${limit}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  try {
    const compatibilityResult = await findIOCompatibleAgents(c.env, agentId, limit);

    const response = {
      success: true as const,
      data: {
        upstream: compatibilityResult.upstream,
        downstream: compatibilityResult.downstream,
      },
      meta: {
        sourceAgentId: agentId,
        sourceInputModes: compatibilityResult.sourceInputModes,
        sourceOutputModes: compatibilityResult.sourceOutputModes,
        upstreamCount: compatibilityResult.upstream.length,
        downstreamCount: compatibilityResult.downstream.length,
        limit,
        analysisTimeMs: compatibilityResult.analysisTimeMs,
      },
    };

    await cache.set(cacheKey, response, CACHE_TTL.AGENTS);
    return c.json(response);
  } catch (error) {
    console.error('I/O compatible agents error:', error);
    return errors.internalError(c, 'Failed to find I/O compatible agents');
  }
});

/**
 * GET /api/v1/agents/:agentId/evaluations
 * Get evaluation history for a specific agent
 */
agents.get('/:agentId/evaluations', async (c) => {
  const agentIdParam = c.req.param('agentId');

  const agentIdResult = agentIdSchema.safeParse(agentIdParam);
  if (!agentIdResult.success) {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const agentId = agentIdResult.data;
  const rawQuery = c.req.query();

  // Validate query params
  const queryResult = agentEvaluationsQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.issues[0]?.message ?? 'Invalid query');
  }

  const query = queryResult.data;

  // Check cache
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENT_DETAIL);
  const cacheKey = cache.generateKey(CACHE_KEYS.agentEvaluations(agentId, ''), query);

  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Calculate offset from cursor or offset param
  let offset = query.offset ?? 0;
  if (query.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf-8')) as {
        _global_offset?: number;
      };
      offset = decoded._global_offset ?? 0;
    } catch {
      // Invalid cursor, use default offset
    }
  }

  // Fetch evaluations
  const result = await getAgentEvaluations(c.env.DB, agentId, query.limit, offset);

  // Calculate pagination
  const hasMore = offset + result.evaluations.length < result.total;
  let nextCursor: string | undefined;
  if (hasMore) {
    const nextOffset = offset + query.limit;
    nextCursor = Buffer.from(JSON.stringify({ _global_offset: nextOffset })).toString('base64url');
  }

  const response = {
    success: true as const,
    data: result.evaluations,
    meta: {
      total: result.total,
      hasMore,
      nextCursor,
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.AGENT_DETAIL);

  return c.json(response);
});

// Mount classification routes
agents.route('/:agentId/classify', classify);

// Mount reputation routes
agents.route('/:agentId/reputation', reputation);

// Mount health routes
agents.route('/:agentId/health', healthAgent);

// Mount verification routes
agents.route('/:agentId/verification', verification);

export { agents };
