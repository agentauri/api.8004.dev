/**
 * Test setup and utilities
 * @module test/setup
 */

import { env } from 'cloudflare:test';

// Run migrations before tests
beforeAll(async () => {
  // Create tables - single line to avoid D1 parsing issues
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS agent_classifications (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL UNIQUE, chain_id INTEGER NOT NULL, skills TEXT NOT NULL, domains TEXT NOT NULL, confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1), model_version TEXT NOT NULL, classified_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS classification_queue (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), agent_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')), attempts INTEGER DEFAULT 0, error TEXT, created_at TEXT DEFAULT (datetime('now')), processed_at TEXT)"
  );
});

// Clean up between tests
afterEach(async () => {
  await env.DB.exec('DELETE FROM agent_classifications');
  await env.DB.exec('DELETE FROM classification_queue');
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
