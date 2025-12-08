/**
 * Request ID middleware tests
 * @module test/unit/lib/middleware/request-id
 */

import { requestId } from '@/lib/middleware/request-id';
import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

describe('requestId middleware', () => {
  it('generates request ID when not provided', async () => {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use('*', requestId());
    app.get('/', (c) => c.json({ requestId: c.get('requestId') }));

    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBeDefined();
    expect(response.headers.get('X-Request-ID')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('uses provided request ID from header', async () => {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use('*', requestId());
    app.get('/', (c) => c.json({ requestId: c.get('requestId') }));

    const customId = 'custom-request-id-123';
    const response = await app.fetch(
      new Request('http://localhost/', {
        headers: { 'X-Request-ID': customId },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe(customId);

    const body = (await response.json()) as { requestId: string };
    expect(body.requestId).toBe(customId);
  });

  it('sets request ID in context', async () => {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use('*', requestId());
    app.get('/', (c) => {
      const id = c.get('requestId');
      return c.json({ hasRequestId: !!id, requestId: id });
    });

    const response = await app.fetch(new Request('http://localhost/'));
    const body = (await response.json()) as { hasRequestId: boolean; requestId: string };

    expect(body.hasRequestId).toBe(true);
    expect(body.requestId).toBeDefined();
  });

  it('generates unique IDs for different requests', async () => {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use('*', requestId());
    app.get('/', (c) => c.json({ requestId: c.get('requestId') }));

    const response1 = await app.fetch(new Request('http://localhost/'));
    const response2 = await app.fetch(new Request('http://localhost/'));

    const id1 = response1.headers.get('X-Request-ID');
    const id2 = response2.headers.get('X-Request-ID');

    expect(id1).not.toBe(id2);
  });
});
