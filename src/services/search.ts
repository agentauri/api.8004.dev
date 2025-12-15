/**
 * Search service client
 * @module services/search
 */

import { createHash } from 'node:crypto';
import { fetchWithTimeout } from '@/lib/utils/fetch';
import type { Env, SearchFilters, SearchResultItem, SearchServiceResult } from '@/types';
import { CACHE_KEYS, CACHE_TTL, type CacheService } from './cache';
import { createMockSearchService } from './mock/mock-search';

/**
 * Search parameters
 */
export interface SearchParams {
  /** Natural language query */
  query: string;
  /** Maximum results to return */
  limit?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Direct offset for pagination (takes precedence over cursor) */
  offset?: number;
  /** Optional filters */
  filters?: SearchFilters;
}

/**
 * Search service interface
 */
export interface SearchService {
  /**
   * Perform semantic search
   */
  search(params: SearchParams): Promise<SearchServiceResult>;

  /**
   * Check service health
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Search service request body (agent0lab search-service format)
 * Note: Uses flat filter format, not AG0 nested equals/in format
 */
interface SearchRequestBody {
  query: string;
  topK: number;
  minScore?: number;
  cursor?: string;
  offset?: number;
  filters?: {
    // Flat filters (agent0lab format)
    chainId?: number;
    chainIds?: number[]; // Support array of chain IDs
    active?: boolean;
    mcp?: boolean;
    a2a?: boolean;
    x402support?: boolean;
    capabilities?: string[];
    domains?: string[];
  };
}

/**
 * Search service response (agent0lab format)
 */
interface SearchResponseBody {
  query: string;
  results: Array<{
    rank: number;
    vectorId: string;
    agentId: string;
    chainId: number;
    name: string;
    description: string;
    score: number;
    metadata: Record<string, unknown>;
    matchReasons?: string[];
  }>;
  total: number;
  timestamp: string;
  // Optional pagination fields (AG0 standard)
  pagination?: {
    hasMore: boolean;
    nextCursor?: string;
    limit: number;
    offset?: number;
  };
}

/**
 * Cursor for OR mode pagination (composite cursor with per-filter cursors)
 */
interface OrModeCursor {
  mode: 'OR';
  cursors: Record<string, string>;
  globalOffset: number;
}

/**
 * Cached search cursor for pagination from KV cache
 */
interface CachedSearchCursor {
  /** Cache key where results are stored */
  k: string;
  /** Current offset in results */
  o: number;
}

/**
 * Cached search data stored in KV
 */
interface CachedSearchData {
  results: SearchResultItem[];
  total: number;
  byChain: Record<number, number>;
}

/**
 * Encode offset into a cursor string
 */
function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

/**
 * Decode cursor string - handles both offset and OR mode cursors
 */
function decodeCursor(cursor: string): { offset: number; orCursor?: OrModeCursor } {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (decoded.mode === 'OR') {
      return { offset: decoded.globalOffset || 0, orCursor: decoded as OrModeCursor };
    }
    return { offset: typeof decoded.offset === 'number' ? decoded.offset : 0 };
  } catch {
    return { offset: 0 };
  }
}

/**
 * Encode OR mode cursor
 */
function encodeOrCursor(cursors: Record<string, string>, globalOffset: number): string {
  const orCursor: OrModeCursor = { mode: 'OR', cursors, globalOffset };
  return Buffer.from(JSON.stringify(orCursor)).toString('base64url');
}

/**
 * Encode cached search cursor
 */
function encodeCachedCursor(cacheKey: string, offset: number): string {
  const cursor: CachedSearchCursor = { k: cacheKey, o: offset };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Decode cached search cursor
 */
function decodeCachedCursor(cursor: string): CachedSearchCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (decoded.k && typeof decoded.o === 'number') {
      return decoded as CachedSearchCursor;
    }
  } catch {
    // Not a cached cursor
  }
  return null;
}

/**
 * Compute byChain breakdown from results
 */
function computeByChain(results: SearchResultItem[]): Record<number, number> {
  const byChain: Record<number, number> = {};
  for (const item of results) {
    byChain[item.chainId] = (byChain[item.chainId] || 0) + 1;
  }
  return byChain;
}

/**
 * Generate hash for search parameters (used as cache key)
 */
function hashSearchParams(query: string, minScore: number, filters?: SearchFilters): string {
  const obj = { query, minScore, filters };
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').substring(0, 16);
}

/**
 * Paginate from cached results
 */
function paginateFromCache(
  cached: CachedSearchData,
  cacheKey: string,
  offset: number,
  limit: number
): SearchServiceResult {
  const pageResults = cached.results.slice(offset, offset + limit);
  const hasMore = offset + limit < cached.total;

  return {
    results: pageResults,
    total: cached.total,
    hasMore,
    nextCursor: hasMore ? encodeCachedCursor(cacheKey, offset + limit) : undefined,
    byChain: cached.byChain,
  };
}

/**
 * Result with filter key for OR mode merging
 */
interface TaggedSearchResult {
  result: SearchServiceResult;
  filterKey: string;
}

/**
 * Merge and deduplicate search results, keeping highest score per agent
 * Calculates total as sum of all filter totals and supports composite cursor
 */
function mergeSearchResults(
  resultArrays: TaggedSearchResult[],
  limit: number
): SearchServiceResult {
  const agentMap = new Map<string, SearchResultItem>();
  let totalAcrossAll = 0;
  const byChain: Record<number, number> = {};
  const nextCursors: Record<string, string> = {};

  // Collect all results
  for (const { result, filterKey } of resultArrays) {
    // Sum totals from all filter searches
    totalAcrossAll += result.total;

    // Save cursors for composite OR pagination
    if (result.nextCursor) {
      nextCursors[filterKey] = result.nextCursor;
    }

    // Merge results (dedup by agentId, keep highest score)
    for (const item of result.results) {
      // Count per chain (from actual results)
      byChain[item.chainId] = (byChain[item.chainId] || 0) + 1;

      const existing = agentMap.get(item.agentId);
      if (!existing || item.score > existing.score) {
        agentMap.set(item.agentId, item);
      }
    }
  }

  // Sort by score descending and limit
  const mergedResults = [...agentMap.values()].sort((a, b) => b.score - a.score).slice(0, limit);

  // Build composite cursor if there are more results
  let nextCursor: string | undefined;
  const hasMore = totalAcrossAll > mergedResults.length;
  if (hasMore && Object.keys(nextCursors).length > 0) {
    nextCursor = encodeOrCursor(nextCursors, limit);
  }

  return {
    results: mergedResults,
    total: totalAcrossAll,
    hasMore,
    nextCursor,
    byChain,
  };
}

/**
 * Maximum results to fetch from search-service for caching.
 * Note: The search service (agent0lab) has MAX_TOP_K = 100, so we cap at 100.
 */
const MAX_SEARCH_RESULTS = 100;

/**
 * Request coalescing for concurrent identical search requests.
 * Prevents duplicate network calls when multiple requests arrive before the first completes.
 * Key is the hash of search parameters, value is the pending promise.
 */
const pendingSearches = new Map<string, Promise<SearchServiceResult>>();

/**
 * Timeout to clear stale pending requests (ms).
 * Requests older than this are removed to prevent memory leaks.
 */
const PENDING_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Validate search service URL
 * SECURITY: Prevents SSRF by only allowing HTTPS URLs to known domains
 */
function isValidSearchServiceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }
    // Block localhost and private IPs
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'];
    if (blockedHosts.includes(parsed.hostname.toLowerCase())) {
      return false;
    }
    // Block private IP ranges
    if (
      /^10\./.test(parsed.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname) ||
      /^192\.168\./.test(parsed.hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Create search service client
 * @param searchServiceUrl - Base URL for search service
 * @param cache - Optional cache service for pagination support
 * @param env - Optional environment bindings for mock mode
 * @throws Error if URL is invalid or unsafe
 */
export function createSearchService(
  searchServiceUrl: string,
  cache?: CacheService,
  env?: Env
): SearchService {
  // Use mock service for deterministic E2E testing
  if (env?.MOCK_EXTERNAL_SERVICES === 'true') {
    return createMockSearchService();
  }

  // SECURITY: Validate URL before using
  if (!isValidSearchServiceUrl(searchServiceUrl)) {
    throw new Error(
      'Invalid search service URL: must be HTTPS and not point to internal resources'
    );
  }
  const baseUrl = searchServiceUrl.replace(/\/$/, '');

  /**
   * Execute a single search request
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Filter building logic requires multiple conditional checks
  async function executeSearch(
    query: string,
    limit: number,
    minScore: number,
    filters?: SearchFilters,
    cursor?: string
  ): Promise<SearchServiceResult> {
    // Decode offset from cursor if provided
    const { offset } = cursor ? decodeCursor(cursor) : { offset: 0 };

    const body: SearchRequestBody = {
      query,
      topK: limit,
      minScore,
    };

    // Use offset-based pagination (more widely supported than cursor)
    if (offset > 0) {
      body.offset = offset;
    }

    if (filters) {
      body.filters = {};

      // Support both single chainId and array of chainIds
      if (filters.chainIds?.length) {
        if (filters.chainIds.length === 1) {
          body.filters.chainId = filters.chainIds[0];
        } else {
          // Send array for multi-chain filtering
          body.filters.chainIds = filters.chainIds;
        }
      }
      if (filters.active !== undefined) {
        body.filters.active = filters.active;
      }
      if (filters.mcp !== undefined) {
        body.filters.mcp = filters.mcp;
      }
      if (filters.a2a !== undefined) {
        body.filters.a2a = filters.a2a;
      }
      if (filters.x402 !== undefined) {
        body.filters.x402support = filters.x402;
      }
      if (filters.skills?.length) {
        body.filters.capabilities = filters.skills;
      }
      if (filters.domains?.length) {
        body.filters.domains = filters.domains;
      }
    }

    const response = await fetchWithTimeout(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Search service error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as SearchResponseBody;

    const results: SearchResultItem[] = data.results.map((r) => ({
      agentId: r.agentId,
      chainId: r.chainId,
      name: r.name,
      description: r.description,
      score: r.score,
      metadata: r.metadata,
      matchReasons: r.matchReasons,
    }));

    // Determine if there are more results
    // Note: search-service may return total = results.length (not true total)
    // So we use a heuristic: if we got exactly `limit` results, assume there are more
    const hasMore =
      data.pagination?.hasMore ?? (results.length >= limit || offset + results.length < data.total);

    // Generate nextCursor if there are more results
    // Use server-provided cursor if available, otherwise generate offset-based cursor
    let nextCursor: string | undefined;
    if (hasMore) {
      nextCursor = data.pagination?.nextCursor ?? encodeOffsetCursor(offset + results.length);
    }

    // Total from search-service may be capped at results.length
    // If hasMore is true, we know there are at least more results
    // Return the server's total but indicate hasMore correctly
    return {
      results,
      total: data.total,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Internal search implementation (used by coalescing wrapper)
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Search logic with cache and OR mode requires multiple branches
  async function searchInternal(params: SearchParams): Promise<SearchServiceResult> {
    const { query, limit = 20, minScore = 0.3, cursor, offset, filters } = params;

    // Determine starting offset
    // Priority: explicit offset > cursor > 0
    let startOffset = 0;

    // If explicit offset is provided, use it directly
    if (offset !== undefined && offset > 0) {
      startOffset = offset;
    } else if (cursor && cache) {
      // Check if cursor is a cached cursor (pagination from cache)
      const cachedCursor = decodeCachedCursor(cursor);
      if (cachedCursor) {
        const cached = await cache.get<CachedSearchData>(cachedCursor.k);
        if (cached) {
          return paginateFromCache(cached, cachedCursor.k, cachedCursor.o, limit);
        }
        // Cache expired - use offset from cursor as fallback
        startOffset = cachedCursor.o;
      }
    }

    // Check if OR mode with multiple boolean filters
    const booleanFilters: Array<'mcp' | 'a2a' | 'x402'> = [];
    if (filters?.mcp) booleanFilters.push('mcp');
    if (filters?.a2a) booleanFilters.push('a2a');
    if (filters?.x402) booleanFilters.push('x402');

    const isOrMode = filters?.filterMode === 'OR' && booleanFilters.length > 1;

    if (isOrMode) {
      // OR mode: run separate searches for each boolean filter and merge results
      const baseFilters: SearchFilters = {
        chainIds: filters?.chainIds,
        active: filters?.active,
        skills: filters?.skills,
        domains: filters?.domains,
      };

      // Calculate smart fetch limit: request enough results per filter to fill the page after merge
      // With N filters, each filter contributes ~limit/N results on average, so fetch limit*2 per filter
      // to account for deduplication
      const perFilterLimit = Math.min(limit * 2, MAX_SEARCH_RESULTS);

      // Fetch results for each filter with smart limit
      const searchPromises = booleanFilters.map(async (filter) => {
        const result = await executeSearch(query, perFilterLimit, minScore, {
          ...baseFilters,
          [filter]: true,
        });
        return { result, filterKey: filter };
      });

      const results = await Promise.all(searchPromises);
      const merged = mergeSearchResults(results, MAX_SEARCH_RESULTS);

      // Cache merged results if there are more than limit
      if (cache && merged.total > limit) {
        const cacheKey = CACHE_KEYS.searchResults(hashSearchParams(query, minScore, filters));
        const cacheData: CachedSearchData = {
          results: merged.results,
          total: merged.total,
          byChain: merged.byChain || {},
        };
        await cache.set(cacheKey, cacheData, CACHE_TTL.SEARCH_RESULTS);

        return paginateFromCache(cacheData, cacheKey, startOffset, limit);
      }

      // No caching needed, return limited results
      const paginatedResults = merged.results.slice(startOffset, startOffset + limit);
      const hasMore = startOffset + limit < merged.results.length;

      return {
        ...merged,
        results: paginatedResults,
        hasMore,
        nextCursor: hasMore ? encodeOffsetCursor(startOffset + limit) : undefined,
      };
    }

    // AND mode (default): single search or multi-chain merge
    // Check if multi-chain filter - need to run separate searches per chain and merge
    const hasMultipleChains = filters?.chainIds && filters.chainIds.length > 1;

    let allResults: SearchServiceResult;
    let byChain: Record<number, number>;

    if (hasMultipleChains && filters?.chainIds) {
      // Multi-chain: run separate searches for each chain and merge
      // Calculate smart fetch limit: request enough results per chain to fill the page after merge
      const perChainLimit = Math.min(limit * 2, MAX_SEARCH_RESULTS);

      const chainSearches = filters.chainIds.map(async (chainId) => {
        const singleChainFilters = { ...filters, chainIds: [chainId] };
        const result = await executeSearch(query, perChainLimit, minScore, singleChainFilters);
        return { result, filterKey: `chain:${chainId}` };
      });

      const results = await Promise.all(chainSearches);
      const merged = mergeSearchResults(results, MAX_SEARCH_RESULTS);
      allResults = merged;
      byChain = merged.byChain || computeByChain(merged.results);
    } else {
      // Single chain or no chain filter: single search
      // Use smart limit: fetch limit*2 for potential pagination, capped at max
      const smartLimit = Math.min(limit * 2, MAX_SEARCH_RESULTS);
      allResults = await executeSearch(query, smartLimit, minScore, filters);
      byChain = computeByChain(allResults.results);
    }

    // Cache results if there are more than limit
    if (cache && allResults.results.length > limit) {
      const cacheKey = CACHE_KEYS.searchResults(hashSearchParams(query, minScore, filters));
      const cacheData: CachedSearchData = {
        results: allResults.results,
        total: allResults.results.length,
        byChain,
      };
      await cache.set(cacheKey, cacheData, CACHE_TTL.SEARCH_RESULTS);

      return paginateFromCache(cacheData, cacheKey, startOffset, limit);
    }

    // No caching needed (few results or no cache service)
    const paginatedResults = allResults.results.slice(startOffset, startOffset + limit);
    const hasMore = startOffset + limit < allResults.results.length;

    return {
      results: paginatedResults,
      total: allResults.results.length,
      hasMore,
      nextCursor: hasMore ? encodeOffsetCursor(startOffset + limit) : undefined,
      byChain,
    };
  }

  return {
    async search(params: SearchParams): Promise<SearchServiceResult> {
      const { query, minScore = 0.3, filters, cursor, offset } = params;

      // Generate coalescing key from search parameters
      // Only coalesce if no cursor/offset (first page requests)
      if (!cursor && !offset) {
        const coalescingKey = hashSearchParams(query, minScore, filters);

        // Check if there's already a pending request for the same search
        const pending = pendingSearches.get(coalescingKey);
        if (pending) {
          return pending;
        }

        // Create the promise and store it for coalescing
        const promise = searchInternal(params);
        pendingSearches.set(coalescingKey, promise);

        // Set timeout to clean up stale entries
        setTimeout(() => {
          pendingSearches.delete(coalescingKey);
        }, PENDING_REQUEST_TIMEOUT_MS);

        try {
          return await promise;
        } finally {
          // Clean up immediately after completion
          pendingSearches.delete(coalescingKey);
        }
      }

      // For paginated requests, execute directly without coalescing
      return searchInternal(params);
    },

    async healthCheck(): Promise<boolean> {
      try {
        // agent0lab uses /health, AG0 standard uses /api/v1/health
        const response = await fetchWithTimeout(
          `${baseUrl}/health`,
          { method: 'GET' },
          5000 // 5 second timeout for health checks
        );

        if (!response.ok) return false;

        const data = (await response.json()) as { status: string };
        return data.status === 'ok';
      } catch {
        return false;
      }
    },
  };
}
