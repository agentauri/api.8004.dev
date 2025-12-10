/**
 * Search service client
 * @module services/search
 */

import { fetchWithTimeout } from '@/lib/utils/fetch';
import type { SearchFilters, SearchResultItem, SearchServiceResult } from '@/types';

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
 * Create search service client
 */
export function createSearchService(searchServiceUrl: string): SearchService {
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

      if (filters.chainIds?.length === 1) {
        body.filters.chainId = filters.chainIds[0];
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

  return {
    async search(params: SearchParams): Promise<SearchServiceResult> {
      const { query, limit = 20, minScore = 0.3, cursor, filters } = params;

      // Decode cursor (may be offset or OR composite)
      const { orCursor } = cursor ? decodeCursor(cursor) : { orCursor: undefined };

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

        // Use saved cursors from composite cursor if available
        const searchPromises = booleanFilters.map(async (filter) => {
          const filterCursor = orCursor?.cursors[filter];
          const result = await executeSearch(
            query,
            limit,
            minScore,
            {
              ...baseFilters,
              [filter]: true,
            },
            filterCursor
          );
          return { result, filterKey: filter };
        });

        const results = await Promise.all(searchPromises);
        return mergeSearchResults(results, limit);
      }

      // AND mode (default): single search with all filters
      const result = await executeSearch(query, limit, minScore, filters, cursor);

      // Add byChain breakdown for AND mode
      const byChain: Record<number, number> = {};
      for (const item of result.results) {
        byChain[item.chainId] = (byChain[item.chainId] || 0) + 1;
      }

      return { ...result, byChain };
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
