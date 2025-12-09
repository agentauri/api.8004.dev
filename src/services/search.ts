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
 * Create search service client
 */
export function createSearchService(searchServiceUrl: string): SearchService {
  const baseUrl = searchServiceUrl.replace(/\/$/, '');

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Filter building logic requires multiple conditional checks
    async search(params: SearchParams): Promise<SearchServiceResult> {
      const { query, limit = 20, minScore = 0.3, filters } = params;

      // Build request body using agent0lab search-service format (flat filters)
      const body: SearchRequestBody = {
        query,
        topK: limit,
        minScore,
      };

      // Add flat filters if provided (agent0lab format, not AG0 nested format)
      if (filters) {
        body.filters = {};

        // Chain ID filter (single chain only - search service doesn't support multi-chain in filters)
        if (filters.chainIds?.length === 1) {
          body.filters.chainId = filters.chainIds[0];
        }

        // Boolean filters - use flat format with correct field names
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
          // Search service uses 'x402support', not 'x402'
          body.filters.x402support = filters.x402;
        }

        // Array filters
        if (filters.skills?.length) {
          body.filters.capabilities = filters.skills;
        }
        if (filters.domains?.length) {
          body.filters.domains = filters.domains;
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
