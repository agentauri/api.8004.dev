/**
 * OAuth 2.0 Token endpoint
 * Implements RFC 6749 Section 5.1 (Token Response)
 * @module oauth/routes/token
 */

import type { Env, Variables } from '@/types';
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
import type { OAuthErrorResponse, TokenRequest, TokenResponse } from '../types';
import { DEFAULT_OAUTH_CONFIG } from '../types';

const token = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST /oauth/token
 * Token endpoint
 *
 * Exchanges authorization code for access token
 * Supports grant_type: authorization_code, refresh_token
 *
 * Body parameters (application/x-www-form-urlencoded or JSON):
 * - grant_type: "authorization_code" or "refresh_token"
 * - code: The authorization code (for authorization_code grant)
 * - redirect_uri: Must match the one used in authorization request
 * - client_id: The client ID
 * - client_secret: The client secret (if confidential client)
 * - code_verifier: PKCE code verifier (for authorization_code grant)
 * - refresh_token: The refresh token (for refresh_token grant)
 */
token.post('/', async (c) => {
  let params: TokenRequest;

  // Parse body (supports both form-urlencoded and JSON)
  const contentType = c.req.header('Content-Type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await c.req.parseBody();
    params = {
      grant_type: String(formData.grant_type || ''),
      code: formData.code ? String(formData.code) : undefined,
      redirect_uri: formData.redirect_uri ? String(formData.redirect_uri) : undefined,
      client_id: String(formData.client_id || ''),
      client_secret: formData.client_secret ? String(formData.client_secret) : undefined,
      code_verifier: formData.code_verifier ? String(formData.code_verifier) : undefined,
      refresh_token: formData.refresh_token ? String(formData.refresh_token) : undefined,
    };
  } else {
    try {
      params = await c.req.json();
    } catch {
      const error: OAuthErrorResponse = {
        error: 'invalid_request',
        error_description: 'Invalid request body',
      };
      return c.json(error, 400, { 'Cache-Control': 'no-store' });
    }
  }

  // Check for HTTP Basic auth
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Basic ')) {
    const decoded = atob(authHeader.substring(6));
    const [basicClientId, basicClientSecret] = decoded.split(':');
    if (basicClientId && !params.client_id) {
      params.client_id = basicClientId;
    }
    if (basicClientSecret && !params.client_secret) {
      params.client_secret = basicClientSecret;
    }
  }

  // Validate required parameters
  if (!params.grant_type) {
    const error: OAuthErrorResponse = {
      error: 'invalid_request',
      error_description: 'grant_type is required',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  if (!params.client_id) {
    const error: OAuthErrorResponse = {
      error: 'invalid_request',
      error_description: 'client_id is required',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  // Get client
  const client = await getClientById(c.env.DB, params.client_id);
  if (!client) {
    const error: OAuthErrorResponse = {
      error: 'invalid_client',
      error_description: 'Unknown client_id',
    };
    return c.json(error, 401, { 'Cache-Control': 'no-store' });
  }

  // Validate client credentials if confidential client
  if (client.client_secret && params.client_secret) {
    const validClient = await validateClientCredentials(
      c.env.DB,
      params.client_id,
      params.client_secret
    );
    if (!validClient) {
      const error: OAuthErrorResponse = {
        error: 'invalid_client',
        error_description: 'Invalid client credentials',
      };
      return c.json(error, 401, { 'Cache-Control': 'no-store' });
    }
  }

  // Check grant type is allowed for this client
  if (!isGrantTypeAllowed(client, params.grant_type)) {
    const error: OAuthErrorResponse = {
      error: 'unauthorized_client',
      error_description: `Client is not authorized for grant_type: ${params.grant_type}`,
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  // Get TTL configuration
  const accessTokenTtl =
    Number(c.env.OAUTH_ACCESS_TOKEN_TTL) || DEFAULT_OAUTH_CONFIG.accessTokenTtl;
  const refreshTokenTtl =
    Number(c.env.OAUTH_REFRESH_TOKEN_TTL) || DEFAULT_OAUTH_CONFIG.refreshTokenTtl;

  // Handle grant types
  switch (params.grant_type) {
    case 'authorization_code':
      return handleAuthorizationCodeGrant(c, params, accessTokenTtl, refreshTokenTtl);

    case 'refresh_token':
      return handleRefreshTokenGrant(c, params, accessTokenTtl, refreshTokenTtl);

    default: {
      const error: OAuthErrorResponse = {
        error: 'unsupported_grant_type',
        error_description: `grant_type "${params.grant_type}" is not supported`,
      };
      return c.json(error, 400, { 'Cache-Control': 'no-store' });
    }
  }
});

/**
 * Handle authorization_code grant type
 */
async function handleAuthorizationCodeGrant(
  c: {
    env: Env;
    json: <T>(data: T, status?: number, headers?: Record<string, string>) => Response;
  },
  params: TokenRequest,
  accessTokenTtl: number,
  refreshTokenTtl: number
): Promise<Response> {
  // Validate required parameters
  if (!params.code) {
    const error: OAuthErrorResponse = {
      error: 'invalid_request',
      error_description: 'code is required',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  if (!params.redirect_uri) {
    const error: OAuthErrorResponse = {
      error: 'invalid_request',
      error_description: 'redirect_uri is required',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  if (!params.code_verifier) {
    const error: OAuthErrorResponse = {
      error: 'invalid_request',
      error_description: 'code_verifier is required',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  // Validate authorization code
  const authCode = await validateAuthorizationCode(
    c.env.DB,
    params.code,
    params.client_id,
    params.redirect_uri
  );

  if (!authCode) {
    const error: OAuthErrorResponse = {
      error: 'invalid_grant',
      error_description: 'Invalid, expired, or already used authorization code',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  // Validate PKCE
  const pkceValid = await validatePKCE(
    params.code_verifier,
    authCode.code_challenge,
    authCode.code_challenge_method
  );

  if (!pkceValid) {
    const error: OAuthErrorResponse = {
      error: 'invalid_grant',
      error_description: 'PKCE verification failed',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  // Mark code as used (single-use)
  await markAuthorizationCodeUsed(c.env.DB, authCode.id);

  // Create tokens
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
  c: {
    env: Env;
    json: <T>(data: T, status?: number, headers?: Record<string, string>) => Response;
  },
  params: TokenRequest,
  accessTokenTtl: number,
  refreshTokenTtl: number
): Promise<Response> {
  // Validate required parameters
  if (!params.refresh_token) {
    const error: OAuthErrorResponse = {
      error: 'invalid_request',
      error_description: 'refresh_token is required',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  // Validate refresh token
  const refreshTokenRecord = await validateRefreshToken(
    c.env.DB,
    params.refresh_token,
    params.client_id
  );

  if (!refreshTokenRecord) {
    const error: OAuthErrorResponse = {
      error: 'invalid_grant',
      error_description: 'Invalid or expired refresh token',
    };
    return c.json(error, 400, { 'Cache-Control': 'no-store' });
  }

  // Revoke old refresh token (rotation)
  await revokeRefreshToken(c.env.DB, refreshTokenRecord.id);

  // Create new tokens
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
