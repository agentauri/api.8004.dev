/**
 * Environment bindings for Cloudflare Workers
 * @module types/env
 */

import type { ClassificationJob } from './classification';

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  CACHE: KVNamespace;
  CLASSIFICATION_QUEUE: Queue<ClassificationJob>;

  // Required secrets
  ANTHROPIC_API_KEY: string;
  GOOGLE_AI_API_KEY: string;
  SEARCH_SERVICE_URL: string;
  SEPOLIA_RPC_URL: string;
  BASE_SEPOLIA_RPC_URL: string;
  POLYGON_AMOY_RPC_URL: string;

  // Configuration (with defaults in wrangler.toml)
  ENVIRONMENT: string;
  CACHE_TTL: string;
  RATE_LIMIT_RPM: string;
  CLASSIFICATION_MODEL: string;
  FALLBACK_MODEL: string;

  // Optional API key for authenticated access
  API_KEY?: string;

  // IPFS configuration (optional, with defaults)
  /** IPFS gateway URL (default: https://ipfs.io/ipfs/) */
  IPFS_GATEWAY_URL?: string;
  /** IPFS fetch timeout in milliseconds (default: 10000) */
  IPFS_TIMEOUT_MS?: string;

  // E2E testing configuration
  /** Enable mock services for deterministic E2E testing (default: false) */
  MOCK_EXTERNAL_SERVICES?: string;

  // OAuth 2.0 configuration
  /** OAuth issuer URL (default: https://api.8004.dev) */
  OAUTH_ISSUER?: string;
  /** Access token TTL in seconds (default: 3600 / 1 hour) */
  OAUTH_ACCESS_TOKEN_TTL?: string;
  /** Refresh token TTL in seconds (default: 2592000 / 30 days) */
  OAUTH_REFRESH_TOKEN_TTL?: string;
  /** Authorization code TTL in seconds (default: 600 / 10 minutes) */
  OAUTH_AUTH_CODE_TTL?: string;
}

/**
 * Context variables stored during request lifecycle
 */
export interface Variables {
  requestId: string;
  /** Whether request is authenticated with valid API key */
  isAuthenticated?: boolean;
  /** API key tier for rate limiting */
  apiKeyTier?: 'anonymous' | 'standard' | 'premium';
}
