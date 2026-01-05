/**
 * Search route integration tests
 * @module test/integration/routes/search
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockSearchConfig } from '@/services/mock/mock-search';
import { insertMockClassification, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('POST /api/v1/search', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Reset mock search config for each test
    mockSearchConfig.searchError = null;
  });

  // Test uses the mock search service (MOCK_EXTERNAL_SERVICES='true')
  // The mock service uses fixture data with deterministic scoring
  it('performs semantic search with vector mode', async () => {
    // Search for 'Alpha AI' which matches 'Alpha AI Assistant' (11155111:1)
    // The mock search service calculates scores based on name/description matching
    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'Alpha AI' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Should return agents matching 'Alpha AI' - at least the Alpha AI Assistant
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.meta.query).toBe('Alpha AI');
    expect(body.meta.total).toBeGreaterThan(0);
    expect(body.meta.searchMode).toBe('vector');
    // The first result should be the best match
    const firstResult = body.data[0];
    expect(firstResult.name.toLowerCase()).toContain('alpha');
  });

  // Test that search results include search scores
  it('includes search scores in results', async () => {
    // Search for 'Alpha' which will match agents with 'Alpha' in name
    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'Alpha' },
    });

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    // Each result should have a searchScore between 0 and 1
    for (const agent of body.data) {
      expect(agent.searchScore).toBeDefined();
      expect(typeof agent.searchScore).toBe('number');
      expect(agent.searchScore).toBeGreaterThan(0);
      expect(agent.searchScore).toBeLessThanOrEqual(1);
    }
  });

  // Test that OASF classifications are included when stored in D1
  it('includes OASF classification when available', async () => {
    // Insert classification for agent 11155111:1 (Alpha AI Assistant)
    await insertMockClassification('11155111:1');

    // Search for this specific agent
    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'Alpha AI Assistant' },
    });

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Find the agent we inserted classification for
    const agentWithClassification = body.data.find(
      (a: { id: string }) => a.id === '11155111:1'
    );
    expect(agentWithClassification).toBeDefined();
    expect(agentWithClassification.oasf).toBeDefined();
    expect(agentWithClassification.oasf.skills).toBeDefined();
    expect(agentWithClassification.oasf.domains).toBeDefined();
  });

  it('returns 400 for missing query', async () => {
    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {},
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid JSON body', async () => {
    // For invalid JSON we need to use the raw approach
    const { createExecutionContext, env, waitOnExecutionContext } = await import('cloudflare:test');
    const app = (await import('@/index')).default;
    const { TEST_API_KEY, createMockEnv } = await import('../../setup');

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_API_KEY,
      },
      body: 'not json',
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(request, createMockEnv() as unknown as typeof env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('applies filters correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'test',
          results: [],
          total: 0,
          pagination: { hasMore: false, limit: 20 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'test',
        limit: 10,
        minScore: 0.5,
        filters: {
          chainIds: [11155111],
          active: true,
          mcp: true,
        },
      },
    });

    expect(response.status).toBe(200);

    // Verify the search service was called with filters
    const fetchCall = mockFetch.mock.calls.find((call) => call[0].includes('/search'));
    if (fetchCall) {
      const body = JSON.parse(fetchCall[1].body);
      // v1 API: limit uses multiple multipliers:
      // 1. Route: limit * 3 for boolean filters = 10 * 3 = 30
      // 2. Search service: smartLimit * 2 = 30 * 2 = 60
      expect(body.limit).toBe(60);
      expect(body.minScore).toBe(0.5);
      expect(body.filters).toBeDefined();
    }
  });

  it('respects minScore parameter', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'test',
          results: [],
          total: 0,
          pagination: { hasMore: false, limit: 20 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'test', minScore: 0.8 },
    });

    expect(response.status).toBe(200);
  });
});

describe('Search with advanced filters', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('search with skills filter', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'AI',
          results: [
            {
              rank: 1,
              vectorId: 'v1',
              agentId: '11155111:1',
              chainId: 11155111,
              name: 'AI Agent',
              description: 'An AI agent with NLP',
              score: 0.9,
              metadata: {},
            },
          ],
          total: 1,
          pagination: { hasMore: false, limit: 20 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'AI',
        filters: {
          skills: ['natural_language_processing'],
        },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('search with domains filter', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'finance',
          results: [
            {
              rank: 1,
              vectorId: 'v1',
              agentId: '11155111:2',
              chainId: 11155111,
              name: 'Finance Bot',
              description: 'A finance assistant',
              score: 0.85,
              metadata: {},
            },
          ],
          total: 1,
          pagination: { hasMore: false, limit: 20 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'finance',
        filters: {
          domains: ['finance'],
        },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('search with OR mode filters', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'assistant',
          results: [
            {
              rank: 1,
              vectorId: 'v1',
              agentId: '11155111:3',
              chainId: 11155111,
              name: 'MCP Agent',
              description: 'An MCP assistant',
              score: 0.88,
              metadata: {},
            },
          ],
          total: 1,
          pagination: { hasMore: false, limit: 20 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'assistant',
        filters: {
          mcp: true,
          a2a: true,
        },
        filterMode: 'OR',
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('search returns pagination info', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'test',
          results: [
            {
              rank: 1,
              vectorId: 'v1',
              agentId: '11155111:1',
              chainId: 11155111,
              name: 'Test Agent',
              description: 'Test',
              score: 0.9,
              metadata: {},
            },
          ],
          total: 10,
          pagination: { hasMore: true, limit: 1 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'test', limit: 1 },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.total).toBeDefined();
  });
});
