/**
 * Rate limiting middleware using KV storage
 * @module lib/utils/rate-limit
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env, Variables } from '@/types';
import { errors } from './errors';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  limit: number;
  /** Window duration in seconds */
  window: number;
  /** Key prefix for rate limit entries */
  keyPrefix?: string;
}

/**
 * Rate limit entry stored in KV
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Get client identifier for rate limiting
 * SECURITY: Only use CF-Connecting-IP which is set by Cloudflare and cannot be spoofed.
 * X-Forwarded-For is NOT used as it can be spoofed by clients.
 */
function getClientId(c: Context): string {
  // CF-Connecting-IP is set by Cloudflare and cannot be spoofed
  const cfIp = c.req.header('CF-Connecting-IP');
  if (cfIp) return cfIp;

  // Fallback for local development only
  // In production, all requests go through Cloudflare which sets CF-Connecting-IP
  return 'anonymous';
}

/**
 * Create rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig): MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> {
  const { limit, window, keyPrefix = 'ratelimit' } = config;

  return async (c, next) => {
    const kv = c.env.CACHE;
    const clientId = getClientId(c);
    const key = `${keyPrefix}:${clientId}`;
    const now = Math.floor(Date.now() / 1000);

    try {
      // Get current rate limit entry
      const entryStr = await kv.get(key);
      let entry: RateLimitEntry;

      if (entryStr) {
        try {
          entry = JSON.parse(entryStr) as RateLimitEntry;

          // Check if window has expired
          if (now >= entry.resetAt) {
            entry = { count: 0, resetAt: now + window };
          }
        } catch {
          // Corrupted entry, reset
          entry = { count: 0, resetAt: now + window };
        }
      } else {
        entry = { count: 0, resetAt: now + window };
      }

      // Increment count
      entry.count++;

      // Calculate remaining
      const remaining = Math.max(0, limit - entry.count);
      const resetTime = entry.resetAt;

      // Set rate limit headers
      c.header('X-RateLimit-Limit', String(limit));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(resetTime));

      // Check if limit exceeded
      if (entry.count > limit) {
        c.header('Retry-After', String(resetTime - now));
        return errors.rateLimitExceeded(c);
      }

      // Store updated entry
      // Note: KV requires minimum 60 second TTL
      const ttl = entry.resetAt - now;
      await kv.put(key, JSON.stringify(entry), {
        expirationTtl: Math.max(ttl, 60),
      });
    } catch (error) {
      // SECURITY: Log the error but fail closed for safety
      // Consecutive KV failures could indicate an attack or system issue
      console.error('Rate limit KV error:', error instanceof Error ? error.message : String(error));

      // Fail closed: reject requests when rate limiter is unavailable
      // This prevents abuse during KV outages at the cost of some availability
      // For critical production use, consider implementing a circuit breaker
      // or in-memory fallback cache
      return errors.internalError(c, 'Rate limiting temporarily unavailable');
    }

    await next();
  };
}

/**
 * Default rate limit configurations
 */
export const rateLimitConfigs = {
  /** Standard API rate limit: 60 requests per minute (anonymous) */
  standard: { limit: 60, window: 60 },

  /** Higher rate limit with API key: 300 requests per minute */
  withApiKey: { limit: 300, window: 60 },

  /** Classification rate limit: 100 requests per minute (temporarily increased) */
  classification: { limit: 100, window: 60, keyPrefix: 'ratelimit:classify' },
} as const;

/**
 * Per-endpoint rate limit configurations
 * Different endpoints have different computational costs
 */
export const endpointRateLimits: Record<string, { anonymous: number; authenticated: number }> = {
  // Expensive vector search operations
  '/api/v1/search': { anonymous: 30, authenticated: 100 },

  // Agent list endpoint (moderate cost)
  '/api/v1/agents': { anonymous: 60, authenticated: 200 },

  // LLM classification (very expensive)
  '/api/v1/agents/:agentId/classify': { anonymous: 10, authenticated: 30 },

  // Stats endpoint (cached, low cost)
  '/api/v1/stats': { anonymous: 120, authenticated: 300 },

  // Chain endpoint (cached, low cost)
  '/api/v1/chains': { anonymous: 120, authenticated: 300 },

  // Taxonomy endpoint (cached, low cost)
  '/api/v1/taxonomy': { anonymous: 120, authenticated: 300 },

  // Health endpoint (no limit needed but include for completeness)
  '/api/v1/health': { anonymous: 120, authenticated: 300 },

  // Default for other endpoints
  default: { anonymous: 60, authenticated: 300 },
};

/**
 * Get the rate limit for a specific endpoint and authentication status
 */
export function getEndpointRateLimit(
  path: string,
  isAuthenticated: boolean
): { limit: number; keyPrefix: string } {
  // Normalize path: remove trailing slashes and query params
  const normalizedPath = path.split('?')[0]?.replace(/\/+$/, '') ?? '';

  // Check for exact match first
  let config = endpointRateLimits[normalizedPath];

  // Check for pattern matches (e.g., /api/v1/agents/:agentId/classify)
  if (!config) {
    // Match classify endpoint pattern
    if (normalizedPath.match(/^\/api\/v1\/agents\/[^/]+\/classify$/)) {
      config = endpointRateLimits['/api/v1/agents/:agentId/classify'];
    }
    // Match single agent detail pattern
    else if (normalizedPath.match(/^\/api\/v1\/agents\/[^/]+$/)) {
      config = endpointRateLimits['/api/v1/agents'];
    }
  }

  // Fall back to default
  if (!config) {
    config = endpointRateLimits.default ?? { anonymous: 60, authenticated: 300 };
  }

  const limit = isAuthenticated ? config.authenticated : config.anonymous;

  // Create a unique key prefix based on the normalized path
  const pathSlug = normalizedPath.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
  const keyPrefix = `ratelimit:${pathSlug}`;

  return { limit, keyPrefix };
}

/**
 * Create per-endpoint rate limiting middleware
 * Automatically determines rate limit based on endpoint and authentication status
 */
export function perEndpointRateLimit(): MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> {
  const window = 60; // 1 minute window for all endpoints

  return async (c, next) => {
    const kv = c.env.CACHE;
    const clientId = getClientId(c);
    const isAuthenticated = c.get('isAuthenticated') ?? false;
    const path = c.req.path;

    const { limit, keyPrefix } = getEndpointRateLimit(path, isAuthenticated);
    const key = `${keyPrefix}:${clientId}`;
    const now = Math.floor(Date.now() / 1000);

    try {
      // Get current rate limit entry
      const entryStr = await kv.get(key);
      let entry: RateLimitEntry;

      if (entryStr) {
        try {
          entry = JSON.parse(entryStr) as RateLimitEntry;

          // Check if window has expired
          if (now >= entry.resetAt) {
            entry = { count: 0, resetAt: now + window };
          }
        } catch {
          // Corrupted entry, reset
          entry = { count: 0, resetAt: now + window };
        }
      } else {
        entry = { count: 0, resetAt: now + window };
      }

      // Increment count
      entry.count++;

      // Calculate remaining
      const remaining = Math.max(0, limit - entry.count);
      const resetTime = entry.resetAt;

      // Set rate limit headers
      c.header('X-RateLimit-Limit', String(limit));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(resetTime));

      // Check if limit exceeded
      if (entry.count > limit) {
        c.header('Retry-After', String(resetTime - now));
        return errors.rateLimitExceeded(c);
      }

      // Store updated entry
      // Note: KV requires minimum 60 second TTL
      const ttl = entry.resetAt - now;
      await kv.put(key, JSON.stringify(entry), {
        expirationTtl: Math.max(ttl, 60),
      });
    } catch (error) {
      // SECURITY: Log the error but fail closed for safety
      console.error('Rate limit KV error:', error instanceof Error ? error.message : String(error));

      // Fail closed: reject requests when rate limiter is unavailable
      return errors.internalError(c, 'Rate limiting temporarily unavailable');
    }

    await next();
  };
}
