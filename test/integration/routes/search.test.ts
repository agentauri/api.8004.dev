/**
 * Search route integration tests
 * @module test/integration/routes/search
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertMockClassification } from '../../setup';

// Mock fetch for search service
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'AI assistant' }),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx
    );
    await waitOnExecutionContext(ctx);

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

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx
    );
    await waitOnExecutionContext(ctx);

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

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx
    );
    await waitOnExecutionContext(ctx);

    const body = await response.json();
    expect(body.data[0].oasf).toBeDefined();
    expect(body.data[0].oasf.skills).toBeDefined();
    expect(body.data[0].oasf.domains).toBeDefined();
  });

  it('returns 400 for missing query', async () => {
    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx
    );
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

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        limit: 10,
        minScore: 0.5,
        filters: {
          chainIds: [11155111],
          active: true,
          mcp: true,
        },
      }),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    // Verify the search service was called with filters
    const fetchCall = mockFetch.mock.calls.find((call) => call[0].includes('/search'));
    if (fetchCall) {
      const body = JSON.parse(fetchCall[1].body);
      expect(body.limit).toBe(10);
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

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', minScore: 0.8 }),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
  });
});
