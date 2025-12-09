/**
 * Main app integration tests
 * @module test/integration/index
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_API_KEY, createMockEnv } from '../setup';

// Mock fetch for search service
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Root endpoint', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('returns app info at root', async () => {
    const request = new Request('http://localhost/');
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
    expect(body.name).toBe('8004-backend');
    expect(body.version).toBe('1.0.0');
    expect(body.docs).toBeDefined();
  });

  it('includes security headers on root', async () => {
    const request = new Request('http://localhost/');
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
});

describe('404 handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('returns 404 for unknown routes', async () => {
    const request = new Request('http://localhost/api/v1/unknown');
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
    expect(body.error).toBe('Not Found');
    expect(body.code).toBe('NOT_FOUND');
  });

  it('includes security headers on 404', async () => {
    const request = new Request('http://localhost/nonexistent');
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
  });
});

describe('Global error handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('handles unexpected errors gracefully', async () => {
    // Simulate an error by mocking a failing search
    mockFetch.mockRejectedValue(new Error('Unexpected error'));

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_API_KEY,
      },
      body: JSON.stringify({ query: 'test' }),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(request, createMockEnv() as unknown as typeof env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

describe('CORS', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('handles OPTIONS preflight request from allowed origin', async () => {
    const request = new Request('http://localhost/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://8004.dev',
        'Access-Control-Request-Method': 'GET',
      },
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

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://8004.dev');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('includes CORS headers for allowed origins', async () => {
    const request = new Request('http://localhost/api/v1/health', {
      headers: { Origin: 'https://8004.dev' },
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

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://8004.dev');
  });

  it('rejects CORS from unknown origins', async () => {
    const request = new Request('http://localhost/api/v1/health', {
      headers: { Origin: 'https://malicious.com' },
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

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('Queue consumer', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('exports queue handler', async () => {
    // Verify the default export has a queue handler
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe('function');
    // The queue property is on the module default export
    const appModule = await import('@/index');
    expect(typeof appModule.default.queue).toBe('function');
  });

  it('exports scheduled handler', async () => {
    const appModule = await import('@/index');
    expect(typeof appModule.default.scheduled).toBe('function');
  });
});

describe('Request ID propagation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('generates request ID when not provided', async () => {
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

    const requestId = response.headers.get('X-Request-ID');
    expect(requestId).toBeDefined();
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('preserves provided request ID', async () => {
    const providedId = 'custom-id-12345';
    const request = new Request('http://localhost/api/v1/health', {
      headers: { 'X-Request-ID': providedId },
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

    expect(response.headers.get('X-Request-ID')).toBe(providedId);
  });
});

describe('Rate limiting headers', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
  });

  it('includes rate limit headers on agents endpoint', async () => {
    const request = new Request('http://localhost/api/v1/agents', {
      headers: {
        'CF-Connecting-IP': '1.2.3.4',
        'X-API-Key': TEST_API_KEY,
      },
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(request, createMockEnv() as unknown as typeof env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
  });
});
