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
import { mockSDKConfig } from '@/services/mock/mock-sdk';
import { mockSearchConfig } from '@/services/mock/mock-search';
import { setMockQdrantSearchServiceFactory } from '@/services/qdrant-search';
import type { Env } from '@/types';
import { mockConfig } from './mocks/agent0-sdk';

// Inject mock Qdrant search service factory for tests
setMockQdrantSearchServiceFactory(() => createMockQdrantSearchService());

// Run migrations before tests - batched for performance
beforeAll(async () => {
  // Batch all CREATE TABLE statements into a single exec call
  // This reduces ~30 sequential DB calls to 1, saving 3-5 seconds
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS agent_classifications (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL UNIQUE, chain_id INTEGER NOT NULL, skills TEXT NOT NULL, domains TEXT NOT NULL, confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1), model_version TEXT NOT NULL, classified_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS classification_queue (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')), attempts INTEGER DEFAULT 0, error TEXT, created_at TEXT DEFAULT (datetime('now')), processed_at TEXT);
    CREATE TABLE IF NOT EXISTS agent_feedback (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, chain_id INTEGER NOT NULL, score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100), tags TEXT NOT NULL DEFAULT '[]', context TEXT, feedback_uri TEXT, feedback_hash TEXT, submitter TEXT NOT NULL, eas_uid TEXT UNIQUE, tx_id TEXT, feedback_index INTEGER, endpoint TEXT, submitted_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS agent_reputation (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL UNIQUE, chain_id INTEGER NOT NULL, feedback_count INTEGER NOT NULL DEFAULT 0, average_score REAL NOT NULL DEFAULT 0 CHECK (average_score >= 0 AND average_score <= 100), low_count INTEGER NOT NULL DEFAULT 0, medium_count INTEGER NOT NULL DEFAULT 0, high_count INTEGER NOT NULL DEFAULT 0, last_calculated_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS eas_sync_state (chain_id INTEGER PRIMARY KEY, last_block INTEGER NOT NULL DEFAULT 0, last_timestamp TEXT, attestations_synced INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS qdrant_sync_state (id TEXT PRIMARY KEY DEFAULT 'global', last_sync TEXT, last_full_sync TEXT, last_error TEXT, agents_indexed INTEGER DEFAULT 0, last_graph_feedback_sync TEXT, last_feedback_created_at TEXT, feedback_synced INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS reputation_history (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, chain_id INTEGER NOT NULL, snapshot_date TEXT NOT NULL, reputation_score REAL NOT NULL DEFAULT 0, feedback_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), UNIQUE(agent_id, snapshot_date));
    CREATE TABLE IF NOT EXISTS reputation_snapshot_state (key TEXT PRIMARY KEY DEFAULT 'global', last_snapshot_date TEXT, agents_snapshotted INTEGER NOT NULL DEFAULT 0, last_error TEXT, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS agent_evaluations (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, chain_id INTEGER NOT NULL, overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100), is_reachable INTEGER DEFAULT 1, avg_latency_ms INTEGER, tests TEXT DEFAULT '[]', verified_skills TEXT DEFAULT '[]', failed_skills TEXT DEFAULT '[]', status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')), evaluated_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS evaluation_queue (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, chain_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')), priority INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, skills TEXT DEFAULT '[]', error TEXT, evaluation_id TEXT, requested_by TEXT, created_at TEXT DEFAULT (datetime('now')), started_at TEXT, completed_at TEXT);
    CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, client_id TEXT NOT NULL UNIQUE, client_secret TEXT, client_name TEXT NOT NULL, redirect_uris TEXT NOT NULL, grant_types TEXT DEFAULT '["authorization_code"]', token_endpoint_auth_method TEXT DEFAULT 'client_secret_post', registered_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS oauth_authorization_codes (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL, code_challenge_method TEXT DEFAULT 'S256', resource TEXT NOT NULL, scope TEXT, state TEXT, expires_at TEXT NOT NULL, used INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS oauth_access_tokens (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, scope TEXT, resource TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER DEFAULT 0, issued_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, scope TEXT, resource TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER DEFAULT 0, issued_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS agent_reliability (agent_id TEXT PRIMARY KEY, chain_id INTEGER NOT NULL, mcp_latency_ms INTEGER, mcp_success_count INTEGER DEFAULT 0, mcp_failure_count INTEGER DEFAULT 0, mcp_last_check_at TEXT, mcp_last_success_at TEXT, a2a_latency_ms INTEGER, a2a_success_count INTEGER DEFAULT 0, a2a_failure_count INTEGER DEFAULT 0, a2a_last_check_at TEXT, a2a_last_success_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS webhooks (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), url TEXT NOT NULL, secret TEXT NOT NULL, events TEXT NOT NULL DEFAULT '[]', filters TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1, owner TEXT NOT NULL, description TEXT, last_delivery_at TEXT, last_delivery_status TEXT, failure_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS webhook_deliveries (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), webhook_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, last_attempt_at TEXT, next_retry_at TEXT, response_status INTEGER, response_body TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('anonymous', 'standard', 'premium')), rate_limit_rpm INTEGER DEFAULT NULL, enabled INTEGER NOT NULL DEFAULT 1, owner TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT, last_used_at TEXT, usage_count INTEGER NOT NULL DEFAULT 0, permissions TEXT NOT NULL DEFAULT '["read"]', description TEXT DEFAULT NULL, daily_quota INTEGER DEFAULT NULL, monthly_quota INTEGER DEFAULT NULL, daily_usage INTEGER NOT NULL DEFAULT 0, monthly_usage INTEGER NOT NULL DEFAULT 0, daily_reset_at TEXT DEFAULT NULL, monthly_reset_at TEXT DEFAULT NULL, rotated_from TEXT DEFAULT NULL, rotated_at TEXT DEFAULT NULL, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS api_key_usage (id TEXT PRIMARY KEY, key_id TEXT NOT NULL, endpoint TEXT NOT NULL, method TEXT NOT NULL, status_code INTEGER, response_time_ms INTEGER, timestamp TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS api_key_quota_history (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), key_id TEXT NOT NULL, period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'monthly')), period_start TEXT NOT NULL, period_end TEXT NOT NULL, usage_count INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS agent_verifications (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, chain_id INTEGER NOT NULL, method TEXT NOT NULL CHECK (method IN ('dns', 'ens', 'github', 'twitter')), status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'expired')), proof_data TEXT, verified_at TEXT, expires_at TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(agent_id, method));
    CREATE TABLE IF NOT EXISTS agent_verification_badges (agent_id TEXT PRIMARY KEY, badge_level TEXT NOT NULL DEFAULT 'none' CHECK (badge_level IN ('none', 'basic', 'verified', 'official')), verified_methods TEXT NOT NULL DEFAULT '[]', verification_count INTEGER NOT NULL DEFAULT 0, last_verified_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS verification_challenges (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, method TEXT NOT NULL CHECK (method IN ('dns', 'ens', 'github', 'twitter')), challenge_code TEXT NOT NULL, expected_value TEXT, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5, created_at TEXT DEFAULT (datetime('now')), UNIQUE(agent_id, method));
    CREATE TABLE IF NOT EXISTS analytics_metrics (id TEXT PRIMARY KEY, metric_type TEXT NOT NULL CHECK (metric_type IN ('agents', 'search', 'classification', 'feedback', 'api_usage')), period TEXT NOT NULL CHECK (period IN ('hour', 'day', 'week', 'month')), period_start TEXT NOT NULL, period_end TEXT NOT NULL, chain_id INTEGER, data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(metric_type, period, period_start, chain_id));
    CREATE TABLE IF NOT EXISTS analytics_search (id TEXT PRIMARY KEY, query_hash TEXT NOT NULL, query_text TEXT, filters TEXT DEFAULT '{}', result_count INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER, chain_ids TEXT DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS analytics_filters (id TEXT PRIMARY KEY, filter_name TEXT NOT NULL, filter_value TEXT NOT NULL, usage_count INTEGER NOT NULL DEFAULT 1, period TEXT NOT NULL CHECK (period IN ('day', 'week', 'month')), period_start TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(filter_name, filter_value, period, period_start));
    CREATE TABLE IF NOT EXISTS analytics_api_usage (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, method TEXT NOT NULL, status_code INTEGER NOT NULL, latency_ms INTEGER, api_key_id TEXT, period TEXT NOT NULL CHECK (period IN ('hour', 'day')), period_start TEXT NOT NULL, request_count INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(endpoint, method, status_code, api_key_id, period, period_start));
    CREATE TABLE IF NOT EXISTS analytics_aggregation_state (key TEXT PRIMARY KEY DEFAULT 'global', last_hourly_aggregation TEXT, last_daily_aggregation TEXT, last_weekly_aggregation TEXT, last_monthly_aggregation TEXT, status TEXT DEFAULT 'idle', error TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT OR IGNORE INTO analytics_aggregation_state (key) VALUES ('global');
  `);
});

// Clean up between tests - batched for performance
afterEach(async () => {
  // Batch all DELETE statements into a single exec call
  // This reduces ~29 sequential DB calls to 1, saving 2-4 seconds per test
  await env.DB.exec(`
    DELETE FROM agent_classifications;
    DELETE FROM classification_queue;
    DELETE FROM agent_feedback;
    DELETE FROM agent_reputation;
    DELETE FROM eas_sync_state;
    DELETE FROM qdrant_sync_state;
    DELETE FROM reputation_history;
    DELETE FROM reputation_snapshot_state;
    DELETE FROM agent_evaluations;
    DELETE FROM evaluation_queue;
    DELETE FROM oauth_access_tokens;
    DELETE FROM oauth_refresh_tokens;
    DELETE FROM oauth_authorization_codes;
    DELETE FROM oauth_clients;
    DELETE FROM agent_reliability;
    DELETE FROM webhook_deliveries;
    DELETE FROM webhooks;
    DELETE FROM verification_challenges;
    DELETE FROM agent_verifications;
    DELETE FROM agent_verification_badges;
    DELETE FROM api_key_quota_history;
    DELETE FROM api_key_usage;
    DELETE FROM api_keys;
    DELETE FROM analytics_metrics;
    DELETE FROM analytics_search;
    DELETE FROM analytics_filters;
    DELETE FROM analytics_api_usage;
    DELETE FROM analytics_aggregation_state WHERE key != 'global';
    UPDATE analytics_aggregation_state SET last_hourly_aggregation = NULL, last_daily_aggregation = NULL, last_weekly_aggregation = NULL, last_monthly_aggregation = NULL, status = 'idle', error = NULL WHERE key = 'global';
  `);

  // Reset mock SDK configuration to prevent cross-test contamination
  mockConfig.searchAgentsError = null;
  mockConfig.getAgentError = null;
  mockConfig.chainErrorMap.clear();

  // Reset mock SDK service configuration (for MOCK_EXTERNAL_SERVICES=true)
  mockSDKConfig.searchError = null;
  mockSDKConfig.getAgentError = null;

  // Reset mock Qdrant configuration
  mockQdrantConfig.searchError = null;

  // Reset mock search configuration
  mockSearchConfig.searchError = null;
  mockSearchConfig.healthCheckError = null;
  mockSearchConfig.healthCheckStatus = 'ok';
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
 * Test Admin API key - used for key management tests that require admin permission
 */
export const TEST_ADMIN_API_KEY = 'test-admin-api-key-for-8004-backend';

/**
 * Insert a test admin API key into the database
 * Call this in beforeEach for tests that require admin permissions
 */
export async function createTestAdminKey() {
  const keyId = crypto.randomUUID();
  // Use the same hashing as the production code
  const encoder = new TextEncoder();
  const data = encoder.encode(TEST_ADMIN_API_KEY);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  await env.DB.prepare(
    `INSERT INTO api_keys (id, key_hash, name, tier, permissions, enabled)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(keyId, keyHash, 'Test Admin Key', 'premium', JSON.stringify(['read', 'write', 'admin']), 1)
    .run();

  return { keyId, key: TEST_ADMIN_API_KEY };
}

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

/**
 * Insert a mock reputation history snapshot into the database
 */
export async function insertMockReputationHistory(
  agentId: string,
  snapshotDate: string,
  overrides: Record<string, unknown> = {}
) {
  const [chainIdStr] = agentId.split(':');
  const history = {
    agent_id: agentId,
    chain_id: Number.parseInt(chainIdStr ?? '11155111', 10),
    snapshot_date: snapshotDate,
    reputation_score: 72.5,
    feedback_count: 5,
    ...overrides,
  };
  const id = crypto.randomUUID().replace(/-/g, '');

  await env.DB.prepare(
    `INSERT INTO reputation_history
     (id, agent_id, chain_id, snapshot_date, reputation_score, feedback_count)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      history.agent_id,
      history.chain_id,
      history.snapshot_date,
      history.reputation_score,
      history.feedback_count
    )
    .run();

  return { id, ...history };
}

/**
 * Update snapshot state for testing trending API
 */
export async function updateMockSnapshotState(lastSnapshotDate: string, agentsSnapshotted = 1) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO reputation_snapshot_state
     (key, last_snapshot_date, agents_snapshotted, updated_at)
     VALUES ('global', ?, ?, datetime('now'))`
  )
    .bind(lastSnapshotDate, agentsSnapshotted)
    .run();
}

/**
 * Insert a mock evaluation into the database
 */
export async function insertMockEvaluation(
  agentId: string,
  overrides: Record<string, unknown> = {}
) {
  const [chainIdStr] = agentId.split(':');
  const evaluation = {
    agent_id: agentId,
    chain_id: Number.parseInt(chainIdStr ?? '11155111', 10),
    overall_score: 75,
    is_reachable: 1,
    avg_latency_ms: 150,
    tests: JSON.stringify([]),
    verified_skills: JSON.stringify(['code_generation']),
    failed_skills: JSON.stringify([]),
    status: 'completed',
    evaluated_at: new Date().toISOString(),
    ...overrides,
  };
  const id = crypto.randomUUID().replace(/-/g, '');

  await env.DB.prepare(
    `INSERT INTO agent_evaluations
     (id, agent_id, chain_id, overall_score, is_reachable, avg_latency_ms, tests, verified_skills, failed_skills, status, evaluated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      evaluation.agent_id,
      evaluation.chain_id,
      evaluation.overall_score,
      evaluation.is_reachable,
      evaluation.avg_latency_ms,
      evaluation.tests,
      evaluation.verified_skills,
      evaluation.failed_skills,
      evaluation.status,
      evaluation.evaluated_at
    )
    .run();

  return { id, ...evaluation };
}

/**
 * Insert a mock evaluation queue item into the database
 */
export async function insertMockEvaluationQueueItem(
  agentId: string,
  overrides: Record<string, unknown> = {}
) {
  const [chainIdStr] = agentId.split(':');
  const queueItem = {
    agent_id: agentId,
    chain_id: Number.parseInt(chainIdStr ?? '11155111', 10),
    status: 'pending',
    priority: 0,
    attempts: 0,
    max_attempts: 3,
    skills: JSON.stringify([]),
    created_at: new Date().toISOString(),
    ...overrides,
  };
  const id = crypto.randomUUID().replace(/-/g, '');

  await env.DB.prepare(
    `INSERT INTO evaluation_queue
     (id, agent_id, chain_id, status, priority, attempts, max_attempts, skills, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      queueItem.agent_id,
      queueItem.chain_id,
      queueItem.status,
      queueItem.priority,
      queueItem.attempts,
      queueItem.max_attempts,
      queueItem.skills,
      queueItem.created_at
    )
    .run();

  return { id, ...queueItem };
}

/**
 * Insert a mock reliability record into the database
 */
export async function insertMockReliability(
  agentId: string,
  overrides: Record<string, unknown> = {}
) {
  const [chainIdStr] = agentId.split(':');
  const reliability = {
    agent_id: agentId,
    chain_id: Number.parseInt(chainIdStr ?? '11155111', 10),
    mcp_latency_ms: 100,
    mcp_success_count: 10,
    mcp_failure_count: 0,
    mcp_last_check_at: new Date().toISOString(),
    mcp_last_success_at: new Date().toISOString(),
    a2a_latency_ms: 150,
    a2a_success_count: 8,
    a2a_failure_count: 2,
    a2a_last_check_at: new Date().toISOString(),
    a2a_last_success_at: new Date().toISOString(),
    ...overrides,
  };

  await env.DB.prepare(
    `INSERT OR REPLACE INTO agent_reliability
     (agent_id, chain_id, mcp_latency_ms, mcp_success_count, mcp_failure_count, mcp_last_check_at, mcp_last_success_at, a2a_latency_ms, a2a_success_count, a2a_failure_count, a2a_last_check_at, a2a_last_success_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      reliability.agent_id,
      reliability.chain_id,
      reliability.mcp_latency_ms,
      reliability.mcp_success_count,
      reliability.mcp_failure_count,
      reliability.mcp_last_check_at,
      reliability.mcp_last_success_at,
      reliability.a2a_latency_ms,
      reliability.a2a_success_count,
      reliability.a2a_failure_count,
      reliability.a2a_last_check_at,
      reliability.a2a_last_success_at
    )
    .run();

  return reliability;
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
  /** Override the default API key (useful for admin tests) */
  apiKey?: string;
}

/**
 * Helper to make HTTP requests in tests - eliminates boilerplate
 * Automatically includes API key unless skipAuth is true
 */
export async function testRoute(path: string, options: TestRouteOptions = {}): Promise<Response> {
  const init: RequestInit = { method: options.method ?? 'GET' };

  // Build headers with API key by default (supports custom API key)
  const apiKey = options.apiKey ?? TEST_API_KEY;
  const headers: Record<string, string> = options.skipAuth
    ? { ...options.headers }
    : { 'X-API-Key': apiKey, ...options.headers };

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

/**
 * Re-export mockSearchConfig for tests that need to control search service behavior
 */
export { mockSearchConfig } from '@/services/mock/mock-search';

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
