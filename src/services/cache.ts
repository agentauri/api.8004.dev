/**
 * Cache service using Cloudflare KV
 * @module services/cache
 */

import { createHash } from 'node:crypto';

/**
 * Cache service interface
 */
export interface CacheService {
  /**
   * Get a cached value
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a cached value
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete a cached value
   */
  delete(key: string): Promise<void>;

  /**
   * Generate a cache key from prefix and params
   */
  generateKey(prefix: string, params: Record<string, unknown>): string;
}

/**
 * Cache TTL constants in seconds
 * TTL values are aligned to prevent data inconsistency between related caches
 */
export const CACHE_TTL = {
  /** Agent list cache: 3 minutes (reduced for fresher data) */
  AGENTS: 180,
  /** Single agent cache: 3 minutes (aligned with AGENTS) */
  AGENT_DETAIL: 180,
  /** Classification cache: 6 hours (reduced from 24h for fresher classifications) */
  CLASSIFICATION: 21600,
  /** Chain stats cache: 5 minutes (reduced for more accurate counts) */
  CHAIN_STATS: 300,
  /** Platform stats cache: 5 minutes (aligned with CHAIN_STATS) */
  PLATFORM_STATS: 300,
  /** Taxonomy cache: 1 hour */
  TAXONOMY: 3600,
  /** Search results cache: 3 minutes (aligned with AGENTS) */
  SEARCH: 180,
  /** Search results for pagination: 3 minutes (aligned with SEARCH) */
  SEARCH_RESULTS: 180,
  /** IPFS metadata cache: 1 hour (content is immutable) */
  IPFS_METADATA: 3600,
  /** OR mode agents results for pagination: 3 minutes (aligned with AGENTS) */
  OR_MODE_AGENTS: 180,
  /** Multi-chain pagination set: 5 minutes for consistent pagination */
  PAGINATION_SET: 300,
  /** MCP session: 1 hour for reconnection support */
  MCP_SESSION: 3600,
  /** Leaderboard cache: 5 minutes */
  LEADERBOARD: 300,
  /** Global feedbacks cache: 1 minute (near real-time) */
  FEEDBACKS_GLOBAL: 60,
  /** Trending agents cache: 15 minutes (expensive computation) */
  TRENDING: 900,
  /** Evaluations list cache: 1 minute (shows live queue status) */
  EVALUATIONS: 60,
  /** Single evaluation cache: 5 minutes (immutable once completed) */
  EVALUATION_DETAIL: 300,
  /** Agent evaluations history: 1 minute */
  AGENT_EVALUATIONS: 60,
} as const;

/**
 * Cache key generators
 */
export const CACHE_KEYS = {
  agentsList: (hash: string) => `agents:list:${hash}`,
  agentDetail: (agentId: string) => `agents:detail:${agentId}`,
  classification: (agentId: string) => `classification:${agentId}`,
  chainStats: () => 'chains:stats',
  /** Fallback cache for individual chain stats (used when SDK fails) */
  chainStatsFallback: (chainId: number) => `chains:stats:fallback:${chainId}`,
  platformStats: () => 'platform:stats',
  taxonomy: (type: string) => `taxonomy:${type}`,
  search: (hash: string) => `search:${hash}`,
  /** Search results for pagination (stores full result set) */
  searchResults: (hash: string) => `search:results:${hash}`,
  ipfsMetadata: (agentId: string) => `ipfs:metadata:${agentId}`,
  /** OR mode agents results for pagination (stores merged result set) */
  orModeAgents: (hash: string) => `agents:or:${hash}`,
  /** Multi-chain pagination set (stores full merged result set for consistent pagination) */
  paginationSet: (filterHash: string) => `pagination:set:${filterHash}`,
  /** MCP session (stores session state for reconnection) */
  mcpSession: (sessionId: string) => `mcp-session:${sessionId}`,
  /** Leaderboard (stores ranked agents by reputation) */
  leaderboard: (hash: string) => `leaderboard:${hash}`,
  /** Global feedbacks (stores all feedbacks across agents) */
  feedbacksGlobal: (hash: string) => `feedbacks:global:${hash}`,
  /** Trending agents (stores agents with reputation changes) */
  trending: (period: string) => `trending:${period}`,
  /** Evaluations list (stores paginated evaluations) */
  evaluations: (hash: string) => `evaluations:${hash}`,
  /** Single evaluation detail */
  evaluationDetail: (id: string) => `evaluation:${id}`,
  /** Agent evaluations history */
  agentEvaluations: (agentId: string, hash: string) => `agent:evaluations:${agentId}:${hash}`,
  /** Unique feedback tags */
  tags: (hash: string) => `tags:${hash}`,
} as const;

/**
 * Create a hash from an object for use in cache keys
 */
function hashObject(obj: Record<string, unknown>): string {
  const sorted = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash('sha256').update(sorted).digest('hex').substring(0, 16);
}

/**
 * Create a hash from query parameters for cache keys (public API)
 */
export function hashQueryParams(params: Record<string, unknown>): string {
  return hashObject(params);
}

/**
 * Create a cache service instance
 */
export function createCacheService(kv: KVNamespace, defaultTtl: number): CacheService {
  return {
    async get<T>(key: string): Promise<T | null> {
      const value = await kv.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value) as T;
      } catch (error) {
        console.error(
          `Cache parse error for key ${key}:`,
          error instanceof Error ? error.message : error
        );
        return null;
      }
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const serialized = JSON.stringify(value);
      await kv.put(key, serialized, {
        expirationTtl: ttl ?? defaultTtl,
      });
    },

    async delete(key: string): Promise<void> {
      await kv.delete(key);
    },

    generateKey(prefix: string, params: Record<string, unknown>): string {
      const hash = hashObject(params);
      return `${prefix}:${hash}`;
    },
  };
}
