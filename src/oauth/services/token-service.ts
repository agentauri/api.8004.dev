/**
 * Token service for OAuth 2.0
 * Handles token generation, hashing, storage, and validation
 * @module oauth/services/token-service
 */

import type {
  OAuthAccessToken,
  OAuthAuthorizationCode,
  OAuthConfig,
  OAuthRefreshToken,
  TokenValidationResult,
} from '../types';
import { base64UrlEncode } from './pkce-service';

/**
 * Generate a cryptographically secure random token
 * Returns a 256-bit (32 byte) token as base64url string
 *
 * @returns Random token string
 */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

/**
 * Generate a shorter authorization code
 * Returns a 128-bit (16 byte) code as base64url string
 *
 * @returns Random authorization code
 */
export function generateAuthorizationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64UrlEncode(bytes);
}

/**
 * Generate a unique ID (UUID v4)
 *
 * @returns UUID string
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Hash a token for storage using SHA-256
 * Never store tokens in plaintext
 *
 * @param token - Token to hash
 * @returns SHA-256 hash as base64url string
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Create an access token in the database
 *
 * @param db - D1 database instance
 * @param clientId - Client ID
 * @param scope - Granted scopes (space-separated)
 * @param resource - Resource/audience URL
 * @param ttl - Time to live in seconds
 * @returns The plaintext access token (hash is stored in DB)
 */
export async function createAccessToken(
  db: D1Database,
  clientId: string,
  scope: string | null,
  resource: string,
  ttl: number
): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const id = generateId();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO oauth_access_tokens (id, token_hash, client_id, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, tokenHash, clientId, scope, resource, expiresAt)
    .run();

  return token;
}

/**
 * Create a refresh token in the database
 *
 * @param db - D1 database instance
 * @param clientId - Client ID
 * @param scope - Granted scopes (space-separated)
 * @param resource - Resource/audience URL
 * @param ttl - Time to live in seconds
 * @returns The plaintext refresh token (hash is stored in DB)
 */
export async function createRefreshToken(
  db: D1Database,
  clientId: string,
  scope: string | null,
  resource: string,
  ttl: number
): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const id = generateId();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO oauth_refresh_tokens (id, token_hash, client_id, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, tokenHash, clientId, scope, resource, expiresAt)
    .run();

  return token;
}

/**
 * Create an authorization code in the database
 *
 * @param db - D1 database instance
 * @param clientId - Client ID
 * @param redirectUri - Redirect URI
 * @param codeChallenge - PKCE code challenge
 * @param codeChallengeMethod - PKCE method (S256)
 * @param resource - Resource/audience URL
 * @param scope - Requested scopes
 * @param state - Client state
 * @param ttl - Time to live in seconds
 * @returns The plaintext authorization code (hash is stored in DB)
 */
export async function createAuthorizationCode(
  db: D1Database,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  codeChallengeMethod: string,
  resource: string,
  scope: string | null,
  state: string | null,
  ttl: number
): Promise<string> {
  const code = generateAuthorizationCode();
  const codeHash = await hashToken(code);
  const id = generateId();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO oauth_authorization_codes
       (id, code, client_id, redirect_uri, code_challenge, code_challenge_method, resource, scope, state, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      codeHash,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      resource,
      scope,
      state,
      expiresAt
    )
    .run();

  return code;
}

/**
 * Validate and retrieve an authorization code
 *
 * @param db - D1 database instance
 * @param code - The authorization code to validate
 * @param clientId - Expected client ID
 * @param redirectUri - Expected redirect URI
 * @returns The authorization code record or null if invalid
 */
export async function validateAuthorizationCode(
  db: D1Database,
  code: string,
  clientId: string,
  redirectUri: string
): Promise<OAuthAuthorizationCode | null> {
  const codeHash = await hashToken(code);

  const result = await db
    .prepare(
      `SELECT * FROM oauth_authorization_codes
       WHERE code = ? AND client_id = ? AND redirect_uri = ? AND used = 0`
    )
    .bind(codeHash, clientId, redirectUri)
    .first<OAuthAuthorizationCode>();

  if (!result) {
    return null;
  }

  // Check expiration
  const expiresAt = new Date(result.expires_at);
  if (expiresAt < new Date()) {
    return null;
  }

  return result;
}

/**
 * Mark an authorization code as used
 *
 * @param db - D1 database instance
 * @param id - Authorization code ID
 */
export async function markAuthorizationCodeUsed(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE oauth_authorization_codes SET used = 1 WHERE id = ?`).bind(id).run();
}

/**
 * Validate an access token
 *
 * @param db - D1 database instance
 * @param token - The access token to validate
 * @returns Validation result with token details if valid
 */
export async function validateAccessToken(
  db: D1Database,
  token: string
): Promise<TokenValidationResult> {
  const tokenHash = await hashToken(token);

  const result = await db
    .prepare(
      `SELECT * FROM oauth_access_tokens
       WHERE token_hash = ? AND revoked = 0`
    )
    .bind(tokenHash)
    .first<OAuthAccessToken>();

  if (!result) {
    return { valid: false, error: 'invalid_grant' };
  }

  // Check expiration
  const expiresAt = new Date(result.expires_at);
  if (expiresAt < new Date()) {
    return { valid: false, error: 'invalid_grant' };
  }

  return { valid: true, token: result };
}

/**
 * Validate a refresh token
 *
 * @param db - D1 database instance
 * @param token - The refresh token to validate
 * @param clientId - Expected client ID
 * @returns The refresh token record or null if invalid
 */
export async function validateRefreshToken(
  db: D1Database,
  token: string,
  clientId: string
): Promise<OAuthRefreshToken | null> {
  const tokenHash = await hashToken(token);

  const result = await db
    .prepare(
      `SELECT * FROM oauth_refresh_tokens
       WHERE token_hash = ? AND client_id = ? AND revoked = 0`
    )
    .bind(tokenHash, clientId)
    .first<OAuthRefreshToken>();

  if (!result) {
    return null;
  }

  // Check expiration
  const expiresAt = new Date(result.expires_at);
  if (expiresAt < new Date()) {
    return null;
  }

  return result;
}

/**
 * Revoke a refresh token
 *
 * @param db - D1 database instance
 * @param id - Refresh token ID
 */
export async function revokeRefreshToken(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE oauth_refresh_tokens SET revoked = 1 WHERE id = ?`).bind(id).run();
}

/**
 * Revoke all tokens for a client
 *
 * @param db - D1 database instance
 * @param clientId - Client ID
 */
export async function revokeAllClientTokens(db: D1Database, clientId: string): Promise<void> {
  await db
    .prepare(`UPDATE oauth_access_tokens SET revoked = 1 WHERE client_id = ?`)
    .bind(clientId)
    .run();

  await db
    .prepare(`UPDATE oauth_refresh_tokens SET revoked = 1 WHERE client_id = ?`)
    .bind(clientId)
    .run();
}

/**
 * Clean up expired tokens and codes (housekeeping)
 *
 * @param db - D1 database instance
 * @returns Number of records deleted
 */
export async function cleanupExpiredTokens(db: D1Database): Promise<number> {
  const now = new Date().toISOString();

  const codeResult = await db
    .prepare(`DELETE FROM oauth_authorization_codes WHERE expires_at < ?`)
    .bind(now)
    .run();

  const accessResult = await db
    .prepare(`DELETE FROM oauth_access_tokens WHERE expires_at < ?`)
    .bind(now)
    .run();

  const refreshResult = await db
    .prepare(`DELETE FROM oauth_refresh_tokens WHERE expires_at < ?`)
    .bind(now)
    .run();

  return (
    (codeResult.meta?.changes ?? 0) +
    (accessResult.meta?.changes ?? 0) +
    (refreshResult.meta?.changes ?? 0)
  );
}

/**
 * Extract bearer token from Authorization header
 *
 * @param request - Request object
 * @returns Token string or null
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] ?? null;
}

/**
 * Calculate remaining token lifetime in seconds
 *
 * @param expiresAt - Expiration timestamp
 * @returns Seconds until expiration
 */
export function getTokenExpiresIn(expiresAt: string): number {
  const expiration = new Date(expiresAt);
  const now = new Date();
  return Math.max(0, Math.floor((expiration.getTime() - now.getTime()) / 1000));
}
