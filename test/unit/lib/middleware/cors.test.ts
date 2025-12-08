/**
 * CORS middleware tests
 * @module test/unit/lib/middleware/cors
 */

import { cors } from '@/lib/middleware/cors';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

describe('cors middleware', () => {
  it('allows all origins', async () => {
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { Origin: 'https://example.com' },
      })
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('handles preflight OPTIONS request', async () => {
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
  });

  it('exposes rate limit headers', async () => {
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { Origin: 'https://example.com' },
      })
    );

    const exposeHeaders = response.headers.get('Access-Control-Expose-Headers');
    expect(exposeHeaders).toContain('X-Request-ID');
    expect(exposeHeaders).toContain('X-RateLimit-Limit');
    expect(exposeHeaders).toContain('X-RateLimit-Remaining');
    expect(exposeHeaders).toContain('X-RateLimit-Reset');
  });

  it('allows required headers', async () => {
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      })
    );

    const allowHeaders = response.headers.get('Access-Control-Allow-Headers');
    expect(allowHeaders).toContain('Content-Type');
    expect(allowHeaders).toContain('X-Request-ID');
    expect(allowHeaders).toContain('X-API-Key');
    expect(allowHeaders).toContain('Authorization');
  });

  it('sets max age for preflight cache', async () => {
    const app = new Hono();
    app.use('*', cors);
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
        },
      })
    );

    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
});
