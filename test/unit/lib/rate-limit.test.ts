/**
 * Rate limit middleware tests
 * @module test/unit/lib/rate-limit
 */

import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Create a mock KV store
function createMockKV() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    clear: () => store.clear(),
  };
}

describe('rateLimit middleware', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  it('allows requests under the limit', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 10, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('blocks requests over the limit', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 2, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const env = { CACHE: mockKV };
    const makeRequest = () =>
      app.fetch(
        new Request('http://localhost/', {
          headers: { 'CF-Connecting-IP': '1.2.3.4' },
        }),
        env
      );

    // First two requests should succeed
    const res1 = await makeRequest();
    expect(res1.status).toBe(200);

    const res2 = await makeRequest();
    expect(res2.status).toBe(200);

    // Third request should be rate limited
    const res3 = await makeRequest();
    expect(res3.status).toBe(429);

    const body = (await res3.json()) as { code: string };
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res3.headers.get('Retry-After')).toBeDefined();
  });

  it('resets after window expires', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 1, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const env = { CACHE: mockKV };
    const makeRequest = () =>
      app.fetch(
        new Request('http://localhost/', {
          headers: { 'CF-Connecting-IP': '1.2.3.4' },
        }),
        env
      );

    // First request succeeds
    const res1 = await makeRequest();
    expect(res1.status).toBe(200);

    // Second request fails
    const res2 = await makeRequest();
    expect(res2.status).toBe(429);

    // Advance time past window
    vi.advanceTimersByTime(61000);

    // After window expires, request should succeed again
    mockKV.clear();
    const res3 = await makeRequest();
    expect(res3.status).toBe(200);
  });

  it('uses X-Forwarded-For when CF-Connecting-IP is not available', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 10, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'X-Forwarded-For': '5.6.7.8, 9.10.11.12' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    // Should use first IP from X-Forwarded-For
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('5.6.7.8'),
      expect.any(String),
      expect.any(Object)
    );
  });

  it('falls back to anonymous when no IP headers', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 10, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/');
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('anonymous'),
      expect.any(String),
      expect.any(Object)
    );
  });

  it('uses custom key prefix', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 10, window: 60, keyPrefix: 'custom' }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    await app.fetch(request, { CACHE: mockKV });

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('custom:'),
      expect.any(String),
      expect.any(Object)
    );
  });
});

describe('rateLimitConfigs', () => {
  it('has standard config', () => {
    expect(rateLimitConfigs.standard).toEqual({ limit: 60, window: 60 });
  });

  it('has withApiKey config', () => {
    expect(rateLimitConfigs.withApiKey).toEqual({ limit: 300, window: 60 });
  });

  it('has classification config', () => {
    expect(rateLimitConfigs.classification).toEqual({
      limit: 10,
      window: 60,
      keyPrefix: 'ratelimit:classify',
    });
  });
});
