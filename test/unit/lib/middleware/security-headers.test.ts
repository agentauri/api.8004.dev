/**
 * Security headers middleware tests
 * @module test/unit/lib/middleware/security-headers
 */

import { securityHeaders } from '@/lib/middleware/security-headers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

describe('securityHeaders middleware', () => {
  it('sets X-Content-Type-Options header', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets X-Frame-Options header', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets X-XSS-Protection header', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
  });

  it('sets Referrer-Policy header', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets Content-Security-Policy header', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'"
    );
  });

  it('sets Strict-Transport-Security header', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains'
    );
  });

  it('sets Permissions-Policy header', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()'
    );
  });

  it('applies to all response status codes', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/error', (c) => c.json({ error: 'Not Found' }, 404));

    const response = await app.fetch(new Request('http://localhost/error'));

    expect(response.status).toBe(404);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
