/**
 * Rate limit middleware tests
 * @module test/unit/lib/rate-limit
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  endpointRateLimits,
  getEndpointRateLimit,
  perEndpointRateLimit,
  rateLimit,
  rateLimitConfigs,
} from '@/lib/utils/rate-limit';

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
      limit: 100,
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

    // Should fail closed on KV errors (security measure)
    expect(response.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rate limit KV error'),
      expect.any(String)
    );

    consoleSpy.mockRestore();
  });
});

describe('endpointRateLimits', () => {
  it('has search endpoint config', () => {
    expect(endpointRateLimits['/api/v1/search']).toEqual({
      anonymous: 30,
      authenticated: 100,
    });
  });

  it('has agents endpoint config', () => {
    expect(endpointRateLimits['/api/v1/agents']).toEqual({
      anonymous: 60,
      authenticated: 200,
    });
  });

  it('has classify endpoint config', () => {
    expect(endpointRateLimits['/api/v1/agents/:agentId/classify']).toEqual({
      anonymous: 10,
      authenticated: 30,
    });
  });

  it('has default config', () => {
    expect(endpointRateLimits['default']).toEqual({
      anonymous: 60,
      authenticated: 300,
    });
  });
});

describe('getEndpointRateLimit', () => {
  it('returns search endpoint limit for anonymous user', () => {
    const result = getEndpointRateLimit('/api/v1/search', false);
    expect(result.limit).toBe(30);
    expect(result.keyPrefix).toContain('search');
  });

  it('returns search endpoint limit for authenticated user', () => {
    const result = getEndpointRateLimit('/api/v1/search', true);
    expect(result.limit).toBe(100);
    expect(result.keyPrefix).toContain('search');
  });

  it('returns agents endpoint limit', () => {
    const result = getEndpointRateLimit('/api/v1/agents', false);
    expect(result.limit).toBe(60);
  });

  it('matches classify endpoint pattern', () => {
    const result = getEndpointRateLimit('/api/v1/agents/11155111:123/classify', false);
    expect(result.limit).toBe(10);
    expect(result.keyPrefix).toContain('classify');
  });

  it('matches single agent detail pattern', () => {
    const result = getEndpointRateLimit('/api/v1/agents/11155111:123', false);
    expect(result.limit).toBe(60); // Uses agents limit
  });

  it('returns default for unknown endpoint', () => {
    const result = getEndpointRateLimit('/api/v1/unknown', false);
    expect(result.limit).toBe(60); // Anonymous default
  });

  it('returns authenticated default for unknown endpoint', () => {
    const result = getEndpointRateLimit('/api/v1/unknown', true);
    expect(result.limit).toBe(300); // Authenticated default
  });

  it('normalizes path with trailing slash', () => {
    const result = getEndpointRateLimit('/api/v1/search/', false);
    expect(result.limit).toBe(30);
  });

  it('normalizes path with query params', () => {
    const result = getEndpointRateLimit('/api/v1/search?q=test', false);
    expect(result.limit).toBe(30);
  });
});

describe('perEndpointRateLimit middleware', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  it('applies search endpoint limit for anonymous user', async () => {
    const app = new Hono<{
      Bindings: { CACHE: typeof mockKV };
      Variables: { isAuthenticated?: boolean };
    }>();
    app.use('*', async (c, next) => {
      c.set('isAuthenticated', false);
      await next();
    });
    app.use('*', perEndpointRateLimit());
    app.post('/api/v1/search', (c) => c.text('OK'));

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30'); // Search limit for anonymous
  });

  it('applies higher limit for authenticated user', async () => {
    const app = new Hono<{
      Bindings: { CACHE: typeof mockKV };
      Variables: { isAuthenticated?: boolean };
    }>();
    app.use('*', async (c, next) => {
      c.set('isAuthenticated', true);
      await next();
    });
    app.use('*', perEndpointRateLimit());
    app.post('/api/v1/search', (c) => c.text('OK'));

    const request = new Request('http://localhost/api/v1/search', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100'); // Search limit for authenticated
  });

  it('applies classify endpoint limit', async () => {
    const app = new Hono<{
      Bindings: { CACHE: typeof mockKV };
      Variables: { isAuthenticated?: boolean };
    }>();
    app.use('*', async (c, next) => {
      c.set('isAuthenticated', false);
      await next();
    });
    app.use('*', perEndpointRateLimit());
    app.post('/api/v1/agents/:agentId/classify', (c) => c.text('OK'));

    const request = new Request('http://localhost/api/v1/agents/11155111:1/classify', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await app.fetch(request, { CACHE: mockKV });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('10'); // Classify limit for anonymous
  });

  it('uses separate rate limit keys per endpoint', async () => {
    const app = new Hono<{
      Bindings: { CACHE: typeof mockKV };
      Variables: { isAuthenticated?: boolean };
    }>();
    app.use('*', async (c, next) => {
      c.set('isAuthenticated', false);
      await next();
    });
    app.use('*', perEndpointRateLimit());
    app.get('/api/v1/agents', (c) => c.text('OK'));
    app.post('/api/v1/search', (c) => c.text('OK'));

    const env = { CACHE: mockKV };

    // Make request to agents endpoint
    await app.fetch(
      new Request('http://localhost/api/v1/agents', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      }),
      env
    );

    // Make request to search endpoint
    await app.fetch(
      new Request('http://localhost/api/v1/search', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      }),
      env
    );

    // Should have separate entries for each endpoint
    const putCalls = mockKV.put.mock.calls.map((call) => call[0]);
    expect(putCalls.some((key) => key.includes('agents'))).toBe(true);
    expect(putCalls.some((key) => key.includes('search'))).toBe(true);
  });
});
