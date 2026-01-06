/**
 * Taxonomy route integration tests
 * @module test/integration/routes/taxonomy
 */

import { describe, expect, it } from 'vitest';
import { OASF_VERSION } from '@/lib/oasf/taxonomy';
import { testRoute } from '../../setup';

describe('GET /api/v1/taxonomy', () => {
  it('returns all taxonomy by default', async () => {
    const response = await testRoute('/api/v1/taxonomy');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.version).toBe(OASF_VERSION);
    expect(body.data.skills).toBeDefined();
    expect(body.data.domains).toBeDefined();
  });

  it('returns skills only when type=skill', async () => {
    const response = await testRoute('/api/v1/taxonomy?type=skill');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.skills).toBeDefined();
    expect(body.data.domains).toBeUndefined();
  });

  it('returns domains only when type=domain', async () => {
    const response = await testRoute('/api/v1/taxonomy?type=domain');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.skills).toBeUndefined();
    expect(body.data.domains).toBeDefined();
  });

  it('rejects invalid type parameter', async () => {
    const response = await testRoute('/api/v1/taxonomy?type=invalid');

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // Note: Rate limit headers are tested in index.test.ts

  it('caches responses', async () => {
    // First request
    const response1 = await testRoute('/api/v1/taxonomy');
    const body1 = await response1.json();

    // Second request (should hit cache)
    const response2 = await testRoute('/api/v1/taxonomy');
    const body2 = await response2.json();

    expect(body1).toEqual(body2);
  });
});
