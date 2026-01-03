/**
 * API Key authentication middleware tests
 * @module test/unit/lib/middleware/api-key
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { apiKeyAuth, requireApiKey } from '@/lib/middleware/api-key';

describe('apiKeyAuth middleware', () => {
  it('sets anonymous tier when no API key provided', async () => {
    const app = new Hono<{ Bindings: { API_KEY: string } }>();
    app.use('*', apiKeyAuth());
    app.get('/', (c) => {
      return c.json({
        isAuthenticated: c.get('isAuthenticated'),
        tier: c.get('apiKeyTier'),
      });
    });

    const response = await app.fetch(new Request('http://localhost/'), {
      API_KEY: 'secret-key',
    });

    const body = (await response.json()) as { isAuthenticated: boolean; tier: string };
    expect(body.isAuthenticated).toBe(false);
    expect(body.tier).toBe('anonymous');
  });

  it('sets standard tier when valid X-API-Key header provided', async () => {
    const app = new Hono<{ Bindings: { API_KEY: string } }>();
    app.use('*', apiKeyAuth());
    app.get('/', (c) => {
      return c.json({
        isAuthenticated: c.get('isAuthenticated'),
        tier: c.get('apiKeyTier'),
      });
    });

    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { 'X-API-Key': 'secret-key' },
      }),
      { API_KEY: 'secret-key' }
    );

    const body = (await response.json()) as { isAuthenticated: boolean; tier: string };
    expect(body.isAuthenticated).toBe(true);
    expect(body.tier).toBe('standard');
  });

  it('accepts Authorization: Bearer header', async () => {
    const app = new Hono<{ Bindings: { API_KEY: string } }>();
    app.use('*', apiKeyAuth());
    app.get('/', (c) => {
      return c.json({
        isAuthenticated: c.get('isAuthenticated'),
        tier: c.get('apiKeyTier'),
      });
    });

    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { Authorization: 'Bearer secret-key' },
      }),
      { API_KEY: 'secret-key' }
    );

    const body = (await response.json()) as { isAuthenticated: boolean; tier: string };
    expect(body.isAuthenticated).toBe(true);
    expect(body.tier).toBe('standard');
  });

  it('stays anonymous with invalid API key', async () => {
    const app = new Hono<{ Bindings: { API_KEY: string } }>();
    app.use('*', apiKeyAuth());
    app.get('/', (c) => {
      return c.json({
        isAuthenticated: c.get('isAuthenticated'),
        tier: c.get('apiKeyTier'),
      });
    });

    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { 'X-API-Key': 'wrong-key' },
      }),
      { API_KEY: 'secret-key' }
    );

    const body = (await response.json()) as { isAuthenticated: boolean; tier: string };
    expect(body.isAuthenticated).toBe(false);
    expect(body.tier).toBe('anonymous');
  });

  it('allows requests when no API_KEY configured', async () => {
    const app = new Hono<{ Bindings: { API_KEY?: string } }>();
    app.use('*', apiKeyAuth());
    app.get('/', (c) => {
      return c.json({
        isAuthenticated: c.get('isAuthenticated'),
        tier: c.get('apiKeyTier'),
      });
    });

    const response = await app.fetch(new Request('http://localhost/'), {});

    expect(response.status).toBe(200);
    const body = (await response.json()) as { isAuthenticated: boolean; tier: string };
    expect(body.isAuthenticated).toBe(false);
    expect(body.tier).toBe('anonymous');
  });
});

describe('requireApiKey middleware', () => {
  it('returns 401 when no API key provided', async () => {
    const app = new Hono<{ Bindings: { API_KEY: string } }>();
    app.use('*', requireApiKey());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(new Request('http://localhost/'), {
      API_KEY: 'secret-key',
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with invalid API key', async () => {
    const app = new Hono<{ Bindings: { API_KEY: string } }>();
    app.use('*', requireApiKey());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { 'X-API-Key': 'wrong-key' },
      }),
      { API_KEY: 'secret-key' }
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('Invalid API key');
  });

  it('allows request with valid API key', async () => {
    const app = new Hono<{ Bindings: { API_KEY: string } }>();
    app.use('*', requireApiKey());
    app.get('/', (c) => c.text('OK'));

    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { 'X-API-Key': 'secret-key' },
      }),
      { API_KEY: 'secret-key' }
    );

    expect(response.status).toBe(200);
  });

  it('sets authenticated context on success', async () => {
    const app = new Hono<{ Bindings: { API_KEY: string } }>();
    app.use('*', requireApiKey());
    app.get('/', (c) => {
      return c.json({
        isAuthenticated: c.get('isAuthenticated'),
        tier: c.get('apiKeyTier'),
      });
    });

    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { 'X-API-Key': 'secret-key' },
      }),
      { API_KEY: 'secret-key' }
    );

    const body = (await response.json()) as { isAuthenticated: boolean; tier: string };
    expect(body.isAuthenticated).toBe(true);
    expect(body.tier).toBe('standard');
  });
});
