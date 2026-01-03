/**
 * Body limit middleware tests
 * @module test/unit/lib/middleware/body-limit
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { bodyLimit } from '@/lib/middleware/body-limit';

describe('bodyLimit middleware', () => {
  it('allows requests under the limit', async () => {
    const app = new Hono();
    app.use('*', bodyLimit(1024));
    app.post('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        body: 'small body',
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    expect(response.status).toBe(200);
  });

  it('blocks requests over the Content-Length limit', async () => {
    const app = new Hono();
    app.use('*', bodyLimit(10));
    app.post('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        body: 'this is a longer body',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': '100',
        },
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('blocks POST requests with body over limit', async () => {
    const app = new Hono();
    app.use('*', bodyLimit(10));
    app.post('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        body: 'this body is definitely over 10 bytes',
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('Request body too large');
  });

  it('blocks PUT requests with body over limit', async () => {
    const app = new Hono();
    app.use('*', bodyLimit(10));
    app.put('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'PUT',
        body: 'this body is definitely over 10 bytes',
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    expect(response.status).toBe(400);
  });

  it('blocks PATCH requests with body over limit', async () => {
    const app = new Hono();
    app.use('*', bodyLimit(10));
    app.patch('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'PATCH',
        body: 'this body is definitely over 10 bytes',
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    expect(response.status).toBe(400);
  });

  it('allows GET requests without body check', async () => {
    const app = new Hono();
    app.use('*', bodyLimit(10));
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.status).toBe(200);
  });

  it('uses default max size when not specified', async () => {
    const app = new Hono();
    app.use('*', bodyLimit());
    app.post('/', (c) => c.text('OK'));

    // Default is 100KB (100 * 1024 = 102400)
    const smallBody = 'x'.repeat(1000);
    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        body: smallBody,
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    expect(response.status).toBe(200);
  });

  it('handles invalid Content-Length gracefully', async () => {
    const app = new Hono();
    app.use('*', bodyLimit(1024));
    app.post('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        body: 'small body',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': 'invalid',
        },
      })
    );

    // Should check actual body size when Content-Length is invalid
    expect(response.status).toBe(200);
  });

  it('includes max size in error message', async () => {
    const app = new Hono();
    app.use('*', bodyLimit(100));
    app.post('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        body: 'x'.repeat(150),
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('100 bytes');
  });
});
