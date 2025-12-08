/**
 * Platform stats route integration tests
 * @module test/integration/routes/stats
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch for search service
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GET /api/v1/stats', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('returns platform statistics', async () => {
    const request = new Request('http://localhost/api/v1/stats');
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
  });

  it('returns correct stats structure', async () => {
    const request = new Request('http://localhost/api/v1/stats');
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
    const data = body.data;

    expect(data).toHaveProperty('totalAgents');
    expect(data).toHaveProperty('activeAgents');
    expect(data).toHaveProperty('chainBreakdown');
    expect(typeof data.totalAgents).toBe('number');
    expect(typeof data.activeAgents).toBe('number');
    expect(Array.isArray(data.chainBreakdown)).toBe(true);
  });

  it('includes chain breakdown for all supported chains', async () => {
    const request = new Request('http://localhost/api/v1/stats');
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
    const chainIds = body.data.chainBreakdown.map((c: { chainId: number }) => c.chainId);

    // Should include all supported chains
    expect(chainIds).toContain(11155111); // Ethereum Sepolia
    expect(chainIds).toContain(84532); // Base Sepolia
    expect(chainIds).toContain(80002); // Polygon Amoy
  });

  it('aggregates totals from all chains', async () => {
    const request = new Request('http://localhost/api/v1/stats');
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
    const { totalAgents, activeAgents, chainBreakdown } = body.data;

    // Totals should equal sum of chain breakdowns
    const expectedTotal = chainBreakdown.reduce(
      (sum: number, chain: { agentCount: number }) => sum + chain.agentCount,
      0
    );
    const expectedActive = chainBreakdown.reduce(
      (sum: number, chain: { activeCount: number }) => sum + chain.activeCount,
      0
    );

    expect(totalAgents).toBe(expectedTotal);
    expect(activeAgents).toBe(expectedActive);
  });

  it('includes request ID header', async () => {
    const request = new Request('http://localhost/api/v1/stats');
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

    expect(response.headers.get('X-Request-ID')).toBeDefined();
  });

  it('includes security headers', async () => {
    const request = new Request('http://localhost/api/v1/stats');
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

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('uses caching', async () => {
    // First request
    const request1 = new Request('http://localhost/api/v1/stats');
    const ctx1 = createExecutionContext();
    await app.fetch(
      request1,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx1
    );
    await waitOnExecutionContext(ctx1);

    // Second request should use cache
    const request2 = new Request('http://localhost/api/v1/stats');
    const ctx2 = createExecutionContext();
    const response2 = await app.fetch(
      request2,
      {
        ...env,
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx2
    );
    await waitOnExecutionContext(ctx2);

    expect(response2.status).toBe(200);
  });
});
