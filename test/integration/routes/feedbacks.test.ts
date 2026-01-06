/**
 * Global feedbacks route integration tests
 * @module test/integration/routes/feedbacks
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { insertMockFeedback, mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/feedbacks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns empty data when no feedbacks exist', async () => {
    const response = await testRoute('/api/v1/feedbacks');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('returns feedbacks with correct structure', async () => {
    // Insert test feedbacks
    await insertMockFeedback('11155111:1', { score: 85 });
    await insertMockFeedback('11155111:2', { score: 45 });

    const response = await testRoute('/api/v1/feedbacks');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.meta.total).toBe(2);

    // Check feedback structure
    const feedback = body.data[0];
    expect(feedback).toHaveProperty('id');
    expect(feedback).toHaveProperty('agentId');
    expect(feedback).toHaveProperty('chainId');
    expect(feedback).toHaveProperty('score');
    expect(feedback).toHaveProperty('tags');
    expect(feedback).toHaveProperty('submitter');
    expect(feedback).toHaveProperty('timestamp');
  });

  it('filters by scoreCategory=positive (score >= 70)', async () => {
    await insertMockFeedback('11155111:1', { score: 85 });
    await insertMockFeedback('11155111:2', { score: 45 });
    await insertMockFeedback('11155111:3', { score: 25 });

    const response = await testRoute('/api/v1/feedbacks?scoreCategory=positive');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].score).toBeGreaterThanOrEqual(70);
  });

  it('filters by scoreCategory=neutral (40-69)', async () => {
    await insertMockFeedback('11155111:1', { score: 85 });
    await insertMockFeedback('11155111:2', { score: 55 });
    await insertMockFeedback('11155111:3', { score: 25 });

    const response = await testRoute('/api/v1/feedbacks?scoreCategory=neutral');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].score).toBeGreaterThanOrEqual(40);
    expect(body.data[0].score).toBeLessThan(70);
  });

  it('filters by scoreCategory=negative (score < 40)', async () => {
    await insertMockFeedback('11155111:1', { score: 85 });
    await insertMockFeedback('11155111:2', { score: 55 });
    await insertMockFeedback('11155111:3', { score: 25 });

    const response = await testRoute('/api/v1/feedbacks?scoreCategory=negative');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].score).toBeLessThan(40);
  });

  it('filters by chainIds', async () => {
    await insertMockFeedback('11155111:1', { score: 85, chain_id: 11155111 });
    await insertMockFeedback('84532:1', { score: 75, chain_id: 84532 });

    const response = await testRoute('/api/v1/feedbacks?chainIds[]=11155111');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].chainId).toBe(11155111);
  });

  it('respects limit parameter', async () => {
    await insertMockFeedback('11155111:1', { score: 85 });
    await insertMockFeedback('11155111:2', { score: 75 });
    await insertMockFeedback('11155111:3', { score: 65 });

    const response = await testRoute('/api/v1/feedbacks?limit=2');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(2);
    expect(body.meta.hasMore).toBe(true);
  });

  it('supports cursor-based pagination', async () => {
    await insertMockFeedback('11155111:1', { score: 85 });
    await insertMockFeedback('11155111:2', { score: 75 });
    await insertMockFeedback('11155111:3', { score: 65 });

    // First page
    const response1 = await testRoute('/api/v1/feedbacks?limit=2');
    const body1 = await response1.json();
    expect(body1.data.length).toBe(2);
    expect(body1.meta.nextCursor).toBeDefined();

    // Second page
    const response2 = await testRoute(`/api/v1/feedbacks?limit=2&cursor=${body1.meta.nextCursor}`);
    const body2 = await response2.json();
    expect(body2.data.length).toBe(1);
    expect(body2.meta.hasMore).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/feedbacks', { skipAuth: true });
    expect(response.status).toBe(401);
  });

  // Note: Request ID and security headers are tested in index.test.ts

  it('includes meta stats', async () => {
    await insertMockFeedback('11155111:1', { score: 85 });
    await insertMockFeedback('11155111:2', { score: 55 });
    await insertMockFeedback('11155111:3', { score: 25 });

    const response = await testRoute('/api/v1/feedbacks');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.stats).toBeDefined();
    expect(body.meta.stats.positive).toBe(1);
    expect(body.meta.stats.neutral).toBe(1);
    expect(body.meta.stats.negative).toBe(1);
  });

  it('returns validation error for invalid scoreCategory', async () => {
    const response = await testRoute('/api/v1/feedbacks?scoreCategory=invalid');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
