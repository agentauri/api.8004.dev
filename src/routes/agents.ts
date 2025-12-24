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
import { CACHE_KEYS, CACHE_TTL, createCacheService, hashQueryParams } from '@/services/cache';
import { createIPFSService } from '@/services/ipfs';
import { resolveClassification, toOASFClassification } from '@/services/oasf-resolver';
import { createReputationService } from '@/services/reputation';
import { createSDKService } from '@/services/sdk';
import { createSearchService } from '@/services/search';
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
 * Cached cursor for OR mode pagination
 */
interface OrModeCachedCursor {
  /** Cache key where results are stored */
  k: string;
  /** Current offset in results */
  o: number;
}

/**
 * Cached data for OR mode pagination
 */
interface OrModeCachedData {
  items: AgentSummary[];
  total: number;
}

/**
 * Encode a cached cursor to base64url string
 */
function encodeOrModeCursor(cacheKey: string, offset: number): string {
  const cursor: OrModeCachedCursor = { k: cacheKey, o: offset };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Decode a cached cursor from base64url string
 * Returns null if not a valid OR mode cursor
 */
function decodeOrModeCursor(cursor: string): OrModeCachedCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (decoded.k && typeof decoded.o === 'number') {
      return decoded as OrModeCachedCursor;
    }
  } catch {
    // Not a cached cursor
  }
  return null;
}

/**
 * Enqueue classification jobs for unclassified agents
 * This function both inserts into DB and sends to Cloudflare Queue
 */
async function enqueueClassificationsWithQueue(env: Env, agentIds: string[]): Promise<number> {
  if (agentIds.length === 0) return 0;

  // First, insert into DB (this filters out already classified/queued agents)
  // Returns the actual list of agent IDs that were enqueued
  const enqueuedAgentIds = await enqueueClassificationsBatch(env.DB, agentIds);

  if (enqueuedAgentIds.length === 0) return 0;

  // Send to Cloudflare Queue for processing
  const sendPromises = enqueuedAgentIds.map((agentId) =>
    env.CLASSIFICATION_QUEUE.send({ agentId, force: false })
  );

  await Promise.all(sendPromises);

  return enqueuedAgentIds.length;
}

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
        // Higher scores should come first with order=desc (default)
        const scoreA = a.searchScore ?? 0;
        const scoreB = b.searchScore ?? 0;
        return (scoreA - scoreB) * multiplier;
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
 * Agents without reputation are included unless minRep > 0
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
    // Agents without reputation pass if minRep is 0 or undefined
    // Note: score can be null after JSON serialization from cache
    if (score === undefined || score === null) {
      return minRep === undefined || minRep === 0;
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

/**
 * Get chain stats with caching
 * Uses KV cache with fallback to SDK for fresh data
 */
async function getCachedChainStats(
  env: Env,
  sdk: ReturnType<typeof createSDKService>
): Promise<ChainStats[]> {
  const cache = createCacheService(env.CACHE, CACHE_TTL.CHAIN_STATS);
  const cacheKey = CACHE_KEYS.chainStats();

  // Check cache first
  const cached = await cache.get<{ data: ChainStats[] }>(cacheKey);
  if (cached?.data) {
    return cached.data;
  }

  // Fetch fresh stats
  const stats = await sdk.getChainStats();

  // Cache the result (only if all chains succeeded)
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
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex handler with multiple code paths for search vs SDK, OR vs AND mode
agents.get('/', async (c) => {
  // Parse and validate query parameters
  // Use c.req.queries() to properly handle array notation (e.g., chainIds[]=X&chainIds[]=Y)
  const rawQuery = c.req.query();
  const rawQueries = c.req.queries();

  // Merge array values: if chainIds[] has multiple values, use the array from queries()
  if (rawQueries['chainIds[]'] && rawQueries['chainIds[]'].length > 1) {
    (rawQuery as Record<string, unknown>)['chainIds[]'] = rawQueries['chainIds[]'];
  }

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

  const sdk = createSDKService(c.env, c.env.CACHE);

  // Resolve chain IDs: prefer 'chainIds[]' (URL array), then 'chainIds', then 'chains' (CSV), then 'chainId' (single)
  const chainIds =
    query['chainIds[]'] ??
    query.chainIds ??
    query.chains ??
    (query.chainId ? [query.chainId] : undefined);

  // Convert page to offset for pagination (page is 1-indexed)
  const offset = query.page ? (query.page - 1) * query.limit : undefined;

  // If search query provided, use semantic search
  if (query.q) {
    try {
      const searchService = createSearchService(c.env.SEARCH_SERVICE_URL, undefined, c.env);

      // Determine if we need post-filtering (these filters don't work upstream)
      const hasBooleanFilters =
        query.mcp !== undefined || query.a2a !== undefined || query.x402 !== undefined;

      const hasOASFFilters =
        (query.skills && query.skills.length > 0) || (query.domains && query.domains.length > 0);

      // Over-fetch when filtering to ensure enough results after post-filtering
      // Use 10x for OASF filters (sparse data), 3x for boolean filters
      let fetchLimit = query.limit;
      if (hasOASFFilters) {
        fetchLimit = Math.min(query.limit * 10, 100);
      } else if (hasBooleanFilters) {
        fetchLimit = Math.min(query.limit * 3, 100);
      }

      const searchResults = await searchService.search({
        query: query.q,
        limit: fetchLimit,
        minScore: query.minScore,
        cursor: query.cursor,
        filters: {
          chainIds,
          active: query.active,
          // mcp, a2a, x402, skills, domains DON'T work upstream - post-filter instead
        },
      });

      // If vector search returns 0 results, fall back to SDK search
      // This handles cases where agents aren't indexed in vector DB
      if (searchResults.results.length === 0 && !query.cursor) {
        throw new Error('Vector search returned 0 results, trying SDK fallback');
      }

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
            const fallbackOasf = parseClassificationRow(
              classificationsMap.get(searchResult.agentId)
            );
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

      // Post-filter using enriched SDK data (mcp, a2a, x402, skills, domains don't work upstream)
      let postFilteredAgents = enrichedAgents;

      if (hasBooleanFilters || hasOASFFilters) {
        const isOrMode = query.filterMode === 'OR';

        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Filter logic requires checking multiple OASF and boolean conditions
        postFilteredAgents = enrichedAgents.filter((agent) => {
          // Skills filter (always AND) - check OASF classification
          // OASF uses flat structure, exact slug match only
          if (query.skills?.length) {
            const agentSkillSlugs = agent.oasf?.skills?.map((s) => s.slug) ?? [];
            const hasMatchingSkill = query.skills.some((reqSkill) =>
              agentSkillSlugs.includes(reqSkill)
            );
            if (!hasMatchingSkill) return false;
          }

          // Domains filter (always AND) - check OASF classification
          // OASF uses flat structure, exact slug match only
          if (query.domains?.length) {
            const agentDomainSlugs = agent.oasf?.domains?.map((d) => d.slug) ?? [];
            const hasMatchingDomain = query.domains.some((reqDomain) =>
              agentDomainSlugs.includes(reqDomain)
            );
            if (!hasMatchingDomain) return false;
          }

          // Boolean filters (mcp, a2a, x402) - apply filterMode logic
          const booleanFilters: boolean[] = [];
          if (query.mcp !== undefined) booleanFilters.push(agent.hasMcp === query.mcp);
          if (query.a2a !== undefined) booleanFilters.push(agent.hasA2a === query.a2a);
          if (query.x402 !== undefined) booleanFilters.push(agent.x402Support === query.x402);

          if (booleanFilters.length === 0) return true;

          return isOrMode
            ? booleanFilters.some((b) => b) // OR: at least one must match
            : booleanFilters.every((b) => b); // AND: all must match
        });
      }

      // Apply limit after post-filtering
      const limitedAgents = postFilteredAgents.slice(0, query.limit);

      // Apply reputation filtering
      const filteredAgents = filterByReputation(limitedAgents, query.minRep, query.maxRep);

      // Apply sorting
      const sortedAgents = sortAgents(filteredAgents, query.sort, query.order);

      // Fetch chain stats for totals (from KV cache)
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

      // Use post-filtered count when filters are applied, otherwise use search service total
      const filteredTotal =
        hasBooleanFilters || hasOASFFilters ? postFilteredAgents.length : searchResults.total;

      const response: AgentListResponse = {
        success: true,
        data: sortedAgents,
        meta: {
          total: filteredTotal,
          hasMore:
            hasBooleanFilters || hasOASFFilters
              ? postFilteredAgents.length > query.limit
              : searchResults.hasMore,
          nextCursor: hasBooleanFilters || hasOASFFilters ? undefined : searchResults.nextCursor,
          stats,
          searchMode: 'vector',
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
          enqueueClassificationsWithQueue(c.env, unclassifiedIds).catch((err) => {
            console.error('Failed to enqueue classifications:', err);
          })
        );
      }

      await cache.set(cacheKey, response, CACHE_TTL.AGENTS);
      return c.json(response);
    } catch (vectorSearchError) {
      // ========== FALLBACK: SDK SEARCH ==========
      console.warn(
        'Vector search failed in agents route, falling back to SDK search:',
        vectorSearchError instanceof Error ? vectorSearchError.message : vectorSearchError
      );

      try {
        // Use SDK search with substring matching
        // DON'T pass mcp/a2a/x402 to SDK - the external SDK doesn't handle false values correctly
        // We'll apply all boolean filters ourselves after getting results
        const sdkSearchResult = await sdk.search({
          query: query.q,
          chainIds,
          active: query.active,
          // Note: mcp/a2a/x402/filterMode NOT passed - we handle them in post-filtering
          // mcpTools and a2aSkills are passed to SDK for native filtering
          mcpTools: query.mcpTools,
          a2aSkills: query.a2aSkills,
          limit: query.limit * 3, // Over-fetch for post-filtering
          cursor: query.cursor,
        });

        // Batch fetch classifications and reputations
        const agentIds = sdkSearchResult.items.map((item) => item.agent.id);
        const [classificationsMap, reputationsMap] = await Promise.all([
          getClassificationsBatch(c.env.DB, agentIds),
          getReputationsBatch(c.env.DB, agentIds),
        ]);

        // Enrich SDK search results with OASF and reputation data
        const enrichedAgents: AgentSummary[] = sdkSearchResult.items.map((item) => {
          const classificationRow = classificationsMap.get(item.agent.id);
          const oasf = parseClassificationRow(classificationRow);
          const reputationRow = reputationsMap.get(item.agent.id);
          return {
            ...item.agent,
            oasf,
            oasfSource: (oasf ? 'llm-classification' : 'none') as OASFSource,
            searchScore: item.score,
            matchReasons: item.matchReasons,
            reputationScore: reputationRow?.average_score,
            reputationCount: reputationRow?.feedback_count,
          };
        });

        // Determine if we need post-filtering
        const hasBooleanFilters =
          query.mcp !== undefined || query.a2a !== undefined || query.x402 !== undefined;
        const hasOASFFilters =
          (query.skills && query.skills.length > 0) || (query.domains && query.domains.length > 0);

        // Post-filter using enriched SDK data
        let postFilteredAgents = enrichedAgents;

        if (hasBooleanFilters || hasOASFFilters) {
          const isOrMode = query.filterMode === 'OR';

          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Filter logic requires checking multiple OASF and boolean conditions
          postFilteredAgents = enrichedAgents.filter((agent) => {
            // Skills filter (always AND)
            if (query.skills?.length) {
              const agentSkillSlugs = agent.oasf?.skills?.map((s) => s.slug) ?? [];
              const hasMatchingSkill = query.skills.some((reqSkill) =>
                agentSkillSlugs.includes(reqSkill)
              );
              if (!hasMatchingSkill) return false;
            }

            // Domains filter (always AND)
            if (query.domains?.length) {
              const agentDomainSlugs = agent.oasf?.domains?.map((d) => d.slug) ?? [];
              const hasMatchingDomain = query.domains.some((reqDomain) =>
                agentDomainSlugs.includes(reqDomain)
              );
              if (!hasMatchingDomain) return false;
            }

            // Boolean filters (mcp, a2a, x402) - apply filterMode logic
            const boolFilters: boolean[] = [];
            if (query.mcp !== undefined) boolFilters.push(agent.hasMcp === query.mcp);
            if (query.a2a !== undefined) boolFilters.push(agent.hasA2a === query.a2a);
            if (query.x402 !== undefined) boolFilters.push(agent.x402Support === query.x402);

            if (boolFilters.length === 0) return true;

            return isOrMode
              ? boolFilters.some((b) => b) // OR: at least one must match
              : boolFilters.every((b) => b); // AND: all must match
          });
        }

        // Apply limit after post-filtering
        const limitedAgents = postFilteredAgents.slice(0, query.limit);

        // Apply reputation filtering
        const filteredAgents = filterByReputation(limitedAgents, query.minRep, query.maxRep);

        // Apply sorting
        const sortedAgents = sortAgents(filteredAgents, query.sort, query.order);

        // Fetch chain stats for totals (from KV cache)
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
          data: sortedAgents,
          meta: {
            total: postFilteredAgents.length,
            hasMore: postFilteredAgents.length > query.limit,
            nextCursor: sdkSearchResult.nextCursor,
            stats,
            searchMode: 'fallback',
          },
        };

        // Trigger background classification for unclassified agents (non-blocking)
        const unclassifiedIds = sortedAgents
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
      } catch (sdkError) {
        // Both searches failed
        console.error('SDK fallback search also failed in agents route:', sdkError);
        return errors.internalError(c, 'Search service error');
      }
    }
  }

  // Otherwise, use SDK directly with cursor-based pagination
  // Check if OR mode with multiple boolean filters
  const booleanFilters: Array<'mcp' | 'a2a' | 'x402'> = [];
  if (query.mcp) booleanFilters.push('mcp');
  if (query.a2a) booleanFilters.push('a2a');
  if (query.x402) booleanFilters.push('x402');

  const isOrMode = query.filterMode === 'OR' && booleanFilters.length > 1;

  let agentsResult: { items: AgentSummary[]; nextCursor?: string; total?: number } | undefined;

  // Fetch chain stats for accurate total count (from KV cache)
  // Use withRegistrationFileCount because this endpoint only returns agents with metadata
  const chainStats = await getCachedChainStats(c.env, sdk);
  const totalAgentsFromStats = chainStats.reduce((sum, c) => sum + c.withRegistrationFileCount, 0);

  if (isOrMode) {
    // OR mode: run separate queries for each boolean filter and merge results
    // Check if cursor is a cached OR mode cursor for pagination
    const orModeCache = createCacheService(c.env.CACHE, CACHE_TTL.OR_MODE_AGENTS);
    let startOffset = offset ?? 0; // Use page-based offset if provided

    if (query.cursor) {
      const cachedCursor = decodeOrModeCursor(query.cursor);
      if (cachedCursor) {
        // Paginate from cached results
        const cached = await orModeCache.get<OrModeCachedData>(cachedCursor.k);
        if (cached) {
          const pageItems = cached.items.slice(cachedCursor.o, cachedCursor.o + query.limit);
          const hasMore = cachedCursor.o + query.limit < cached.total;
          agentsResult = {
            items: pageItems,
            nextCursor: hasMore
              ? encodeOrModeCursor(cachedCursor.k, cachedCursor.o + query.limit)
              : undefined,
          };
          // Skip to enrichment with already-paginated results
        } else {
          // Cache expired, use offset as fallback for fresh query
          startOffset = cachedCursor.o;
        }
      }
    }

    // If we don't have results from cache, fetch fresh data
    if (!agentsResult) {
      const baseParams = {
        chainIds,
        // Fetch more results for caching (3x limit for pagination headroom)
        limit: Math.min(query.limit * 3, 100),
        active: query.active,
        mcpTools: query.mcpTools,
        a2aSkills: query.a2aSkills,
        hasRegistrationFile: query.hasRegistrationFile,
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

      const mergedItems = [...agentMap.values()];
      const totalMerged = mergedItems.length;

      // Cache merged results if there are more than requested
      if (totalMerged > query.limit) {
        const orCacheKey = CACHE_KEYS.orModeAgents(
          hashQueryParams({
            chainIds,
            booleanFilters,
            active: query.active,
            hasRegistrationFile: query.hasRegistrationFile,
          })
        );
        const cacheData: OrModeCachedData = {
          items: mergedItems,
          total: totalMerged,
        };
        await orModeCache.set(orCacheKey, cacheData, CACHE_TTL.OR_MODE_AGENTS);

        // Return paginated slice with cursor
        const pageItems = mergedItems.slice(startOffset, startOffset + query.limit);
        const hasMore = startOffset + query.limit < totalMerged;
        agentsResult = {
          items: pageItems,
          nextCursor: hasMore
            ? encodeOrModeCursor(orCacheKey, startOffset + query.limit)
            : undefined,
        };
      } else {
        // No caching needed, return all results
        agentsResult = {
          items: mergedItems.slice(startOffset, startOffset + query.limit),
          nextCursor: undefined,
        };
      }
    }
  } else {
    // AND mode (default): single query with all filters
    // Check if we have any =false boolean filters that need post-filtering
    // SDK subgraph doesn't correctly filter for =false (mcpEndpoint: null vs empty string issue)
    const hasFalseFilters = query.mcp === false || query.a2a === false || query.x402 === false;

    agentsResult = await sdk.getAgents({
      chainIds,
      // Over-fetch if we have =false filters that need post-filtering
      limit: hasFalseFilters ? Math.min(query.limit * 3, 100) : query.limit,
      cursor: query.cursor,
      offset, // Pass offset for page-based pagination
      active: query.active,
      // Only pass true values to SDK - =false is handled via post-filtering
      hasMcp: query.mcp === true ? true : undefined,
      hasA2a: query.a2a === true ? true : undefined,
      hasX402: query.x402 === true ? true : undefined,
      mcpTools: query.mcpTools,
      a2aSkills: query.a2aSkills,
      hasRegistrationFile: query.hasRegistrationFile,
      // Pass sort and order for consistent multi-chain pagination with caching
      sort: query.sort,
      order: query.order,
    });

    // Post-filter for =false boolean filters (SDK doesn't handle these correctly)
    if (hasFalseFilters && agentsResult.items.length > 0) {
      agentsResult.items = agentsResult.items.filter((agent) => {
        if (query.mcp === false && agent.hasMcp !== false) return false;
        if (query.a2a === false && agent.hasA2a !== false) return false;
        if (query.x402 === false && agent.x402Support !== false) return false;
        return true;
      });
      // Update total to reflect filtered count
      agentsResult.total = agentsResult.items.length;
      // Trim to requested limit
      agentsResult.items = agentsResult.items.slice(0, query.limit);
    }
  }

  // agentsResult is guaranteed to be defined after if/else block
  // biome-ignore lint/style/noNonNullAssertion: agentsResult is always set in OR mode or AND mode blocks above
  const finalAgentsResult = agentsResult!;

  // Batch fetch classifications and reputations for all agents (N+1 fix)
  const agentIds = finalAgentsResult.items.map((a) => a.id);
  const [classificationsMap, reputationsMap] = await Promise.all([
    getClassificationsBatch(c.env.DB, agentIds),
    getReputationsBatch(c.env.DB, agentIds),
  ]);

  // Enrich with classifications and reputations from batch result
  let enrichedAgents = finalAgentsResult.items.map((agent) => {
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
  // OASF uses flat structure, exact slug match only
  if (query.domains?.length) {
    enrichedAgents = enrichedAgents.filter((agent) => {
      if (!agent.oasf?.domains) return false;
      const agentDomains = agent.oasf.domains.map((d) => d.slug);
      return query.domains?.some((reqDomain) => agentDomains.includes(reqDomain));
    });
  }

  // Apply skills filtering (post-fetch since SDK doesn't support it)
  // OASF uses flat structure, exact slug match only
  if (query.skills?.length) {
    enrichedAgents = enrichedAgents.filter((agent) => {
      if (!agent.oasf?.skills) return false;
      const agentSkills = agent.oasf.skills.map((s) => s.slug);
      return query.skills?.some((reqSkill) => agentSkills.includes(reqSkill));
    });
  }

  // Apply reputation filtering
  const filteredAgents = filterByReputation(enrichedAgents, query.minRep, query.maxRep);

  // Apply sorting
  const sortedAgents = sortAgents(filteredAgents, query.sort, query.order);

  // Build stats from chain stats (already fetched above)
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

  // Determine the correct total count:
  // - Use SDK's filtered total when protocol/active/chain filters are applied
  // - Fall back to global stats total when no filters are applied
  const hasFilters =
    query.active !== undefined ||
    query.mcp !== undefined ||
    query.a2a !== undefined ||
    query.x402 !== undefined ||
    (chainIds !== undefined && chainIds.length > 0);
  const filteredTotal =
    hasFilters && finalAgentsResult.total !== undefined
      ? finalAgentsResult.total
      : totalAgentsFromStats;

  const response: AgentListResponse = {
    success: true,
    data: sortedAgents,
    meta: {
      total: filteredTotal,
      hasMore: !!finalAgentsResult.nextCursor,
      nextCursor: finalAgentsResult.nextCursor,
      stats,
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
  const sdk = createSDKService(c.env, c.env.CACHE);
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

/**
 * GET /api/v1/agents/:agentId/similar
 * Find agents with similar OASF classification
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Similar agents requires OASF matching across skills and domains
agents.get('/:agentId/similar', async (c) => {
  const agentIdParam = c.req.param('agentId');

  // Parse and validate agentId
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

  // Check cache
  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  try {
    // Get target agent's classification
    const classification = await getClassification(c.env.DB, agentId);
    if (!classification) {
      return c.json({
        success: true,
        data: [],
        message: 'Agent has no classification - cannot find similar agents',
      });
    }

    // Parse skills and domains
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

    // Query SDK for agents (without skills/domains filter - we'll compute similarity from classifications)
    const sdk = createSDKService(c.env, c.env.CACHE);

    // Get a batch of classified agents to find similar ones
    const agentsResult = await sdk.getAgents({ limit: 100 });
    const candidates = agentsResult.items.filter((a) => a.id !== agentId);

    // Get classifications for candidates to compute similarity
    const candidateIds = candidates.map((a) => a.id);
    const classifications = await getClassificationsBatch(c.env.DB, candidateIds);

    // Compute similarity scores
    interface SimilarAgent extends AgentSummary {
      similarityScore: number;
      matchedSkills: string[];
      matchedDomains: string[];
    }

    const similarAgents: SimilarAgent[] = [];
    for (const agent of candidates) {
      const agentClassification = classifications.get(agent.id);
      if (!agentClassification) continue;

      let agentSkills: string[] = [];
      let agentDomains: string[] = [];
      try {
        const skills = JSON.parse(agentClassification.skills);
        agentSkills = skills.map((s: { slug: string }) => s.slug);
      } catch {
        // Invalid skills JSON
      }
      try {
        const domains = JSON.parse(agentClassification.domains);
        agentDomains = domains.map((d: { slug: string }) => d.slug);
      } catch {
        // Invalid domains JSON
      }

      // Calculate overlap
      const matchedSkills = targetSkills.filter((s) => agentSkills.includes(s));
      const matchedDomains = targetDomains.filter((d) => agentDomains.includes(d));

      if (matchedSkills.length === 0 && matchedDomains.length === 0) continue;

      // Jaccard-like similarity score
      const skillUnion = new Set([...targetSkills, ...agentSkills]).size;
      const domainUnion = new Set([...targetDomains, ...agentDomains]).size;

      const skillSimilarity = skillUnion > 0 ? matchedSkills.length / skillUnion : 0;
      const domainSimilarity = domainUnion > 0 ? matchedDomains.length / domainUnion : 0;

      // Weight skills more heavily (60% skills, 40% domains)
      // Return score as 0-1 range (not 0-100)
      const similarityScore =
        Math.round((skillSimilarity * 0.6 + domainSimilarity * 0.4) * 100) / 100;

      if (similarityScore > 0) {
        similarAgents.push({
          ...agent,
          similarityScore,
          matchedSkills,
          matchedDomains,
        });
      }
    }

    // Sort by similarity score and take top N
    similarAgents.sort((a, b) => b.similarityScore - a.similarityScore);
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

// Mount classification routes
agents.route('/:agentId/classify', classify);

// Mount reputation routes
agents.route('/:agentId/reputation', reputation);

export { agents, filterByReputation, sortAgents };
