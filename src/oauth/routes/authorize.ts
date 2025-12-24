/**
 * OAuth 2.0 Authorization endpoint
 * Implements RFC 6749 Section 4.1 (Authorization Code Grant)
 * @module oauth/routes/authorize
 */

import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { getClientById, isRedirectUriAllowed } from '../services/client-service';
import { isValidChallenge } from '../services/pkce-service';
import { createAuthorizationCode } from '../services/token-service';
import type { AuthorizationRequest } from '../types';
import { DEFAULT_OAUTH_CONFIG } from '../types';

const authorize = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /oauth/authorize
 * Authorization endpoint
 *
 * Starts the authorization code flow with PKCE
 * For v1, we auto-approve all requests (trusted MCP clients)
 *
 * Query parameters:
 * - response_type: Must be "code"
 * - client_id: The registered client ID
 * - redirect_uri: Where to redirect after authorization
 * - scope: Requested scopes (optional)
 * - state: Client state for CSRF protection
 * - code_challenge: PKCE code challenge (required)
 * - code_challenge_method: Must be "S256"
 * - resource: MCP server URL (optional, defaults to issuer)
 */
authorize.get('/', async (c) => {
  const query = c.req.query();

  // Parse parameters
  const params: Partial<AuthorizationRequest> = {
    response_type: query.response_type,
    client_id: query.client_id,
    redirect_uri: query.redirect_uri,
    scope: query.scope,
    state: query.state,
    code_challenge: query.code_challenge,
    code_challenge_method: query.code_challenge_method || 'S256',
    resource: query.resource,
  };

  // Validate required parameters
  // Note: For errors before we can validate redirect_uri, we show an error page
  // After redirect_uri is validated, we redirect with error
  if (!params.client_id) {
    return renderError('invalid_request', 'client_id is required');
  }

  if (!params.redirect_uri) {
    return renderError('invalid_request', 'redirect_uri is required');
  }

  // Validate client
  const client = await getClientById(c.env.DB, params.client_id);
  if (!client) {
    return renderError('invalid_request', 'Unknown client_id');
  }

  // Validate redirect_uri is registered for this client
  if (!isRedirectUriAllowed(client, params.redirect_uri)) {
    return renderError('invalid_request', 'redirect_uri not registered for this client');
  }

  // From here, we can safely redirect with errors
  const redirectUri = new URL(params.redirect_uri);

  // Validate response_type
  if (params.response_type !== 'code') {
    return redirectWithError(redirectUri, 'unsupported_response_type', params.state);
  }

  // Validate PKCE (required per MCP spec)
  if (!params.code_challenge) {
    return redirectWithError(
      redirectUri,
      'invalid_request',
      params.state,
      'code_challenge is required'
    );
  }

  if (params.code_challenge_method !== 'S256') {
    return redirectWithError(
      redirectUri,
      'invalid_request',
      params.state,
      'Only S256 code_challenge_method is supported'
    );
  }

  if (!isValidChallenge(params.code_challenge)) {
    return redirectWithError(
      redirectUri,
      'invalid_request',
      params.state,
      'Invalid code_challenge format'
    );
  }

  // Get resource (defaults to issuer)
  const issuer = c.env.OAUTH_ISSUER || DEFAULT_OAUTH_CONFIG.issuer;
  const resource = params.resource || issuer;

  // Get TTL configuration
  const authCodeTtl = Number(c.env.OAUTH_AUTH_CODE_TTL) || DEFAULT_OAUTH_CONFIG.authCodeTtl;

  try {
    // Create authorization code
    // For v1, we auto-approve (no user consent screen)
    // This is acceptable for trusted MCP clients
    const code = await createAuthorizationCode(
      c.env.DB,
      params.client_id,
      params.redirect_uri,
      params.code_challenge,
      params.code_challenge_method,
      resource,
      params.scope || null,
      params.state || null,
      authCodeTtl
    );

    // Redirect with authorization code
    redirectUri.searchParams.set('code', code);
    if (params.state) {
      redirectUri.searchParams.set('state', params.state);
    }

    return c.redirect(redirectUri.toString());
  } catch (err) {
    console.error('Authorization error:', err);
    return redirectWithError(redirectUri, 'server_error', params.state);
  }
});

/**
 * Render an error page (for errors before redirect_uri is validated)
 */
function renderError(error: string, description: string): Response {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Authorization Error</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; }
    .error { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; }
    h1 { color: #c00; margin-top: 0; }
  </style>
</head>
<body>
  <div class="error">
    <h1>Authorization Error</h1>
    <p><strong>Error:</strong> ${escapeHtml(error)}</p>
    <p><strong>Description:</strong> ${escapeHtml(description)}</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * Redirect with an OAuth error
 */
function redirectWithError(
  redirectUri: URL,
  error: string,
  state?: string,
  errorDescription?: string
): Response {
  redirectUri.searchParams.set('error', error);
  if (errorDescription) {
    redirectUri.searchParams.set('error_description', errorDescription);
  }
  if (state) {
    redirectUri.searchParams.set('state', state);
  }

  return Response.redirect(redirectUri.toString(), 302);
}

/**
 * Escape HTML entities for safe rendering
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export { authorize };
