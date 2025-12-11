/**
 * Rate limiting middleware using KV storage
 * @module lib/utils/rate-limit
 */

import type { Env, Variables } from '@/types';
import type { Context, MiddlewareHandler } from 'hono';
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

  /** Classification rate limit: 10 requests per minute */
  classification: { limit: 10, window: 60, keyPrefix: 'ratelimit:classify' },
} as const;
