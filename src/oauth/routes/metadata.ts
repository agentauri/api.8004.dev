/**
 * OAuth 2.0 metadata endpoints
 * Implements RFC 8414 (Authorization Server Metadata) and RFC 9728 (Protected Resource Metadata)
 * @module oauth/routes/metadata
 */

import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import type { AuthorizationServerMetadata, ProtectedResourceMetadata } from '../types';

const metadata = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /.well-known/oauth-protected-resource
 * Protected Resource Metadata (RFC 9728)
 *
 * Tells clients that this resource requires OAuth and where to authenticate
 */
metadata.get('/oauth-protected-resource', (c) => {
  const issuer = c.env.OAUTH_ISSUER || 'https://api.8004.dev';

  const response: ProtectedResourceMetadata = {
    resource: issuer,
    authorization_servers: [issuer],
    scopes_supported: ['mcp:read', 'mcp:write'],
    bearer_methods_supported: ['header'],
    resource_name: '8004 Agents MCP',
    resource_documentation: 'https://docs.8004.dev/mcp',
  };

  return c.json(response, 200, {
    'Cache-Control': 'public, max-age=3600',
  });
});

/**
 * GET /.well-known/oauth-protected-resource/mcp
 * Protected Resource Metadata for /mcp path (RFC 9728)
 *
 * Some clients (like Claude Desktop) query this specific path
 */
metadata.get('/oauth-protected-resource/mcp', (c) => {
  const issuer = c.env.OAUTH_ISSUER || 'https://api.8004.dev';

  const response: ProtectedResourceMetadata = {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: ['mcp:read', 'mcp:write'],
    bearer_methods_supported: ['header'],
    resource_name: '8004 Agents MCP',
    resource_documentation: 'https://docs.8004.dev/mcp',
  };

  return c.json(response, 200, {
    'Cache-Control': 'public, max-age=3600',
  });
});

/**
 * GET /.well-known/oauth-authorization-server
 * Authorization Server Metadata (RFC 8414)
 *
 * Provides OAuth endpoints and capabilities to clients
 */
metadata.get('/oauth-authorization-server', (c) => {
  const issuer = c.env.OAUTH_ISSUER || 'https://api.8004.dev';

  const response: AuthorizationServerMetadata = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    scopes_supported: ['mcp:read', 'mcp:write'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    code_challenge_methods_supported: ['S256'],
    service_documentation: 'https://docs.8004.dev',
  };

  return c.json(response, 200, {
    'Cache-Control': 'public, max-age=3600',
  });
});

export { metadata };
