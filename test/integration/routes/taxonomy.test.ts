/**
 * Taxonomy route integration tests
 * @module test/integration/routes/taxonomy
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import app from '@/index';
import { OASF_VERSION } from '@/lib/oasf/taxonomy';
import { describe, expect, it } from 'vitest';

describe('GET /api/v1/taxonomy', () => {
  it('returns all taxonomy by default', async () => {
    const request = new Request('http://localhost/api/v1/taxonomy');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.version).toBe(OASF_VERSION);
    expect(body.data.skills).toBeDefined();
    expect(body.data.domains).toBeDefined();
  });

  it('returns skills only when type=skill', async () => {
    const request = new Request('http://localhost/api/v1/taxonomy?type=skill');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.skills).toBeDefined();
    expect(body.data.domains).toBeUndefined();
  });

  it('returns domains only when type=domain', async () => {
    const request = new Request('http://localhost/api/v1/taxonomy?type=domain');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.skills).toBeUndefined();
    expect(body.data.domains).toBeDefined();
  });

  it('rejects invalid type parameter', async () => {
    const request = new Request('http://localhost/api/v1/taxonomy?type=invalid');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('includes rate limit headers', async () => {
    const request = new Request('http://localhost/api/v1/taxonomy');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
  });

  it('caches responses', async () => {
    // First request
    const request1 = new Request('http://localhost/api/v1/taxonomy');
    const ctx1 = createExecutionContext();
    const response1 = await app.fetch(request1, env, ctx1);
    await waitOnExecutionContext(ctx1);
    const body1 = await response1.json();

    // Second request (should hit cache)
    const request2 = new Request('http://localhost/api/v1/taxonomy');
    const ctx2 = createExecutionContext();
    const response2 = await app.fetch(request2, env, ctx2);
    await waitOnExecutionContext(ctx2);
    const body2 = await response2.json();

    expect(body1).toEqual(body2);
  });
});
