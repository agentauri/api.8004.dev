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
 * Search service request body (AG0 Semantic Search Standard)
 */
interface SearchRequestBody {
  query: string;
  limit: number;
  offset?: number;
  cursor?: string;
  minScore?: number;
  filters?: {
    equals?: Record<string, unknown>;
    in?: Record<string, unknown[]>;
    capabilities?: string[];
    domains?: string[];
    chainId?: number;
    mode?: 'AND' | 'OR';
  };
  includeMetadata?: boolean;
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
 * Create search service client
 */
export function createSearchService(searchServiceUrl: string): SearchService {
  const baseUrl = searchServiceUrl.replace(/\/$/, '');

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This function handles complex filter logic that is intentionally comprehensive
    async search(params: SearchParams): Promise<SearchServiceResult> {
      const { query, limit = 20, minScore = 0.3, cursor, filters } = params;

      // Build request body following AG0 Semantic Search Standard
      const body: SearchRequestBody = {
        query,
        limit,
        minScore,
        cursor,
        includeMetadata: true,
      };

      // Add filters if provided
      if (filters) {
        body.filters = {};

        if (filters.chainIds?.length === 1) {
          body.filters.chainId = filters.chainIds[0];
        } else if (filters.chainIds && filters.chainIds.length > 1) {
          body.filters.in = { chainId: filters.chainIds };
        }

        if (filters.skills?.length) {
          body.filters.capabilities = filters.skills;
        }

        if (filters.domains?.length) {
          body.filters.domains = filters.domains;
        }

        if (filters.active !== undefined) {
          body.filters.equals = { ...body.filters.equals, active: filters.active };
        }

        if (filters.mcp !== undefined) {
          body.filters.equals = { ...body.filters.equals, mcp: filters.mcp };
        }

        if (filters.a2a !== undefined) {
          body.filters.equals = { ...body.filters.equals, a2a: filters.a2a };
        }

        if (filters.x402 !== undefined) {
          body.filters.equals = { ...body.filters.equals, x402: filters.x402 };
        }

        if (filters.filterMode) {
          body.filters.mode = filters.filterMode;
        }
      }

      // agent0lab uses /api/search, AG0 standard uses /api/v1/search
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

      // Transform response to our format
      const results: SearchResultItem[] = data.results.map((r) => ({
        agentId: r.agentId,
        chainId: r.chainId,
        name: r.name,
        description: r.description,
        score: r.score,
        metadata: r.metadata,
      }));

      return {
        results,
        total: data.total,
        hasMore: data.pagination?.hasMore ?? results.length >= limit,
        nextCursor: data.pagination?.nextCursor,
      };
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
