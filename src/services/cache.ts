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
 */
export const CACHE_TTL = {
  /** Agent list cache: 5 minutes */
  AGENTS: 300,
  /** Single agent cache: 5 minutes */
  AGENT_DETAIL: 300,
  /** Classification cache: 24 hours */
  CLASSIFICATION: 86400,
  /** Chain stats cache: 15 minutes */
  CHAIN_STATS: 900,
  /** Platform stats cache: 15 minutes */
  PLATFORM_STATS: 900,
  /** Taxonomy cache: 1 hour */
  TAXONOMY: 3600,
  /** Search results cache: 5 minutes */
  SEARCH: 300,
  /** IPFS metadata cache: 1 hour (content is immutable) */
  IPFS_METADATA: 3600,
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
  ipfsMetadata: (agentId: string) => `ipfs:metadata:${agentId}`,
} as const;

/**
 * Create a hash from an object for use in cache keys
 */
function hashObject(obj: Record<string, unknown>): string {
  const sorted = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash('sha256').update(sorted).digest('hex').substring(0, 16);
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
