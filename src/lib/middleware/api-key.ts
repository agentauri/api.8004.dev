/**
 * API Key authentication middleware
 * @module lib/middleware/api-key
 */

import type { MiddlewareHandler } from 'hono';
import type { Env, Variables } from '@/types';

/**
 * Extended variables with API key info
 */
export interface ApiKeyVariables extends Variables {
  /** Whether request is authenticated with valid API key */
  isAuthenticated: boolean;
  /** API key tier for rate limiting */
  apiKeyTier: 'anonymous' | 'standard' | 'premium';
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
 *
 * Does NOT block requests without API key - just sets lower tier
 */
export function apiKeyAuth(): MiddlewareHandler<{
  Bindings: Env;
  Variables: ApiKeyVariables;
}> {
  return async (c, next) => {
    const apiKey = extractApiKey(c.req.raw);

    // Default to anonymous
    c.set('isAuthenticated', false);
    c.set('apiKeyTier', 'anonymous');

    if (apiKey) {
      // Validate against environment API key
      const validKey = c.env.API_KEY;

      if (validKey && apiKey === validKey) {
        c.set('isAuthenticated', true);
        c.set('apiKeyTier', 'standard');
      } else if (validKey) {
        // Invalid API key provided - still allow but as anonymous
        // Could optionally reject here with 401
        console.warn('Invalid API key provided');
      }
    }

    await next();
  };
}

/**
 * Middleware that requires authentication
 * Returns 401 if no valid API key provided
 */
export function requireApiKey(): MiddlewareHandler<{
  Bindings: Env;
  Variables: ApiKeyVariables;
}> {
  return async (c, next) => {
    const apiKey = extractApiKey(c.req.raw);
    const validKey = c.env.API_KEY;

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

    if (!validKey || apiKey !== validKey) {
      return c.json(
        {
          success: false,
          error: 'Invalid API key',
          code: 'UNAUTHORIZED',
        },
        401
      );
    }

    c.set('isAuthenticated', true);
    c.set('apiKeyTier', 'standard');

    await next();
  };
}
