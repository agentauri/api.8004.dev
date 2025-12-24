/**
 * OAuth 2.0 Token endpoint
 * Implements RFC 6749 Section 5.1 (Token Response)
 * @module oauth/routes/token
 */

import type { Env, Variables } from '@/types';
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  getClientById,
  isGrantTypeAllowed,
  validateClientCredentials,
} from '../services/client-service';
import { validatePKCE } from '../services/pkce-service';
import {
  createAccessToken,
  createRefreshToken,
  markAuthorizationCodeUsed,
  revokeRefreshToken,
  validateAuthorizationCode,
  validateRefreshToken,
} from '../services/token-service';
import type {
  OAuthClient,
  OAuthErrorCode,
  OAuthErrorResponse,
  TokenRequest,
  TokenResponse,
} from '../types';
import { DEFAULT_OAUTH_CONFIG } from '../types';

const token = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Create OAuth error response
 */
function oauthError(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  error: OAuthErrorCode,
  description: string,
  status: 400 | 401 = 400
): Response {
  const errorResponse: OAuthErrorResponse = { error, error_description: description };
  return c.json(errorResponse, status, { 'Cache-Control': 'no-store' });
}

/**
 * Parse token request from form-urlencoded body
 */
function parseFormBody(formData: Record<string, unknown>): TokenRequest {
  return {
    grant_type: String(formData.grant_type || ''),
    code: formData.code ? String(formData.code) : undefined,
    redirect_uri: formData.redirect_uri ? String(formData.redirect_uri) : undefined,
    client_id: String(formData.client_id || ''),
    client_secret: formData.client_secret ? String(formData.client_secret) : undefined,
    code_verifier: formData.code_verifier ? String(formData.code_verifier) : undefined,
    refresh_token: formData.refresh_token ? String(formData.refresh_token) : undefined,
  };
}

/**
 * Extract and apply HTTP Basic auth credentials
 */
function applyBasicAuth(params: TokenRequest, authHeader: string | undefined): void {
  if (!authHeader?.startsWith('Basic ')) return;

  const decoded = atob(authHeader.substring(6));
  const [basicClientId, basicClientSecret] = decoded.split(':');
  if (basicClientId && !params.client_id) {
    params.client_id = basicClientId;
  }
  if (basicClientSecret && !params.client_secret) {
    params.client_secret = basicClientSecret;
  }
}

/**
 * Validate client and credentials
 */
async function validateClient(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  params: TokenRequest
): Promise<{ client: OAuthClient } | { error: Response }> {
  const client = await getClientById(c.env.DB, params.client_id);
  if (!client) {
    return { error: oauthError(c, 'invalid_client', 'Unknown client_id', 401) };
  }

  if (client.client_secret && params.client_secret) {
    const validClient = await validateClientCredentials(
      c.env.DB,
      params.client_id,
      params.client_secret
    );
    if (!validClient) {
      return { error: oauthError(c, 'invalid_client', 'Invalid client credentials', 401) };
    }
  }

  if (!isGrantTypeAllowed(client, params.grant_type)) {
    return {
      error: oauthError(
        c,
        'unauthorized_client',
        `Client is not authorized for grant_type: ${params.grant_type}`
      ),
    };
  }

  return { client };
}

/**
 * POST /oauth/token
 * Token endpoint - exchanges authorization code for access token
 */
token.post('/', async (c) => {
  let params: TokenRequest;

  const contentType = c.req.header('Content-Type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await c.req.parseBody();
    params = parseFormBody(formData as Record<string, unknown>);
  } else {
    try {
      params = await c.req.json();
    } catch {
      return oauthError(c, 'invalid_request', 'Invalid request body');
    }
  }

  applyBasicAuth(params, c.req.header('Authorization'));

  if (!params.grant_type) {
    return oauthError(c, 'invalid_request', 'grant_type is required');
  }

  if (!params.client_id) {
    return oauthError(c, 'invalid_request', 'client_id is required');
  }

  const clientResult = await validateClient(c, params);
  if ('error' in clientResult) {
    return clientResult.error;
  }

  const accessTokenTtl =
    Number(c.env.OAUTH_ACCESS_TOKEN_TTL) || DEFAULT_OAUTH_CONFIG.accessTokenTtl;
  const refreshTokenTtl =
    Number(c.env.OAUTH_REFRESH_TOKEN_TTL) || DEFAULT_OAUTH_CONFIG.refreshTokenTtl;

  switch (params.grant_type) {
    case 'authorization_code':
      return handleAuthorizationCodeGrant(c, params, accessTokenTtl, refreshTokenTtl);

    case 'refresh_token':
      return handleRefreshTokenGrant(c, params, accessTokenTtl, refreshTokenTtl);

    default:
      return oauthError(
        c,
        'unsupported_grant_type',
        `grant_type "${params.grant_type}" is not supported`
      );
  }
});

/**
 * Handle authorization_code grant type
 */
async function handleAuthorizationCodeGrant(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  params: TokenRequest,
  accessTokenTtl: number,
  refreshTokenTtl: number
): Promise<Response> {
  if (!params.code) {
    return oauthError(c, 'invalid_request', 'code is required');
  }

  if (!params.redirect_uri) {
    return oauthError(c, 'invalid_request', 'redirect_uri is required');
  }

  if (!params.code_verifier) {
    return oauthError(c, 'invalid_request', 'code_verifier is required');
  }

  const authCode = await validateAuthorizationCode(
    c.env.DB,
    params.code,
    params.client_id,
    params.redirect_uri
  );

  if (!authCode) {
    return oauthError(c, 'invalid_grant', 'Invalid, expired, or already used authorization code');
  }

  const pkceValid = await validatePKCE(
    params.code_verifier,
    authCode.code_challenge,
    authCode.code_challenge_method
  );

  if (!pkceValid) {
    return oauthError(c, 'invalid_grant', 'PKCE verification failed');
  }

  await markAuthorizationCodeUsed(c.env.DB, authCode.id);

  const accessToken = await createAccessToken(
    c.env.DB,
    params.client_id,
    authCode.scope,
    authCode.resource,
    accessTokenTtl
  );

  const refreshToken = await createRefreshToken(
    c.env.DB,
    params.client_id,
    authCode.scope,
    authCode.resource,
    refreshTokenTtl
  );

  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: accessTokenTtl,
    refresh_token: refreshToken,
    scope: authCode.scope || undefined,
  };

  return c.json(response, 200, { 'Cache-Control': 'no-store' });
}

/**
 * Handle refresh_token grant type
 */
async function handleRefreshTokenGrant(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  params: TokenRequest,
  accessTokenTtl: number,
  refreshTokenTtl: number
): Promise<Response> {
  if (!params.refresh_token) {
    return oauthError(c, 'invalid_request', 'refresh_token is required');
  }

  const refreshTokenRecord = await validateRefreshToken(
    c.env.DB,
    params.refresh_token,
    params.client_id
  );

  if (!refreshTokenRecord) {
    return oauthError(c, 'invalid_grant', 'Invalid or expired refresh token');
  }

  await revokeRefreshToken(c.env.DB, refreshTokenRecord.id);

  const accessToken = await createAccessToken(
    c.env.DB,
    params.client_id,
    refreshTokenRecord.scope,
    refreshTokenRecord.resource,
    accessTokenTtl
  );

  const newRefreshToken = await createRefreshToken(
    c.env.DB,
    params.client_id,
    refreshTokenRecord.scope,
    refreshTokenRecord.resource,
    refreshTokenTtl
  );

  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: accessTokenTtl,
    refresh_token: newRefreshToken,
    scope: refreshTokenRecord.scope || undefined,
  };

  return c.json(response, 200, { 'Cache-Control': 'no-store' });
}

export { token };
