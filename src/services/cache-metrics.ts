/**
 * Cache metrics service for tracking hit/miss/error rates
 * @module services/cache-metrics
 *
 * Provides observability for cache performance:
 * - Per-prefix hit/miss/error tracking
 * - Aggregate statistics
 * - Metrics export for monitoring
 */

import { globalLogger } from '@/lib/logger';
import type { CacheService } from './cache';

/**
 * Metrics for a single cache prefix
 */
export interface PrefixMetrics {
  hits: number;
  misses: number;
  errors: number;
  lastHit?: number;
  lastMiss?: number;
}

/**
 * Aggregate cache metrics
 */
export interface CacheMetrics {
  totalHits: number;
  totalMisses: number;
  totalErrors: number;
  hitRate: number;
  byPrefix: Record<string, PrefixMetrics>;
  startTime: number;
  windowSeconds: number;
}

/**
 * In-memory metrics storage
 * Reset periodically to prevent unbounded memory growth
 */
class MetricsStore {
  private byPrefix: Map<string, PrefixMetrics> = new Map();
  private startTime: number = Date.now();
  private readonly resetIntervalMs: number;

  constructor(resetIntervalMs = 300_000) {
    // 5 minutes default
    this.resetIntervalMs = resetIntervalMs;
  }

  /**
   * Extract prefix from cache key
   * e.g., "agents:list:abc123" -> "agents:list"
   */
  private extractPrefix(key: string): string {
    const parts = key.split(':');
    // Keep first two parts for compound prefixes like "agents:list"
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return parts[0] ?? 'unknown';
  }

  /**
   * Check if metrics window should reset
   */
  private maybeReset(): void {
    if (Date.now() - this.startTime > this.resetIntervalMs) {
      this.byPrefix.clear();
      this.startTime = Date.now();
      globalLogger.debug('Cache metrics window reset');
    }
  }

  /**
   * Get or create prefix metrics
   */
  private getPrefixMetrics(prefix: string): PrefixMetrics {
    let metrics = this.byPrefix.get(prefix);
    if (!metrics) {
      metrics = { hits: 0, misses: 0, errors: 0 };
      this.byPrefix.set(prefix, metrics);
    }
    return metrics;
  }

  /**
   * Record a cache hit
   */
  recordHit(key: string): void {
    this.maybeReset();
    const prefix = this.extractPrefix(key);
    const metrics = this.getPrefixMetrics(prefix);
    metrics.hits++;
    metrics.lastHit = Date.now();
  }

  /**
   * Record a cache miss
   */
  recordMiss(key: string): void {
    this.maybeReset();
    const prefix = this.extractPrefix(key);
    const metrics = this.getPrefixMetrics(prefix);
    metrics.misses++;
    metrics.lastMiss = Date.now();
  }

  /**
   * Record a cache error
   */
  recordError(key: string): void {
    this.maybeReset();
    const prefix = this.extractPrefix(key);
    const metrics = this.getPrefixMetrics(prefix);
    metrics.errors++;
  }

  /**
   * Get aggregate metrics
   */
  getMetrics(): CacheMetrics {
    this.maybeReset();

    let totalHits = 0;
    let totalMisses = 0;
    let totalErrors = 0;
    const byPrefix: Record<string, PrefixMetrics> = {};

    for (const [prefix, metrics] of this.byPrefix) {
      totalHits += metrics.hits;
      totalMisses += metrics.misses;
      totalErrors += metrics.errors;
      byPrefix[prefix] = { ...metrics };
    }

    const total = totalHits + totalMisses;
    const hitRate = total > 0 ? Math.round((totalHits / total) * 10000) / 100 : 0;

    return {
      totalHits,
      totalMisses,
      totalErrors,
      hitRate,
      byPrefix,
      startTime: this.startTime,
      windowSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}

/**
 * Global metrics store (singleton per isolate)
 */
const globalMetricsStore = new MetricsStore();

/**
 * Get current cache metrics
 */
export function getCacheMetrics(): CacheMetrics {
  return globalMetricsStore.getMetrics();
}

/**
 * Create a cache service with metrics tracking
 */
export function createCacheServiceWithMetrics(
  baseService: CacheService
): CacheService & { getMetrics: () => CacheMetrics } {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const value = await baseService.get<T>(key);
        if (value !== null) {
          globalMetricsStore.recordHit(key);
        } else {
          globalMetricsStore.recordMiss(key);
        }
        return value;
      } catch (error) {
        globalMetricsStore.recordError(key);
        throw error;
      }
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      try {
        await baseService.set(key, value, ttl);
      } catch (error) {
        globalMetricsStore.recordError(key);
        throw error;
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await baseService.delete(key);
      } catch (error) {
        globalMetricsStore.recordError(key);
        throw error;
      }
    },

    generateKey(prefix: string, params: Record<string, unknown>): string {
      return baseService.generateKey(prefix, params);
    },

    getMetrics(): CacheMetrics {
      return globalMetricsStore.getMetrics();
    },
  };
}

/**
 * Log cache metrics summary (for periodic logging)
 */
export function logCacheMetricsSummary(): void {
  const metrics = getCacheMetrics();

  globalLogger.info('Cache metrics summary', {
    operation: 'cache-metrics-summary',
    totalHits: metrics.totalHits,
    totalMisses: metrics.totalMisses,
    totalErrors: metrics.totalErrors,
    hitRate: `${metrics.hitRate}%`,
    windowSeconds: metrics.windowSeconds,
    prefixCount: Object.keys(metrics.byPrefix).length,
  });
}
