/**
 * Rate limit middleware tests
 * @module test/unit/lib/rate-limit
 */

import { rateLimit, rateLimitByTier, rateLimitConfigs } from '@/lib/utils/rate-limit';
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

  it('ignores X-Forwarded-For for security (only trusts CF-Connecting-IP)', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 10, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'X-Forwarded-For': '5.6.7.8, 9.10.11.12' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    // X-Forwarded-For is ignored for security - falls back to anonymous
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('anonymous'),
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

describe('rateLimit edge cases', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  it('resets window when entry has expired resetAt', async () => {
    const now = Math.floor(Date.now() / 1000);

    // Pre-populate with an expired entry
    mockKV.put(
      'ratelimit:1.2.3.4',
      JSON.stringify({
        count: 100, // Over limit
        resetAt: now - 10, // Expired 10 seconds ago
      })
    );

    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 10, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    // Should succeed because window was reset
    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('handles corrupted JSON in KV gracefully', async () => {
    // Pre-populate with corrupted data
    mockKV.put('ratelimit:1.2.3.4', 'not-valid-json{{{');

    const app = new Hono<{ Bindings: { CACHE: typeof mockKV } }>();
    app.use('*', rateLimit({ limit: 10, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    // Should succeed - corrupted entry is treated as fresh
    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('handles KV errors gracefully (fail open)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create a KV that throws on get
    const brokenKV = {
      get: vi.fn().mockRejectedValue(new Error('KV unavailable')),
      put: vi.fn().mockRejectedValue(new Error('KV unavailable')),
    };

    const app = new Hono<{ Bindings: { CACHE: typeof brokenKV } }>();
    app.use('*', rateLimit({ limit: 10, window: 60 }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: brokenKV });

    // Should succeed - fail open on KV errors
    expect(response.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rate limit KV error'),
      expect.any(String)
    );

    consoleSpy.mockRestore();
  });
});

describe('rateLimitByTier', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  it('uses standard config for anonymous tier', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV }; Variables: { apiKeyTier?: string } }>();
    app.use('*', rateLimitByTier());
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    // Standard limit is 60
    expect(response.headers.get('X-RateLimit-Limit')).toBe('60');
  });

  it('uses higher config for authenticated tier', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV }; Variables: { apiKeyTier?: string } }>();

    // Middleware to set authenticated tier
    app.use('*', async (c, next) => {
      c.set('apiKeyTier', 'authenticated');
      await next();
    });
    app.use('*', rateLimitByTier());
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    // With API key limit is 300
    expect(response.headers.get('X-RateLimit-Limit')).toBe('300');
  });

  it('uses custom keyPrefix', async () => {
    const app = new Hono<{ Bindings: { CACHE: typeof mockKV }; Variables: { apiKeyTier?: string } }>();
    app.use('*', rateLimitByTier({ keyPrefix: 'custom-prefix' }));
    app.get('/', (c) => c.text('OK'));

    const request = new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    await app.fetch(request, { CACHE: mockKV });

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('custom-prefix:'),
      expect.any(String),
      expect.any(Object)
    );
  });
});
