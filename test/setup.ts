/**
 * Test setup and utilities
 * @module test/setup
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { vi } from 'vitest';
import app from '@/index';
import {
  createMockQdrantSearchService,
  mockQdrantConfig,
} from '@/services/mock/mock-qdrant-search';
import { setMockQdrantSearchServiceFactory } from '@/services/qdrant-search';
import type { Env } from '@/types';
import { mockConfig } from './mocks/agent0-sdk';

// Inject mock Qdrant search service factory for tests
setMockQdrantSearchServiceFactory(() => createMockQdrantSearchService());

// Run migrations before tests
beforeAll(async () => {
  // Create tables - single line to avoid D1 parsing issues
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS agent_classifications (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL UNIQUE, chain_id INTEGER NOT NULL, skills TEXT NOT NULL, domains TEXT NOT NULL, confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1), model_version TEXT NOT NULL, classified_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS classification_queue (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')), attempts INTEGER DEFAULT 0, error TEXT, created_at TEXT DEFAULT (datetime('now')), processed_at TEXT)"
  );

  // Reputation tables
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS agent_feedback (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, chain_id INTEGER NOT NULL, score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100), tags TEXT NOT NULL DEFAULT '[]', context TEXT, feedback_uri TEXT, submitter TEXT NOT NULL, eas_uid TEXT UNIQUE, tx_id TEXT, submitted_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS agent_reputation (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL UNIQUE, chain_id INTEGER NOT NULL, feedback_count INTEGER NOT NULL DEFAULT 0, average_score REAL NOT NULL DEFAULT 0 CHECK (average_score >= 0 AND average_score <= 100), low_count INTEGER NOT NULL DEFAULT 0, medium_count INTEGER NOT NULL DEFAULT 0, high_count INTEGER NOT NULL DEFAULT 0, last_calculated_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS eas_sync_state (chain_id INTEGER PRIMARY KEY, last_block INTEGER NOT NULL DEFAULT 0, last_timestamp TEXT, attestations_synced INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );

  // Qdrant sync state table
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS qdrant_sync_state (id TEXT PRIMARY KEY DEFAULT 'global', last_sync TEXT, last_full_sync TEXT, last_error TEXT, agents_indexed INTEGER DEFAULT 0, last_graph_feedback_sync TEXT, last_feedback_created_at TEXT, feedback_synced INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );

  // OAuth tables (matching migrations/0006_oauth.sql)
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, client_id TEXT NOT NULL UNIQUE, client_secret TEXT, client_name TEXT NOT NULL, redirect_uris TEXT NOT NULL, grant_types TEXT DEFAULT '[\"authorization_code\"]', token_endpoint_auth_method TEXT DEFAULT 'client_secret_post', registered_at TEXT DEFAULT (datetime('now')))"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS oauth_authorization_codes (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL, code_challenge_method TEXT DEFAULT 'S256', resource TEXT NOT NULL, scope TEXT, state TEXT, expires_at TEXT NOT NULL, used INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE)"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS oauth_access_tokens (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, scope TEXT, resource TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER DEFAULT 0, issued_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE)"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, scope TEXT, resource TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER DEFAULT 0, issued_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE)"
  );
});

// Clean up between tests
afterEach(async () => {
  // Clean up database
  await env.DB.exec('DELETE FROM agent_classifications');
  await env.DB.exec('DELETE FROM classification_queue');
  await env.DB.exec('DELETE FROM agent_feedback');
  await env.DB.exec('DELETE FROM agent_reputation');
  await env.DB.exec('DELETE FROM eas_sync_state');
  await env.DB.exec('DELETE FROM qdrant_sync_state');
  await env.DB.exec('DELETE FROM oauth_access_tokens');
  await env.DB.exec('DELETE FROM oauth_refresh_tokens');
  await env.DB.exec('DELETE FROM oauth_authorization_codes');
  await env.DB.exec('DELETE FROM oauth_clients');

  // Reset mock SDK configuration to prevent cross-test contamination
  mockConfig.searchAgentsError = null;
  mockConfig.getAgentError = null;
  mockConfig.chainErrorMap.clear();

  // Reset mock Qdrant configuration
  mockQdrantConfig.searchError = null;
});

/**
 * Create a mock agent for testing
 */
export function createMockAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: '11155111:1',
    chainId: 11155111,
    tokenId: '1',
    name: 'Test Agent',
    description: 'A test agent for unit testing',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    ...overrides,
  };
}

/**
 * Create a mock classification for testing
 */
export function createMockClassification(overrides: Record<string, unknown> = {}) {
  return {
    skills: [{ slug: 'natural_language_processing', confidence: 0.95 }],
    domains: [{ slug: 'technology', confidence: 0.9 }],
    confidence: 0.92,
    classifiedAt: new Date().toISOString(),
    modelVersion: 'claude-3-haiku-20240307',
    ...overrides,
  };
}

/**
 * Create a mock classification row for testing
 */
export function createMockClassificationRow(
  agentId: string,
  overrides: Record<string, unknown> = {}
) {
  const classification = createMockClassification();
  return {
    id: crypto.randomUUID().replace(/-/g, ''),
    agent_id: agentId,
    chain_id: 11155111,
    skills: JSON.stringify(classification.skills),
    domains: JSON.stringify(classification.domains),
    confidence: classification.confidence,
    model_version: classification.modelVersion,
    classified_at: classification.classifiedAt,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Insert a mock classification into the database
 */
export async function insertMockClassification(
  agentId: string,
  overrides: Record<string, unknown> = {}
) {
  const row = createMockClassificationRow(agentId, overrides);
  await env.DB.prepare(
    `INSERT INTO agent_classifications
     (id, agent_id, chain_id, skills, domains, confidence, model_version, classified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.agent_id,
      row.chain_id,
      row.skills,
      row.domains,
      row.confidence,
      row.model_version,
      row.classified_at
    )
    .run();
  return row;
}

/**
 * Test API key - used for authentication in tests
 */
export const TEST_API_KEY = 'test-api-key-for-8004-backend';

/**
 * Create mock environment
 */
export function createMockEnv() {
  return {
    DB: env.DB,
    CACHE: env.CACHE,
    CLASSIFICATION_QUEUE: env.CLASSIFICATION_QUEUE,
    ANTHROPIC_API_KEY: 'sk-ant-test-key',
    GOOGLE_AI_API_KEY: 'test-google-api-key',
    SEARCH_SERVICE_URL: 'https://search.example.com',
    // RPC URLs for all supported chains
    SEPOLIA_RPC_URL: 'https://sepolia.example.com',
    BASE_SEPOLIA_RPC_URL: 'https://base-sepolia.example.com',
    POLYGON_AMOY_RPC_URL: 'https://polygon-amoy.example.com',
    LINEA_SEPOLIA_RPC_URL: 'https://linea-sepolia.example.com',
    HEDERA_TESTNET_RPC_URL: 'https://hedera-testnet.example.com',
    HYPEREVM_TESTNET_RPC_URL: 'https://hyperevm-testnet.example.com',
    SKALE_BASE_SEPOLIA_RPC_URL: 'https://skale-base-sepolia.example.com',
    // Qdrant configuration
    QDRANT_URL: 'https://qdrant.example.com',
    QDRANT_API_KEY: 'test-qdrant-api-key',
    QDRANT_COLLECTION: 'test-agents',
    // Venice AI configuration
    VENICE_API_KEY: 'test-venice-api-key',
    EMBEDDING_MODEL: 'text-embedding-bge-m3',
    ENVIRONMENT: 'test',
    CACHE_TTL: '300',
    RATE_LIMIT_RPM: '100',
    CLASSIFICATION_MODEL: 'claude-3-haiku-20240307',
    FALLBACK_MODEL: 'claude-3-haiku-20240307',
    API_KEY: TEST_API_KEY,
    // Enable mock services for tests
    MOCK_EXTERNAL_SERVICES: 'true',
  };
}

/**
 * Create a mock feedback for testing
 */
export function createMockFeedback(agentId: string, overrides: Record<string, unknown> = {}) {
  return {
    agent_id: agentId,
    chain_id: 11155111,
    score: 75,
    tags: JSON.stringify(['reliable', 'fast']),
    context: 'Great agent!',
    feedback_uri: 'https://eas.example.com/attestation/0x123',
    submitter: '0x1234567890123456789012345678901234567890',
    eas_uid: null as string | null,
    tx_id: null as string | null,
    submitted_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Insert a mock feedback into the database
 */
export async function insertMockFeedback(agentId: string, overrides: Record<string, unknown> = {}) {
  const feedback = createMockFeedback(agentId, overrides);
  const id = crypto.randomUUID().replace(/-/g, '');

  await env.DB.prepare(
    `INSERT INTO agent_feedback
     (id, agent_id, chain_id, score, tags, context, feedback_uri, submitter, eas_uid, tx_id, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      feedback.agent_id,
      feedback.chain_id,
      feedback.score,
      feedback.tags,
      feedback.context,
      feedback.feedback_uri,
      feedback.submitter,
      feedback.eas_uid,
      feedback.tx_id,
      feedback.submitted_at
    )
    .run();

  return { id, ...feedback };
}

/**
 * Insert a mock reputation into the database
 */
export async function insertMockReputation(
  agentId: string,
  overrides: Record<string, unknown> = {}
) {
  const reputation = {
    agent_id: agentId,
    chain_id: 11155111,
    feedback_count: 5,
    average_score: 72.5,
    low_count: 1,
    medium_count: 2,
    high_count: 2,
    last_calculated_at: new Date().toISOString(),
    ...overrides,
  };
  const id = crypto.randomUUID().replace(/-/g, '');

  await env.DB.prepare(
    `INSERT INTO agent_reputation
     (id, agent_id, chain_id, feedback_count, average_score, low_count, medium_count, high_count, last_calculated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      reputation.agent_id,
      reputation.chain_id,
      reputation.feedback_count,
      reputation.average_score,
      reputation.low_count,
      reputation.medium_count,
      reputation.high_count,
      reputation.last_calculated_at
    )
    .run();

  return { id, ...reputation };
}

// ============================================
// HTTP Test Helpers
// ============================================

/**
 * Options for testRoute helper
 */
export interface TestRouteOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Set to true to skip sending API key (for testing 401 responses) */
  skipAuth?: boolean;
}

/**
 * Helper to make HTTP requests in tests - eliminates boilerplate
 * Automatically includes API key unless skipAuth is true
 */
export async function testRoute(path: string, options: TestRouteOptions = {}): Promise<Response> {
  const init: RequestInit = { method: options.method ?? 'GET' };

  // Build headers with API key by default
  const headers: Record<string, string> = options.skipAuth
    ? { ...options.headers }
    : { 'X-API-Key': TEST_API_KEY, ...options.headers };

  if (options.body) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json', ...headers };
  } else if (Object.keys(headers).length > 0) {
    init.headers = headers;
  }

  const request = new Request(`http://localhost${path}`, init);
  const ctx = createExecutionContext();
  const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

// ============================================
// Mock Response Builders
// ============================================

/**
 * Create a mock search service response
 */
export function mockSearchResponse(query: string, count = 2) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        query,
        results: Array.from({ length: count }, (_, i) => ({
          rank: i + 1,
          vectorId: `v${i + 1}`,
          agentId: `11155111:${i + 1}`,
          chainId: 11155111,
          name: `Agent ${i + 1}`,
          description: `Test agent ${i + 1}`,
          score: 0.9 - i * 0.05,
          metadata: {},
        })),
        total: count,
        pagination: { hasMore: false, limit: 20 },
        requestId: 'test-id',
        timestamp: new Date().toISOString(),
      }),
  };
}

/**
 * Create a mock healthy service response
 */
export function mockHealthyResponse() {
  return {
    ok: true,
    json: () => Promise.resolve({ status: 'ok' }),
  };
}

/**
 * Create a mock EAS GraphQL response
 */
export function mockEASResponse(attestations: unknown[] = []) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: { attestations },
      }),
  };
}

/**
 * Setup mock fetch for all tests - call in beforeEach
 */
export function setupMockFetch() {
  const mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockResolvedValue(mockHealthyResponse());
  return mockFetch;
}

// ============================================
// OAuth Test Helpers
// ============================================

/**
 * Test OAuth token - use this for MCP tests that require authentication
 */
export const TEST_OAUTH_TOKEN = 'test-mcp-oauth-token-12345';

/**
 * Base64url encode bytes (same as production OAuth implementation)
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Hash a token using SHA-256 with base64url encoding (same as production)
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Create a mock OAuth client and access token for MCP testing
 */
export async function createMockOAuthToken() {
  const clientId = 'test-client-id';
  const tokenHash = await hashToken(TEST_OAUTH_TOKEN);
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now

  // Insert client
  await env.DB.prepare(
    `INSERT INTO oauth_clients (id, client_id, client_name, redirect_uris, grant_types, token_endpoint_auth_method)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      clientId,
      'Test Client',
      JSON.stringify(['http://localhost:3000/callback']),
      JSON.stringify(['authorization_code']),
      'client_secret_post'
    )
    .run();

  // Insert access token (matching oauth_access_tokens schema)
  await env.DB.prepare(
    `INSERT INTO oauth_access_tokens (id, token_hash, client_id, scope, resource, expires_at, revoked)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      tokenHash,
      clientId,
      'mcp:read mcp:write',
      'https://api.8004.dev/mcp',
      expiresAt,
      0
    )
    .run();

  return TEST_OAUTH_TOKEN;
}
