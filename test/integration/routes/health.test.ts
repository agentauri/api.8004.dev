/**
 * Health route integration tests
 * @module test/integration/routes/health
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockEASResponse, mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/health', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns 200 when all services are healthy', async () => {
    const response = await testRoute('/api/v1/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.timestamp).toBeDefined();
    expect(body.services).toBeDefined();
  });

  it('returns degraded status when search service is down', async () => {
    mockFetch.mockRejectedValue(new Error('Connection failed'));

    const response = await testRoute('/api/v1/health');

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.services.searchService).toBe('error');
  });

  it('includes request ID header', async () => {
    const response = await testRoute('/api/v1/health');
    expect(response.headers.get('X-Request-ID')).toBeDefined();
  });

  it('uses provided request ID', async () => {
    const requestId = 'test-request-id-123';
    const response = await testRoute('/api/v1/health', {
      headers: { 'X-Request-ID': requestId },
    });
    expect(response.headers.get('X-Request-ID')).toBe(requestId);
  });

  it('includes security headers', async () => {
    const response = await testRoute('/api/v1/health');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('returns degraded when classifier API key is invalid', async () => {
    // This test needs custom env, use the longer form
    const { createExecutionContext, env, waitOnExecutionContext } = await import('cloudflare:test');
    const app = (await import('@/index')).default;

    const request = new Request('http://localhost/api/v1/health');
    const ctx = createExecutionContext();
    const response = await app.fetch(
      request,
      {
        ...env,
        ANTHROPIC_API_KEY: 'invalid-api-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
        SEPOLIA_RPC_URL: 'https://sepolia.example.com',
        BASE_SEPOLIA_RPC_URL: 'https://base-sepolia.example.com',
        POLYGON_AMOY_RPC_URL: 'https://polygon-amoy.example.com',
        ENVIRONMENT: 'test',
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
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'error' }),
    });

    const response = await testRoute('/api/v1/health');

    expect(response.status).toBe(503);
    const body = (await response.json()) as { status: string; services: { searchService: string } };
    expect(body.status).toBe('degraded');
    expect(body.services.searchService).toBe('error');
  });
});

describe('Health check error handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns 503 when search service throws Error', async () => {
    mockFetch.mockRejectedValue(new Error('Connection timeout'));

    const response = await testRoute('/api/v1/health');

    expect(response.status).toBe(503);
    const body = (await response.json()) as { status: string; services: { searchService: string } };
    expect(body.status).toBe('degraded');
    expect(body.services.searchService).toBe('error');
  });

  it('returns 503 when search service throws non-Error', async () => {
    mockFetch.mockRejectedValue('Network failure');

    const response = await testRoute('/api/v1/health');

    expect(response.status).toBe(503);
    const body = (await response.json()) as { status: string; services: { searchService: string } };
    expect(body.status).toBe('degraded');
    expect(body.services.searchService).toBe('error');
  });
});

describe('POST /api/v1/health/sync-eas', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockEASResponse([]));
  });

  it('triggers EAS sync and returns summary', async () => {
    const response = await testRoute('/api/v1/health/sync-eas', { method: 'POST' });

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
    const response = await testRoute('/api/v1/health/sync-eas', { method: 'POST' });

    const body = (await response.json()) as {
      success: boolean;
      data: Record<string, { success: boolean; attestationsProcessed: number }>;
    };

    expect(Object.keys(body.data).length).toBeGreaterThan(0);
  });
});
