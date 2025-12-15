/**
 * Search route integration tests
 * @module test/integration/routes/search
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { insertMockClassification, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('POST /api/v1/search', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('performs semantic search with vector mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'AI assistant',
          results: [
            {
              rank: 1,
              vectorId: 'v1',
              agentId: '11155111:1',
              chainId: 11155111,
              name: 'AI Helper',
              description: 'An AI assistant',
              score: 0.95,
              metadata: {},
            },
            {
              rank: 2,
              vectorId: 'v2',
              agentId: '84532:1',
              chainId: 84532,
              name: 'Smart Bot',
              description: 'A smart assistant',
              score: 0.85,
              metadata: {},
            },
          ],
          total: 2,
          pagination: { hasMore: false, limit: 20 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'AI assistant' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.meta.query).toBe('AI assistant');
    expect(body.meta.total).toBe(2);
    expect(body.meta.searchMode).toBe('vector');
  });

  it('includes search scores in results', async () => {
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
              description: 'A test agent',
              score: 0.92,
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
      body: { query: 'test' },
    });

    const body = await response.json();
    expect(body.data[0].searchScore).toBe(0.92);
  });

  it('includes OASF classification when available', async () => {
    await insertMockClassification('11155111:1');

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
              description: 'A test agent',
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
      body: { query: 'test' },
    });

    const body = await response.json();
    expect(body.data[0].oasf).toBeDefined();
    expect(body.data[0].oasf.skills).toBeDefined();
    expect(body.data[0].oasf.domains).toBeDefined();
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
      // topK uses smart limit: Math.min(limit * OVER_FETCH_MULTIPLIER, MAX_SEARCH_RESULTS=100)
      // limit=10 with 6x multiplier → 60
      expect(body.topK).toBe(60);
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

describe('Search fallback to SDK', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('falls back to SDK search when vector search fails', async () => {
    // First call (vector search) fails, SDK search succeeds via mock
    mockFetch.mockRejectedValueOnce(new Error('Vector search service unavailable'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'Test Agent' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
  });

  it('returns results with basic scores in fallback mode', async () => {
    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'Test' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
    // Results should have searchScore from basic scoring algorithm
    if (body.data.length > 0) {
      expect(body.data[0].searchScore).toBeDefined();
      expect(body.data[0].searchScore).toBeGreaterThan(0);
      expect(body.data[0].searchScore).toBeLessThanOrEqual(1);
    }
  });

  it('returns match reasons in fallback mode', async () => {
    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'Test' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Results should have matchReasons
    if (body.data.length > 0) {
      expect(body.data[0].matchReasons).toBeDefined();
      expect(Array.isArray(body.data[0].matchReasons)).toBe(true);
    }
  });

  it('applies boolean filters in fallback mode', async () => {
    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'Agent',
        filters: {
          mcp: true,
        },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
  });

  it('applies OR mode filters in fallback mode', async () => {
    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'Agent',
        filters: {
          mcp: true,
          a2a: true,
          filterMode: 'OR',
        },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
  });

  it('includes OASF classifications in fallback mode', async () => {
    await insertMockClassification('11155111:1');

    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'Test Agent' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
    // Find the agent with classification
    const agentWithClassification = body.data.find((a: { id: string }) => a.id === '11155111:1');
    if (agentWithClassification) {
      expect(agentWithClassification.oasf).toBeDefined();
    }
  });

  it('returns 500 when both vector search and SDK fallback fail', async () => {
    const { mockConfig } = await import('../../mocks/agent0-sdk');

    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));
    // SDK search also fails
    mockConfig.searchAgentsError = new Error('SDK also failed');

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'test' },
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');

    // Clean up
    mockConfig.searchAgentsError = null;
  });

  it('returns byChain breakdown in fallback mode', async () => {
    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: { query: 'Agent' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
    expect(body.meta.byChain).toBeDefined();
  });

  it('applies mcp=true filter correctly in fallback mode', async () => {
    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'Agent',
        filters: { mcp: true },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
    // All returned agents should have hasMcp=true
    if (body.data.length > 0) {
      for (const agent of body.data) {
        expect(agent.hasMcp).toBe(true);
      }
    }
  });

  it('applies mcp=false filter correctly in fallback mode', async () => {
    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'Agent',
        filters: { mcp: false },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
    // All returned agents should have hasMcp=false
    if (body.data.length > 0) {
      for (const agent of body.data) {
        expect(agent.hasMcp).toBe(false);
      }
    }
  });

  it('applies a2a=false filter correctly in fallback mode', async () => {
    // Vector search fails
    mockFetch.mockRejectedValueOnce(new Error('Search service error'));

    const response = await testRoute('/api/v1/search', {
      method: 'POST',
      body: {
        query: 'Agent',
        filters: { a2a: false },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.searchMode).toBe('fallback');
    // All returned agents should have hasA2a=false
    if (body.data.length > 0) {
      for (const agent of body.data) {
        expect(agent.hasA2a).toBe(false);
      }
    }
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
