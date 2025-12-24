/**
 * Pagination cache service for consistent multi-chain pagination
 *
 * This service caches full result sets from multi-chain queries to ensure:
 * - Consistent total counts across pages
 * - Correct sorting across pages
 * - No duplicates when paginating
 *
 * @module services/pagination-cache
 */

import type { AgentSummary } from '@/types';
import { CACHE_KEYS, CACHE_TTL, hashQueryParams } from './cache';

/**
 * Cached pagination set structure
 */
export interface CachedPaginationSet {
  /** All items in the result set */
  items: AgentSummary[];
  /** Total count of items */
  total: number;
  /** Hash of the filter parameters used to generate this set */
  filterHash: string;
  /** Unix timestamp when this set was cached */
  cachedAt: number;
}

/**
 * Parameters for generating a pagination cache key
 */
export interface PaginationCacheParams {
  chainIds?: number[];
  active?: boolean;
  hasMcp?: boolean;
  hasA2a?: boolean;
  hasX402?: boolean;
  mcpTools?: string[];
  a2aSkills?: string[];
  hasRegistrationFile?: boolean;
  /** Sort field */
  sort?: string;
  /** Sort order */
  order?: string;
}

/**
 * Generate a unique cache key for pagination based on filter parameters
 * @param params - Filter parameters
 * @returns Cache key string
 */
export function generatePaginationCacheKey(params: PaginationCacheParams): string {
  // Create a normalized object for hashing (exclude pagination params)
  const normalized: Record<string, unknown> = {};

  if (params.chainIds && params.chainIds.length > 0) {
    // Sort chain IDs for consistent hashing
    normalized.chainIds = [...params.chainIds].sort((a, b) => a - b);
  }
  if (params.active !== undefined) normalized.active = params.active;
  if (params.hasMcp !== undefined) normalized.hasMcp = params.hasMcp;
  if (params.hasA2a !== undefined) normalized.hasA2a = params.hasA2a;
  if (params.hasX402 !== undefined) normalized.hasX402 = params.hasX402;
  if (params.mcpTools && params.mcpTools.length > 0) {
    normalized.mcpTools = [...params.mcpTools].sort();
  }
  if (params.a2aSkills && params.a2aSkills.length > 0) {
    normalized.a2aSkills = [...params.a2aSkills].sort();
  }
  if (params.hasRegistrationFile !== undefined) {
    normalized.hasRegistrationFile = params.hasRegistrationFile;
  }
  if (params.sort) normalized.sort = params.sort;
  if (params.order) normalized.order = params.order;

  const hash = hashQueryParams(normalized);
  return CACHE_KEYS.paginationSet(hash);
}

/**
 * Get a cached pagination set from KV
 * @param kv - KV namespace binding
 * @param cacheKey - Cache key (from generatePaginationCacheKey)
 * @returns Cached pagination set or null if not found/expired
 */
export async function getCachedPaginationSet(
  kv: KVNamespace,
  cacheKey: string
): Promise<CachedPaginationSet | null> {
  try {
    const cached = await kv.get(cacheKey);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as CachedPaginationSet;

    // Validate structure
    if (!Array.isArray(parsed.items) || typeof parsed.total !== 'number') {
      console.warn(`Invalid pagination cache structure for key ${cacheKey}`);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(
      `Error reading pagination cache for key ${cacheKey}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Store a pagination set in KV cache
 * @param kv - KV namespace binding
 * @param cacheKey - Cache key (from generatePaginationCacheKey)
 * @param items - All items in the result set
 * @param filterHash - Hash of filter parameters (for validation)
 * @param ttl - Time-to-live in seconds (default: CACHE_TTL.PAGINATION_SET)
 */
export async function setCachedPaginationSet(
  kv: KVNamespace,
  cacheKey: string,
  items: AgentSummary[],
  filterHash: string,
  ttl: number = CACHE_TTL.PAGINATION_SET
): Promise<void> {
  const cacheData: CachedPaginationSet = {
    items,
    total: items.length,
    filterHash,
    cachedAt: Date.now(),
  };

  try {
    await kv.put(cacheKey, JSON.stringify(cacheData), {
      expirationTtl: ttl,
    });
  } catch (error) {
    // Log but don't throw - caching failure shouldn't break the request
    console.error(
      `Error writing pagination cache for key ${cacheKey}:`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Sort field type for agents
 */
export type AgentSortField = 'createdAt' | 'name' | 'reputation' | 'relevance';

/**
 * Sort order type
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Apply sorting to a list of agents
 * @param items - Items to sort
 * @param sort - Sort field
 * @param order - Sort order (default: desc)
 * @returns Sorted items (new array)
 */
export function sortAgents(
  items: AgentSummary[],
  sort: AgentSortField = 'createdAt',
  order: SortOrder = 'desc'
): AgentSummary[] {
  const sorted = [...items];
  const multiplier = order === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sort) {
      case 'name': {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return multiplier * nameA.localeCompare(nameB);
      }
      case 'reputation': {
        const repA = a.reputationScore ?? 0;
        const repB = b.reputationScore ?? 0;
        return multiplier * (repA - repB);
      }
      case 'relevance': {
        const scoreA = a.searchScore ?? 0;
        const scoreB = b.searchScore ?? 0;
        return multiplier * (scoreA - scoreB);
      }
      default: {
        // Use tokenId as proxy for createdAt (higher tokenId = newer)
        const tokenA = Number.parseInt(a.tokenId, 10) || 0;
        const tokenB = Number.parseInt(b.tokenId, 10) || 0;
        return multiplier * (tokenA - tokenB);
      }
    }
  });

  return sorted;
}

/**
 * Result from getPaginatedSlice
 */
export interface PaginatedSliceResult {
  /** Items for this page */
  items: AgentSummary[];
  /** Whether there are more items after this page */
  hasMore: boolean;
  /** Cursor for the next page (base64url encoded) */
  nextCursor?: string;
  /** Total items in the full set */
  total: number;
}

/**
 * Encode offset into a cursor string
 * @param offset - Global offset value
 * @returns Base64url encoded cursor
 */
export function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ _global_offset: offset })).toString('base64url');
}

/**
 * Decode a cursor string into an offset
 * @param cursor - Base64url encoded cursor
 * @returns Offset value or 0 if invalid
 */
export function decodeOffset(cursor: string): number {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      _global_offset?: number;
    };
    return decoded._global_offset ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Get a paginated slice from a cached set
 * @param cachedSet - The full cached pagination set
 * @param offset - Starting offset (0-indexed)
 * @param limit - Maximum items to return
 * @param sort - Optional sort field (applies to full set before slicing)
 * @param order - Optional sort order
 * @returns Paginated slice with cursor for next page
 */
export function getPaginatedSlice(
  cachedSet: CachedPaginationSet,
  offset: number,
  limit: number,
  sort?: AgentSortField,
  order?: SortOrder
): PaginatedSliceResult {
  // Apply sort to full cached set if specified
  const items = sort ? sortAgents(cachedSet.items, sort, order) : cachedSet.items;

  // Extract slice
  const sliced = items.slice(offset, offset + limit);
  const hasMore = offset + limit < items.length;

  return {
    items: sliced,
    hasMore,
    nextCursor: hasMore ? encodeOffset(offset + limit) : undefined,
    total: cachedSet.total,
  };
}

/**
 * Deduplicate agents by ID, keeping the first occurrence
 * @param items - Items that may contain duplicates
 * @returns Deduplicated items
 */
export function deduplicateAgents(items: AgentSummary[]): AgentSummary[] {
  const seen = new Set<string>();
  const result: AgentSummary[] = [];

  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }

  return result;
}

/**
 * Interleave results from different chains in round-robin fashion
 * This ensures fair representation from all chains in paginated results
 * Each chain's results are sorted by tokenId descending before interleaving
 *
 * @param chainResults - Array of {chainId, items} from each chain query
 * @returns Interleaved items from all chains
 */
export function interleaveChainResults(
  chainResults: Array<{ chainId: number; items: AgentSummary[] }>
): AgentSummary[] {
  // Sort each chain's items by tokenId descending (newest first within chain)
  const sortedChains = chainResults.map((chain) => ({
    chainId: chain.chainId,
    items: sortAgents(chain.items, 'createdAt', 'desc'),
    index: 0,
  }));

  // Filter out empty chains
  const nonEmptyChains = sortedChains.filter((c) => c.items.length > 0);
  if (nonEmptyChains.length === 0) return [];

  const result: AgentSummary[] = [];
  let hasMore = true;

  // Round-robin through chains until all are exhausted
  while (hasMore) {
    hasMore = false;
    for (const chain of nonEmptyChains) {
      if (chain.index < chain.items.length) {
        const item = chain.items[chain.index];
        if (item) {
          result.push(item);
        }
        chain.index++;
        if (chain.index < chain.items.length) {
          hasMore = true;
        }
      }
    }
  }

  return result;
}
