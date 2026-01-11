/**
 * API Key authentication middleware
 * @module lib/middleware/api-key
 *
 * Supports two modes:
 * 1. Legacy: Single shared API key from environment (API_KEY)
 * 2. D1: Individual API keys stored in database with per-key rate limits
 */

import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { type ApiKeyTier, DEFAULT_RATE_LIMITS, validateApiKey } from '@/services/api-keys';
import type { Env, Variables } from '@/types';

/**
 * Constant-time string comparison to prevent timing attacks
 * Uses Node.js crypto.timingSafeEqual for secure comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  // Different lengths are never equal, but we still do constant-time work
  // to avoid leaking length information via timing
  if (a.length !== b.length) {
    // Compare 'a' against itself to maintain constant-time behavior
    const bufA = Buffer.from(a, 'utf8');
    cryptoTimingSafeEqual(bufA, bufA);
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return cryptoTimingSafeEqual(bufA, bufB);
}

/**
 * Extended variables with API key info
 */
export interface ApiKeyVariables extends Variables {
  /** Whether request is authenticated with valid API key */
  isAuthenticated: boolean;
  /** API key tier for rate limiting */
  apiKeyTier: ApiKeyTier;
  /** API key ID (for D1 keys) */
  apiKeyId?: string;
  /** API key permissions (for D1 keys) */
  apiKeyPermissions?: string[];
  /** Rate limit in requests per minute */
  rateLimitRpm: number;
}

/**
 * Extract API key from request headers
 * Supports both X-API-Key header and Authorization: Bearer
 */
function extractApiKey(request: Request): string | null {
  // Check X-API-Key header first
  const xApiKey = request.headers.get('X-API-Key');
  if (xApiKey) return xApiKey;

  // Check Authorization: Bearer header
  const authorization = request.headers.get('Authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice(7);
  }

  return null;
}

/**
 * API Key authentication middleware
 *
 * Sets context variables:
 * - isAuthenticated: boolean
 * - apiKeyTier: 'anonymous' | 'standard' | 'premium'
 * - apiKeyId: string (optional, for D1 keys)
 * - rateLimitRpm: number
 *
 * Does NOT block requests without API key - just sets lower tier
 *
 * Validation order:
 * 1. Check legacy environment API key (API_KEY)
 * 2. Check D1 database for individual keys
 * 3. Fall back to anonymous tier
 */
export function apiKeyAuth(): MiddlewareHandler<{
  Bindings: Env;
  Variables: ApiKeyVariables;
}> {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Authentication middleware requires branching logic for multiple auth methods
  return async (c, next) => {
    const apiKey = extractApiKey(c.req.raw);
    const logger = c.get('logger');

    // Default to anonymous
    c.set('isAuthenticated', false);
    c.set('apiKeyTier', 'anonymous');
    c.set('rateLimitRpm', DEFAULT_RATE_LIMITS.anonymous);

    if (apiKey) {
      // First check legacy environment API key
      const legacyKey = c.env.API_KEY;
      if (legacyKey && timingSafeEqual(apiKey, legacyKey)) {
        c.set('isAuthenticated', true);
        c.set('apiKeyTier', 'standard');
        c.set('rateLimitRpm', DEFAULT_RATE_LIMITS.standard);
        await next();
        return;
      }

      // Then check D1 for individual keys (only if DB is available)
      if (c.env.DB) {
        try {
          const validation = await validateApiKey(c.env.DB, apiKey);
          if (validation.valid) {
            c.set('isAuthenticated', true);
            c.set('apiKeyTier', validation.tier);
            c.set('rateLimitRpm', validation.rateLimitRpm);
            if (validation.keyId) {
              c.set('apiKeyId', validation.keyId);
            }
            if (validation.permissions) {
              c.set('apiKeyPermissions', validation.permissions);
            }
          } else if (validation.reason) {
            logger.debug('API key validation failed', { reason: validation.reason });
          }
        } catch (error) {
          // D1 validation failed - log but don't block
          logger.warn('D1 API key validation error', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    await next();
  };
}

/**
 * Middleware that requires authentication
 * Returns 401 if no valid API key provided
 *
 * Checks both legacy environment key and D1 keys
 */
export function requireApiKey(): MiddlewareHandler<{
  Bindings: Env;
  Variables: ApiKeyVariables;
}> {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Authentication middleware requires branching logic for multiple auth methods
  return async (c, next) => {
    const apiKey = extractApiKey(c.req.raw);
    const logger = c.get('logger');

    if (!apiKey) {
      return c.json(
        {
          success: false,
          error: 'API key required',
          code: 'UNAUTHORIZED',
        },
        401
      );
    }

    // First check legacy environment API key
    const legacyKey = c.env.API_KEY;
    if (legacyKey && timingSafeEqual(apiKey, legacyKey)) {
      c.set('isAuthenticated', true);
      c.set('apiKeyTier', 'standard');
      c.set('rateLimitRpm', DEFAULT_RATE_LIMITS.standard);
      await next();
      return;
    }

    // Then check D1 for individual keys (only if DB is available)
    if (c.env.DB) {
      try {
        const validation = await validateApiKey(c.env.DB, apiKey);
        if (validation.valid) {
          c.set('isAuthenticated', true);
          c.set('apiKeyTier', validation.tier);
          c.set('rateLimitRpm', validation.rateLimitRpm);
          if (validation.keyId) {
            c.set('apiKeyId', validation.keyId);
          }
          if (validation.permissions) {
            c.set('apiKeyPermissions', validation.permissions);
          }
          await next();
          return;
        }

        // Log the reason for invalid key
        if (validation.reason) {
          logger.debug('API key rejected', { reason: validation.reason });
        }
      } catch (error) {
        logger.warn('D1 API key validation error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // If we get here, the key is invalid
    return c.json(
      {
        success: false,
        error: 'Invalid API key',
        code: 'UNAUTHORIZED',
      },
      401
    );
  };
}
