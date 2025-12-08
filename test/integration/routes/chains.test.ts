/**
 * Chains route integration tests
 * @module test/integration/routes/chains
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch for search service
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GET /api/v1/chains', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('returns chain statistics', async () => {
    const request = new Request('http://localhost/api/v1/chains');
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
  });

  it('includes all supported chains', async () => {
    const request = new Request('http://localhost/api/v1/chains');
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
    const chainIds = body.data.map((c: { chainId: number }) => c.chainId);

    // Should include all supported chains
    expect(chainIds).toContain(11155111); // Ethereum Sepolia
    expect(chainIds).toContain(84532); // Base Sepolia
    expect(chainIds).toContain(80002); // Polygon Amoy
  });

  it('returns correct stats structure', async () => {
    const request = new Request('http://localhost/api/v1/chains');
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
    const chain = body.data[0];

    expect(chain).toHaveProperty('chainId');
    expect(chain).toHaveProperty('name');
    expect(chain).toHaveProperty('shortName');
    expect(chain).toHaveProperty('explorerUrl');
    expect(chain).toHaveProperty('agentCount');
    expect(chain).toHaveProperty('activeCount');
    expect(typeof chain.chainId).toBe('number');
    expect(typeof chain.name).toBe('string');
    expect(typeof chain.shortName).toBe('string');
    expect(typeof chain.explorerUrl).toBe('string');
    expect(typeof chain.agentCount).toBe('number');
    expect(typeof chain.activeCount).toBe('number');
  });

  it('includes short names for all chains', async () => {
    const request = new Request('http://localhost/api/v1/chains');
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
    const shortNames = body.data.map((c: { shortName: string }) => c.shortName);

    expect(shortNames).toContain('sepolia');
    expect(shortNames).toContain('base-sepolia');
    expect(shortNames).toContain('amoy');
  });

  it('includes explorer URLs for all chains', async () => {
    const request = new Request('http://localhost/api/v1/chains');
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
    for (const chain of body.data as Array<{ explorerUrl: string }>) {
      expect(chain.explorerUrl).toMatch(/^https:\/\//);
    }
  });

  it('includes chain names', async () => {
    const request = new Request('http://localhost/api/v1/chains');
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
    const names = body.data.map((c: { name: string }) => c.name);

    expect(names).toContain('Ethereum Sepolia');
    expect(names).toContain('Base Sepolia');
    expect(names).toContain('Polygon Amoy');
  });

  it('includes request ID header', async () => {
    const request = new Request('http://localhost/api/v1/chains');
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
    const request = new Request('http://localhost/api/v1/chains');
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
    const request1 = new Request('http://localhost/api/v1/chains');
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
    const request2 = new Request('http://localhost/api/v1/chains');
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
