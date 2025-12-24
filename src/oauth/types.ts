/**
 * OAuth 2.0 types for MCP server authentication
 * Implements RFC 6749, RFC 7636 (PKCE), RFC 7591 (DCR), RFC 8414 (AS Metadata)
 * @module oauth/types
 */

/**
 * OAuth client stored in database
 */
export interface OAuthClient {
  id: string;
  client_id: string;
  client_secret: string | null;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
  registered_at: string;
}

/**
 * OAuth client as stored in D1 (JSON fields as strings)
 */
export interface OAuthClientRow {
  id: string;
  client_id: string;
  client_secret: string | null;
  client_name: string;
  redirect_uris: string;
  grant_types: string;
  token_endpoint_auth_method: string;
  registered_at: string;
}

/**
 * Authorization code stored in database
 */
export interface OAuthAuthorizationCode {
  id: string;
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string;
  scope: string | null;
  state: string | null;
  expires_at: string;
  used: number;
  created_at: string;
}

/**
 * Access token stored in database
 */
export interface OAuthAccessToken {
  id: string;
  token_hash: string;
  client_id: string;
  scope: string | null;
  resource: string;
  expires_at: string;
  revoked: number;
  issued_at: string;
}

/**
 * Refresh token stored in database
 */
export interface OAuthRefreshToken {
  id: string;
  token_hash: string;
  client_id: string;
  scope: string | null;
  resource: string;
  expires_at: string;
  revoked: number;
  issued_at: string;
}

/**
 * Dynamic Client Registration request (RFC 7591)
 */
export interface ClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
}

/**
 * Dynamic Client Registration response
 */
export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
}

/**
 * Authorization request parameters
 */
export interface AuthorizationRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
  resource?: string;
}

/**
 * Token request parameters (authorization_code grant)
 */
export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
}

/**
 * Token response
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * OAuth error response
 */
export interface OAuthErrorResponse {
  error: OAuthErrorCode;
  error_description?: string;
  error_uri?: string;
}

/**
 * OAuth error codes (RFC 6749)
 */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'unsupported_response_type'
  | 'server_error'
  | 'temporarily_unavailable';

/**
 * Protected Resource Metadata (RFC 9728)
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_name?: string;
  resource_documentation?: string;
}

/**
 * Authorization Server Metadata (RFC 8414)
 */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  response_modes_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
  service_documentation?: string;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  token?: OAuthAccessToken;
  error?: OAuthErrorCode;
}

/**
 * OAuth configuration
 */
export interface OAuthConfig {
  issuer: string;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  authCodeTtl: number;
}

/**
 * Default OAuth configuration
 */
export const DEFAULT_OAUTH_CONFIG: OAuthConfig = {
  issuer: 'https://api.8004.dev',
  accessTokenTtl: 3600, // 1 hour
  refreshTokenTtl: 2592000, // 30 days
  authCodeTtl: 600, // 10 minutes
};

/**
 * Supported scopes for MCP
 */
export const MCP_SCOPES = ['mcp:read', 'mcp:write'] as const;
export type MCPScope = (typeof MCP_SCOPES)[number];
