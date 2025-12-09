/**
 * Health route integration tests
 * @module test/integration/routes/health
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch for search service health check
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GET /api/v1/health', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns 200 when all services are healthy', async () => {
    // Mock search service health check
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const request = new Request('http://localhost/api/v1/health');
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
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.timestamp).toBeDefined();
    expect(body.services).toBeDefined();
  });

  it('returns degraded status when search service is down', async () => {
    // Mock search service health check failure
    mockFetch.mockRejectedValue(new Error('Connection failed'));

    const request = new Request('http://localhost/api/v1/health');
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

    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.services.searchService).toBe('error');
  });

  it('includes request ID header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const request = new Request('http://localhost/api/v1/health');
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

  it('uses provided request ID', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const requestId = 'test-request-id-123';
    const request = new Request('http://localhost/api/v1/health', {
      headers: { 'X-Request-ID': requestId },
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

    expect(response.headers.get('X-Request-ID')).toBe(requestId);
  });

  it('includes security headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const request = new Request('http://localhost/api/v1/health');
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

  it('returns degraded status when classifier API key is invalid', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const request = new Request('http://localhost/api/v1/health');
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'invalid-api-key', // Not starting with sk-ant-
        SEARCH_SERVICE_URL: 'https://search.example.com',
      },
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(503);

    const body = (await response.json()) as { status: string; services: { classifier: string } };
    expect(body.status).toBe('degraded');
    expect(body.services.classifier).toBe('error');
  });

  it('returns degraded status when search service returns unhealthy', async () => {
    // Mock search service returning unhealthy status
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'error' }),
    });

    const request = new Request('http://localhost/api/v1/health');
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

    expect(response.status).toBe(503);

    const body = (await response.json()) as { status: string; services: { searchService: string } };
    expect(body.status).toBe('degraded');
    expect(body.services.searchService).toBe('error');
  });
});

describe('POST /api/v1/health/sync-eas', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('triggers EAS sync and returns summary', async () => {
    // Mock EAS GraphQL endpoint
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            attestations: [],
          },
        }),
    });

    const request = new Request('http://localhost/api/v1/health/sync-eas', {
      method: 'POST',
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

    const body = (await response.json()) as {
      success: boolean;
      data: Record<string, { success: boolean; attestationsProcessed: number }>;
      timestamp: string;
    };
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it('returns sync results for each chain', async () => {
    // Mock EAS GraphQL endpoint with attestations
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            attestations: [],
          },
        }),
    });

    const request = new Request('http://localhost/api/v1/health/sync-eas', {
      method: 'POST',
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

    const body = (await response.json()) as {
      success: boolean;
      data: Record<string, { success: boolean; attestationsProcessed: number }>;
    };

    // Should have entries for Sepolia, Base Sepolia, and Polygon Amoy
    expect(Object.keys(body.data).length).toBeGreaterThan(0);
  });
});
