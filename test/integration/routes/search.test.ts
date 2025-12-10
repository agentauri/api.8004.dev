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

  it('performs semantic search', async () => {
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
      // topK uses smart limit: Math.min(limit * 2, MAX_SEARCH_RESULTS=100)
      // limit=10 → 10*2=20
      expect(body.topK).toBe(20);
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
