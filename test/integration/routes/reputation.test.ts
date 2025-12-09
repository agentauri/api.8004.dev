/**
 * Reputation route integration tests
 * @module test/integration/routes/reputation
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertMockFeedback, insertMockReputation } from '../../setup';

// Mock fetch for search service
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GET /api/v1/agents/:agentId/reputation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('returns reputation and feedback when they exist', async () => {
    await insertMockReputation('11155111:1');
    await insertMockFeedback('11155111:1', { score: 80 });
    await insertMockFeedback('11155111:1', { score: 70, eas_uid: 'uid-1' });

    const request = new Request('http://localhost/api/v1/agents/11155111:1/reputation');
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
    expect(body.data.agentId).toBe('11155111:1');
    expect(body.data.reputation).toBeDefined();
    expect(body.data.reputation.count).toBe(5); // From mock reputation
    expect(body.data.reputation.averageScore).toBe(72.5);
    expect(body.data.recentFeedback).toBeDefined();
    expect(body.data.recentFeedback.length).toBe(2);
  });

  it('returns empty reputation for non-existent agent', async () => {
    const request = new Request('http://localhost/api/v1/agents/11155111:999/reputation');
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
    expect(body.data.agentId).toBe('11155111:999');
    expect(body.data.reputation.count).toBe(0);
    expect(body.data.reputation.averageScore).toBe(0);
    expect(body.data.recentFeedback).toEqual([]);
  });

  it('returns reputation without feedback when only reputation exists', async () => {
    await insertMockReputation('11155111:2');

    const request = new Request('http://localhost/api/v1/agents/11155111:2/reputation');
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
    expect(body.data.reputation.count).toBe(5);
    expect(body.data.recentFeedback).toEqual([]);
  });
});

describe('GET /api/v1/agents/:agentId/reputation/feedback', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('returns paginated feedback list', async () => {
    // Insert multiple feedback entries
    for (let i = 0; i < 5; i++) {
      await insertMockFeedback('11155111:1', {
        score: 60 + i * 10,
        eas_uid: `uid-${i}`,
        submitted_at: new Date(Date.now() - i * 1000).toISOString(),
      });
    }

    const request = new Request(
      'http://localhost/api/v1/agents/11155111:1/reputation/feedback?limit=3'
    );
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
    expect(body.data.length).toBe(3);
    expect(body.meta.limit).toBe(3);
  });

  it('returns empty array for agent without feedback', async () => {
    const request = new Request('http://localhost/api/v1/agents/11155111:999/reputation/feedback');
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
    expect(body.data).toEqual([]);
  });

  it('uses default limit when not specified', async () => {
    await insertMockFeedback('11155111:3');

    const request = new Request('http://localhost/api/v1/agents/11155111:3/reputation/feedback');
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
    expect(body.meta.limit).toBe(20);
  });

  it('caps limit at 100', async () => {
    const request = new Request(
      'http://localhost/api/v1/agents/11155111:4/reputation/feedback?limit=200'
    );
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
    expect(body.meta.limit).toBe(100);
  });

  it('enforces minimum limit of 1', async () => {
    const request = new Request(
      'http://localhost/api/v1/agents/11155111:5/reputation/feedback?limit=0'
    );
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
    expect(body.meta.limit).toBe(1);
  });
});
