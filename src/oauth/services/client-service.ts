/**
 * Client service for OAuth 2.0 Dynamic Client Registration
 * Implements RFC 7591
 * @module oauth/services/client-service
 */

import type {
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  OAuthClient,
  OAuthClientRow,
} from '../types';
import { generateId, generateToken, hashToken } from './token-service';

/**
 * Validate redirect URI format
 * Must be HTTPS except for localhost (for development)
 *
 * @param uri - Redirect URI to validate
 * @returns True if valid
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);

    // Allow http for localhost (development)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }

    // Must be HTTPS for production
    if (url.protocol !== 'https:') {
      return false;
    }

    // No fragments allowed
    if (url.hash) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate client registration request
 *
 * @param request - Registration request
 * @returns Error message or null if valid
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: OAuth client validation requires checking multiple fields
export function validateRegistrationRequest(request: ClientRegistrationRequest): string | null {
  if (!request.client_name || typeof request.client_name !== 'string') {
    return 'client_name is required';
  }

  if (request.client_name.length > 256) {
    return 'client_name must be 256 characters or less';
  }

  if (!Array.isArray(request.redirect_uris) || request.redirect_uris.length === 0) {
    return 'redirect_uris must be a non-empty array';
  }

  for (const uri of request.redirect_uris) {
    if (!isValidRedirectUri(uri)) {
      return `Invalid redirect_uri: ${uri}. Must be HTTPS (or localhost for development)`;
    }
  }

  if (request.grant_types) {
    if (!Array.isArray(request.grant_types)) {
      return 'grant_types must be an array';
    }

    const allowedGrants = ['authorization_code', 'refresh_token'];
    for (const grant of request.grant_types) {
      if (!allowedGrants.includes(grant)) {
        return `Unsupported grant_type: ${grant}`;
      }
    }
  }

  if (request.token_endpoint_auth_method) {
    const allowedMethods = ['client_secret_post', 'client_secret_basic', 'none'];
    if (!allowedMethods.includes(request.token_endpoint_auth_method)) {
      return `Unsupported token_endpoint_auth_method: ${request.token_endpoint_auth_method}`;
    }
  }

  return null;
}

/**
 * Register a new OAuth client
 *
 * @param db - D1 database instance
 * @param request - Client registration request
 * @returns Registration response with client credentials
 */
export async function registerClient(
  db: D1Database,
  request: ClientRegistrationRequest
): Promise<ClientRegistrationResponse> {
  const id = generateId();
  const clientId = generateId(); // Use UUID as client_id
  const clientSecret = generateToken();
  const clientSecretHash = await hashToken(clientSecret);

  const grantTypes = request.grant_types || ['authorization_code'];
  const authMethod = request.token_endpoint_auth_method || 'client_secret_post';

  await db
    .prepare(
      `INSERT INTO oauth_clients
       (id, client_id, client_secret, client_name, redirect_uris, grant_types, token_endpoint_auth_method)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      clientId,
      clientSecretHash,
      request.client_name,
      JSON.stringify(request.redirect_uris),
      JSON.stringify(grantTypes),
      authMethod
    )
    .run();

  return {
    client_id: clientId,
    client_secret: clientSecret, // Return plaintext, stored as hash
    client_name: request.client_name,
    redirect_uris: request.redirect_uris,
    grant_types: grantTypes,
    token_endpoint_auth_method: authMethod,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Get a client by client_id
 *
 * @param db - D1 database instance
 * @param clientId - Client ID
 * @returns Client record or null
 */
export async function getClientById(db: D1Database, clientId: string): Promise<OAuthClient | null> {
  const row = await db
    .prepare('SELECT * FROM oauth_clients WHERE client_id = ?')
    .bind(clientId)
    .first<OAuthClientRow>();

  if (!row) {
    return null;
  }

  return parseClientRow(row);
}

/**
 * Validate client credentials
 *
 * @param db - D1 database instance
 * @param clientId - Client ID
 * @param clientSecret - Client secret (plaintext)
 * @returns Client record if valid, null otherwise
 */
export async function validateClientCredentials(
  db: D1Database,
  clientId: string,
  clientSecret: string
): Promise<OAuthClient | null> {
  const client = await getClientById(db, clientId);
  if (!client) {
    return null;
  }

  // Public client (no secret)
  if (!client.client_secret) {
    return client;
  }

  // Validate secret
  const secretHash = await hashToken(clientSecret);
  if (secretHash !== client.client_secret) {
    return null;
  }

  return client;
}

/**
 * Validate client_id only (for public clients or authorization endpoint)
 *
 * @param db - D1 database instance
 * @param clientId - Client ID
 * @returns True if client exists
 */
export async function clientExists(db: D1Database, clientId: string): Promise<boolean> {
  const result = await db
    .prepare('SELECT 1 FROM oauth_clients WHERE client_id = ?')
    .bind(clientId)
    .first();

  return result !== null;
}

/**
 * Check if a redirect URI is valid for a client
 *
 * @param client - OAuth client
 * @param redirectUri - Redirect URI to check
 * @returns True if URI is allowed
 */
export function isRedirectUriAllowed(client: OAuthClient, redirectUri: string): boolean {
  return client.redirect_uris.includes(redirectUri);
}

/**
 * Check if a grant type is allowed for a client
 *
 * @param client - OAuth client
 * @param grantType - Grant type to check
 * @returns True if grant is allowed
 */
export function isGrantTypeAllowed(client: OAuthClient, grantType: string): boolean {
  return client.grant_types.includes(grantType);
}

/**
 * Delete a client and all associated tokens
 *
 * @param db - D1 database instance
 * @param clientId - Client ID
 */
export async function deleteClient(db: D1Database, clientId: string): Promise<void> {
  // Tokens are deleted via CASCADE
  await db.prepare('DELETE FROM oauth_clients WHERE client_id = ?').bind(clientId).run();
}

/**
 * Parse client row from database
 */
function parseClientRow(row: OAuthClientRow): OAuthClient {
  return {
    id: row.id,
    client_id: row.client_id,
    client_secret: row.client_secret,
    client_name: row.client_name,
    redirect_uris: JSON.parse(row.redirect_uris),
    grant_types: JSON.parse(row.grant_types),
    token_endpoint_auth_method: row.token_endpoint_auth_method,
    registered_at: row.registered_at,
  };
}
