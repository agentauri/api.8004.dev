/**
 * Test setup and utilities
 * @module test/setup
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import type { Env } from '@/types';
import { vi } from 'vitest';

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
    "CREATE TABLE IF NOT EXISTS agent_feedback (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, chain_id INTEGER NOT NULL, score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100), tags TEXT NOT NULL DEFAULT '[]', context TEXT, feedback_uri TEXT, submitter TEXT NOT NULL, eas_uid TEXT UNIQUE, submitted_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS agent_reputation (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL UNIQUE, chain_id INTEGER NOT NULL, feedback_count INTEGER NOT NULL DEFAULT 0, average_score REAL NOT NULL DEFAULT 0 CHECK (average_score >= 0 AND average_score <= 100), low_count INTEGER NOT NULL DEFAULT 0, medium_count INTEGER NOT NULL DEFAULT 0, high_count INTEGER NOT NULL DEFAULT 0, last_calculated_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS eas_sync_state (chain_id INTEGER PRIMARY KEY, last_block INTEGER NOT NULL DEFAULT 0, last_timestamp TEXT, attestations_synced INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );
});

// Clean up between tests
afterEach(async () => {
  await env.DB.exec('DELETE FROM agent_classifications');
  await env.DB.exec('DELETE FROM classification_queue');
  await env.DB.exec('DELETE FROM agent_feedback');
  await env.DB.exec('DELETE FROM agent_reputation');
  await env.DB.exec('DELETE FROM eas_sync_state');
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
    skills: [{ slug: 'natural_language_processing/text_generation', confidence: 0.95 }],
    domains: [{ slug: 'technology/software_development', confidence: 0.9 }],
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
 * Create mock environment
 */
export function createMockEnv() {
  return {
    DB: env.DB,
    CACHE: env.CACHE,
    CLASSIFICATION_QUEUE: env.CLASSIFICATION_QUEUE,
    ANTHROPIC_API_KEY: 'sk-ant-test-key',
    SEARCH_SERVICE_URL: 'https://search.example.com',
    SEPOLIA_RPC_URL: 'https://sepolia.example.com',
    BASE_SEPOLIA_RPC_URL: 'https://base-sepolia.example.com',
    POLYGON_AMOY_RPC_URL: 'https://polygon-amoy.example.com',
    ENVIRONMENT: 'test',
    CACHE_TTL: '300',
    RATE_LIMIT_RPM: '100',
    CLASSIFICATION_MODEL: 'claude-3-haiku-20240307',
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
     (id, agent_id, chain_id, score, tags, context, feedback_uri, submitter, eas_uid, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
}

/**
 * Helper to make HTTP requests in tests - eliminates boilerplate
 */
export async function testRoute(
  path: string,
  options: TestRouteOptions = {}
): Promise<Response> {
  const init: RequestInit = { method: options.method ?? 'GET' };

  if (options.body) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json', ...options.headers };
  } else if (options.headers) {
    init.headers = options.headers;
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
