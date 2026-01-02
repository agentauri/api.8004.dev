/**
 * Agents endpoints (Qdrant-based)
 * Simplified version using native Qdrant filtering, sorting, and pagination
 * @module routes/agents-qdrant
 */

import { findComplementaryAgents, findIOCompatibleAgents } from '@/services/complementarity';
import { enqueueClassificationsBatch, getClassification } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  agentIdSchema,
  listAgentsQuerySchema,
  parseAgentId,
  parseClassificationRow,
} from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { createIPFSService } from '@/services/ipfs';
import { resolveClassification, toOASFClassification } from '@/services/oasf-resolver';
import {
  createQdrantSearchService,
  payloadToAgentSummary,
  searchFiltersToAgentFilters,
} from '@/services/qdrant-search';
import { createReputationService } from '@/services/reputation';
import { createSDKService } from '@/services/sdk';
import type {
  AgentDetailResponse,
  AgentListResponse,
  AgentSummary,
  ChainStats,
  Env,
  OASFSource,
  Variables,
} from '@/types';
import { Hono } from 'hono';
import { classify } from './classify';
import { reputation } from './reputation';

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
agents.get('/', async (c) => {
  // Parse and validate query parameters
  const rawQuery = c.req.query();
  const rawQueries = c.req.queries();

  // Merge array values for chainIds[]
  if (rawQueries['chainIds[]'] && rawQueries['chainIds[]'].length > 1) {
    (rawQuery as Record<string, unknown>)['chainIds[]'] = rawQueries['chainIds[]'];
  }

  const queryResult = listAgentsQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    return errors.validationError(c, queryResult.error.errors[0]?.message ?? 'Invalid query');
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

  // Convert page to offset
  const offset = query.page ? (query.page - 1) * query.limit : undefined;

  // Create Qdrant search service
  const searchService = createQdrantSearchService(c.env);

  // Build filters for Qdrant (ALL filters supported natively!)
  const filters = searchFiltersToAgentFilters({
    chainIds,
    active: query.active,
    mcp: query.mcp,
    a2a: query.a2a,
    x402: query.x402,
    skills: query.skills,
    domains: query.domains,
    filterMode: query.filterMode,
    // Extended filters
    mcpTools: query.mcpTools,
    a2aSkills: query.a2aSkills,
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
  let usedSdkFallback = false;

  const shouldFallback =
    searchResult.results.length === 0 &&
    !query.q &&
    query.hasRegistrationFile !== false; // Don't fallback if user wants agents without reg files

  if (shouldFallback) {
    console.info('Qdrant returned 0 results, falling back to SDK...');
    try {
      const sdkResult = await sdk.getAgents({
        limit: query.limit,
        hasRegistrationFile: query.hasRegistrationFile ?? true,
        chainIds,
        active: query.active,
        hasMcp: query.mcp,
        hasA2a: query.a2a,
        cursor: query.cursor,
      });

      // Convert SDK results to search results format
      if (sdkResult.items.length > 0) {
        usedSdkFallback = true;
        const sdkAgents: AgentSummary[] = sdkResult.items.map((item) => ({
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

        const fallbackResponse: AgentListResponse = {
          success: true,
          data: sdkAgents,
          meta: {
            total: sdkResult.total ?? sdkAgents.length,
            hasMore: !!sdkResult.nextCursor,
            nextCursor: sdkResult.nextCursor,
            stats,
            searchMode: 'fallback',
          },
        };

        // Cache the SDK fallback response for a short time
        await cache.set(cacheKey, fallbackResponse, CACHE_TTL.AGENTS);
        return c.json(fallbackResponse);
      }
    } catch (sdkError) {
      console.error('SDK fallback failed:', sdkError instanceof Error ? sdkError.message : sdkError);
      // Continue with empty Qdrant results if SDK also fails
    }
  }

  // Transform results to AgentSummary format
  let agents: AgentSummary[] = searchResult.results.map((result) => ({
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
    operators: [],
    ens: result.metadata?.ens,
    did: result.metadata?.did,
    oasf:
      result.metadata?.skills?.length || result.metadata?.domains?.length
        ? {
            skills: (result.metadata?.skills ?? []).map((slug) => ({ slug, confidence: 1 })),
            domains: (result.metadata?.domains ?? []).map((slug) => ({ slug, confidence: 1 })),
            confidence: 1,
            classifiedAt: new Date().toISOString(),
            modelVersion: 'qdrant-indexed',
          }
        : undefined,
    oasfSource:
      result.metadata?.skills?.length || result.metadata?.domains?.length
        ? 'llm-classification'
        : ('none' as OASFSource),
    searchScore: result.score,
    matchReasons: result.matchReasons,
    reputationScore: result.metadata?.reputation,
  }));

  // Apply reputation filtering (not yet in Qdrant index)
  if (query.minRep !== undefined || query.maxRep !== undefined) {
    agents = agents.filter((agent) => {
      const score = agent.reputationScore;
      if (score === undefined || score === null) {
        return query.minRep === undefined || query.minRep === 0;
      }
      if (query.minRep !== undefined && score < query.minRep) return false;
      if (query.maxRep !== undefined && score > query.maxRep) return false;
      return true;
    });
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

  const [ipfsMetadata, classificationRow, reputationData] = await Promise.all([
    agent.registration.metadataUri
      ? ipfsService.fetchMetadata(agent.registration.metadataUri, agentId)
      : Promise.resolve(null),
    getClassification(c.env.DB, agentId),
    createReputationService(c.env.DB).getAgentReputation(agentId),
  ]);

  const dbClassification = parseClassificationRow(classificationRow);
  const resolvedClassification = resolveClassification(ipfsMetadata, dbClassification);
  const oasf = toOASFClassification(resolvedClassification);

  const response: AgentDetailResponse = {
    success: true,
    data: {
      ...agent,
      oasf,
      oasfSource: resolvedClassification.source,
      reputation: reputationData ?? undefined,
      reputationScore: reputationData?.averageScore,
      reputationCount: reputationData?.count,
      endpoints: {
        ...agent.endpoints,
        oasf: ipfsMetadata?.oasfEndpoint,
      },
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
    } catch {
      // Invalid skills JSON
    }
    try {
      const domains = JSON.parse(classification.domains);
      targetDomains = domains.map((d: { slug: string }) => d.slug);
    } catch {
      // Invalid domains JSON
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

    // Search by skills first
    let similarAgents: AgentSummary[] = [];

    if (targetSkills.length > 0) {
      const skillsResult = await searchService.search({
        limit: 50,
        filters: { skills: targetSkills },
      });
      similarAgents = skillsResult.results
        .filter((r) => r.agentId !== agentId)
        .map((r) =>
          payloadToAgentSummary(
            r as unknown as Parameters<typeof payloadToAgentSummary>[0],
            r.score
          )
        );
    }

    // Also search by domains if not enough results
    if (similarAgents.length < limit && targetDomains.length > 0) {
      const domainsResult = await searchService.search({
        limit: 50,
        filters: { domains: targetDomains },
      });
      const domainAgents = domainsResult.results
        .filter((r) => r.agentId !== agentId)
        .map((r) =>
          payloadToAgentSummary(
            r as unknown as Parameters<typeof payloadToAgentSummary>[0],
            r.score
          )
        );

      // Merge and deduplicate
      const seen = new Set(similarAgents.map((a) => a.id));
      for (const agent of domainAgents) {
        if (!seen.has(agent.id)) {
          similarAgents.push(agent);
          seen.add(agent.id);
        }
      }
    }

    const topSimilar = similarAgents.slice(0, limit);

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

// Mount classification routes
agents.route('/:agentId/classify', classify);

// Mount reputation routes
agents.route('/:agentId/reputation', reputation);

export { agents };
