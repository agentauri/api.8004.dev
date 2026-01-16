/**
 * Tags route integration tests
 * @module test/integration/routes/tags
 */

import { describe, expect, it } from 'vitest';
import { testRoute } from '../../setup';

describe('GET /api/v1/tags', () => {
  it('returns tags list', async () => {
    const response = await testRoute('/api/v1/tags');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tags).toBeDefined();
    expect(Array.isArray(body.data.tags)).toBe(true);
    expect(typeof body.data.count).toBe('number');
  });

  it('returns empty list when no feedback exists', async () => {
    const response = await testRoute('/api/v1/tags');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tags).toEqual([]);
    expect(body.data.count).toBe(0);
  });

  it('supports limit parameter', async () => {
    const response = await testRoute('/api/v1/tags?limit=10');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tags.length).toBeLessThanOrEqual(10);
  });

  it('supports chainIds filter', async () => {
    const response = await testRoute('/api/v1/tags?chainIds[]=11155111');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('requires API key authentication', async () => {
    const response = await testRoute('/api/v1/tags', { apiKey: '' });

    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('caches responses', async () => {
    // First request
    const response1 = await testRoute('/api/v1/tags');
    const body1 = await response1.json();

    // Second request (should hit cache)
    const response2 = await testRoute('/api/v1/tags');
    const body2 = await response2.json();

    expect(body1).toEqual(body2);
  });
});
