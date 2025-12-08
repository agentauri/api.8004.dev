/**
 * Agents route integration tests
 * @module test/integration/routes/agents
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertMockClassification } from '../../setup';

// Mock fetch for search service
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GET /api/v1/agents', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default mock for search service health check
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('returns list of agents', async () => {
    const request = new Request('http://localhost/api/v1/agents');
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
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.total).toBeDefined();
  });

  it('filters by chainId', async () => {
    const request = new Request('http://localhost/api/v1/agents?chainId=11155111');
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
    // All agents should be from the specified chain
    for (const agent of body.data) {
      expect(agent.chainId).toBe(11155111);
    }
  });

  it('respects limit parameter', async () => {
    const request = new Request('http://localhost/api/v1/agents?limit=1');
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
    expect(body.data.length).toBeLessThanOrEqual(1);
  });

  it('returns validation error for invalid limit', async () => {
    const request = new Request('http://localhost/api/v1/agents?limit=invalid');
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

  it('includes OASF classification when available', async () => {
    // Insert a classification
    await insertMockClassification('11155111:1');

    const request = new Request('http://localhost/api/v1/agents');
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
    const agent = body.data.find((a: { id: string }) => a.id === '11155111:1');
    if (agent) {
      expect(agent.oasf).toBeDefined();
      expect(agent.oasf.skills).toBeDefined();
      expect(agent.oasf.domains).toBeDefined();
    }
  });

  it('performs semantic search when query provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'test agent',
          results: [
            {
              rank: 1,
              vectorId: 'v1',
              agentId: '11155111:1',
              chainId: 11155111,
              name: 'Test Agent',
              description: 'A test agent',
              score: 0.95,
              metadata: {},
            },
          ],
          total: 1,
          pagination: { hasMore: false, limit: 20 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const request = new Request('http://localhost/api/v1/agents?q=test%20agent');
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
    expect(body.data[0].searchScore).toBeDefined();
  });
});

describe('GET /api/v1/agents/:agentId', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('returns agent details for valid ID', async () => {
    const request = new Request('http://localhost/api/v1/agents/11155111:1');
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
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe('11155111:1');
    expect(body.data.chainId).toBe(11155111);
    expect(body.data.tokenId).toBe('1');
  });

  it('returns 400 for invalid agent ID format', async () => {
    const request = new Request('http://localhost/api/v1/agents/invalid-id');
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

  it('returns 404 for non-existent agent', async () => {
    const request = new Request('http://localhost/api/v1/agents/999999:999');
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

    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('includes full agent details', async () => {
    const request = new Request('http://localhost/api/v1/agents/11155111:1');
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
    expect(body.data.endpoints).toBeDefined();
    expect(body.data.registration).toBeDefined();
    expect(body.data.mcpTools).toBeDefined();
  });

  it('includes OASF classification when available', async () => {
    await insertMockClassification('11155111:1');

    const request = new Request('http://localhost/api/v1/agents/11155111:1');
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
    expect(body.data.oasf).toBeDefined();
    expect(body.data.oasf.skills).toBeDefined();
    expect(body.data.oasf.domains).toBeDefined();
    expect(body.data.oasf.confidence).toBeDefined();
  });
});
