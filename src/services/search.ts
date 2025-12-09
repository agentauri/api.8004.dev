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
 * Encode offset into a cursor string
 */
function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

/**
 * Decode cursor string into offset
 */
function decodeOffsetCursor(cursor: string): number {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return typeof decoded.offset === 'number' ? decoded.offset : 0;
  } catch {
    return 0;
  }
}

/**
 * Merge and deduplicate search results, keeping highest score per agent
 */
function mergeSearchResults(
  resultArrays: SearchServiceResult[],
  limit: number
): SearchServiceResult {
  const agentMap = new Map<string, SearchResultItem>();

  // Collect all results, keeping highest score per agent
  for (const result of resultArrays) {
    for (const item of result.results) {
      const existing = agentMap.get(item.agentId);
      if (!existing || item.score > existing.score) {
        agentMap.set(item.agentId, item);
      }
    }
  }

  // Sort by score descending and limit
  const mergedResults = [...agentMap.values()].sort((a, b) => b.score - a.score).slice(0, limit);

  const totalUnique = agentMap.size;

  return {
    results: mergedResults,
    total: totalUnique,
    hasMore: totalUnique > limit,
    // Cannot provide cursor for merged OR results
    nextCursor: undefined,
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
    const offset = cursor ? decodeOffsetCursor(cursor) : 0;

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
    const hasMore = data.pagination?.hasMore ?? (offset + results.length < data.total);

    // Generate nextCursor if there are more results
    // Use server-provided cursor if available, otherwise generate offset-based cursor
    let nextCursor: string | undefined;
    if (hasMore) {
      nextCursor = data.pagination?.nextCursor ?? encodeOffsetCursor(offset + results.length);
    }

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

      // Check if OR mode with multiple boolean filters
      const booleanFilters: Array<'mcp' | 'a2a' | 'x402'> = [];
      if (filters?.mcp) booleanFilters.push('mcp');
      if (filters?.a2a) booleanFilters.push('a2a');
      if (filters?.x402) booleanFilters.push('x402');

      const isOrMode = filters?.filterMode === 'OR' && booleanFilters.length > 1;

      if (isOrMode) {
        // OR mode: run separate searches for each boolean filter and merge results
        // Note: cursor pagination is not supported in OR mode as results are merged
        const baseFilters: SearchFilters = {
          chainIds: filters?.chainIds,
          active: filters?.active,
          skills: filters?.skills,
          domains: filters?.domains,
        };

        const searchPromises = booleanFilters.map((filter) =>
          executeSearch(query, limit, minScore, {
            ...baseFilters,
            [filter]: true,
          })
        );

        const results = await Promise.all(searchPromises);
        return mergeSearchResults(results, limit);
      }

      // AND mode (default): single search with all filters
      return executeSearch(query, limit, minScore, filters, cursor);
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
