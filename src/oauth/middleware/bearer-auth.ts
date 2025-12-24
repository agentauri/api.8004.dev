/**
 * Dual-mode authentication middleware for MCP endpoints
 * Supports both OAuth 2.0 (for Claude Desktop) and unauthenticated access (for CLI tools)
 * @module oauth/middleware/bearer-auth
 */

import type { Env, Variables } from '@/types';
import type { MiddlewareHandler } from 'hono';
import { extractBearerToken, validateAccessToken } from '../services/token-service';

/**
 * Extended variables for OAuth-aware routes
 */
export interface OAuthVariables extends Variables {
  isOAuthAuthenticated: boolean;
  oauthClientId?: string;
  oauthScope?: string;
}

/**
 * Dual-mode authentication middleware
 *
 * - If no Bearer token: Allow request (anonymous access for CLI tools)
 * - If Bearer token: Validate and attach client info, reject if invalid
 *
 * This maintains backwards compatibility with Claude Code CLI and Cursor
 * while supporting OAuth for Claude Desktop.
 */
export function mcpDualAuth(): MiddlewareHandler<{ Bindings: Env; Variables: OAuthVariables }> {
  return async (c, next) => {
    const token = extractBearerToken(c.req.raw);

    // No token = anonymous access (backwards compatible for CLI)
    if (!token) {
      c.set('isOAuthAuthenticated', false);
      return next();
    }

    // Validate OAuth token
    const result = await validateAccessToken(c.env.DB, token);

    if (!result.valid || !result.token) {
      // Invalid token - return 401 with WWW-Authenticate header
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Invalid or expired access token',
          },
        },
        401,
        {
          'WWW-Authenticate': 'Bearer realm="8004-mcp", error="invalid_token"',
        }
      );
    }

    // Valid token - set context variables
    c.set('isOAuthAuthenticated', true);
    c.set('oauthClientId', result.token.client_id);
    c.set('oauthScope', result.token.scope || undefined);

    return next();
  };
}

/**
 * Strict OAuth authentication middleware
 * Requires a valid Bearer token for all requests
 *
 * Use this for routes that should only be accessible to OAuth clients.
 */
export function mcpRequireAuth(): MiddlewareHandler<{ Bindings: Env; Variables: OAuthVariables }> {
  return async (c, next) => {
    const token = extractBearerToken(c.req.raw);

    if (!token) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Authentication required',
          },
        },
        401,
        {
          'WWW-Authenticate': 'Bearer realm="8004-mcp"',
        }
      );
    }

    const result = await validateAccessToken(c.env.DB, token);

    if (!result.valid || !result.token) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Invalid or expired access token',
          },
        },
        401,
        {
          'WWW-Authenticate': 'Bearer realm="8004-mcp", error="invalid_token"',
        }
      );
    }

    c.set('isOAuthAuthenticated', true);
    c.set('oauthClientId', result.token.client_id);
    c.set('oauthScope', result.token.scope || undefined);

    return next();
  };
}

/**
 * Check if a request has a specific OAuth scope
 *
 * @param c - Hono context
 * @param requiredScope - The scope to check for
 * @returns True if the scope is present (or if not authenticated)
 */
export function hasScope(
  c: { get: (key: 'oauthScope') => string | undefined },
  requiredScope: string
): boolean {
  const scope = c.get('oauthScope');

  // Anonymous requests have no scope restrictions
  if (!scope) {
    return true;
  }

  // Check if scope is present
  const scopes = scope.split(' ');
  return scopes.includes(requiredScope);
}
