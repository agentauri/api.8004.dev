/**
 * Evaluations route integration tests
 * @module test/integration/routes/evaluations
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  insertMockEvaluation,
  insertMockEvaluationQueueItem,
  mockHealthyResponse,
  setupMockFetch,
  testRoute,
} from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/evaluations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns empty data when no evaluations exist', async () => {
    const response = await testRoute('/api/v1/evaluations');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('returns evaluations with correct structure', async () => {
    // Insert test evaluations
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('11155111:2', { overall_score: 45 });

    const response = await testRoute('/api/v1/evaluations');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.meta.total).toBe(2);

    // Check evaluation structure
    const evaluation = body.data[0];
    expect(evaluation).toHaveProperty('id');
    expect(evaluation).toHaveProperty('agentId');
    expect(evaluation).toHaveProperty('chainId');
    expect(evaluation).toHaveProperty('overallScore');
    expect(evaluation).toHaveProperty('status');
  });

  it('filters by agentId', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('11155111:2', { overall_score: 75 });

    const response = await testRoute('/api/v1/evaluations?agentId=11155111:1');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].agentId).toBe('11155111:1');
  });

  it('filters by status', async () => {
    await insertMockEvaluation('11155111:1', { status: 'completed' });
    await insertMockEvaluation('11155111:2', { status: 'failed' });

    const response = await testRoute('/api/v1/evaluations?status=completed');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].status).toBe('completed');
  });

  it('filters by minScore', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('11155111:2', { overall_score: 45 });

    const response = await testRoute('/api/v1/evaluations?minScore=70');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].overallScore).toBeGreaterThanOrEqual(70);
  });

  it('filters by maxScore', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('11155111:2', { overall_score: 45 });

    const response = await testRoute('/api/v1/evaluations?maxScore=50');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].overallScore).toBeLessThanOrEqual(50);
  });

  it('filters by chainIds', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('84532:1', { overall_score: 75 });

    const response = await testRoute('/api/v1/evaluations?chainIds[]=11155111');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].chainId).toBe(11155111);
  });

  it('respects limit parameter', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('11155111:2', { overall_score: 75 });
    await insertMockEvaluation('11155111:3', { overall_score: 65 });

    const response = await testRoute('/api/v1/evaluations?limit=2');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(2);
    expect(body.meta.hasMore).toBe(true);
  });

  it('supports cursor-based pagination', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('11155111:2', { overall_score: 75 });
    await insertMockEvaluation('11155111:3', { overall_score: 65 });

    // First page
    const response1 = await testRoute('/api/v1/evaluations?limit=2');
    const body1 = await response1.json();
    expect(body1.data.length).toBe(2);
    expect(body1.meta.nextCursor).toBeDefined();

    // Second page
    const response2 = await testRoute(
      `/api/v1/evaluations?limit=2&cursor=${body1.meta.nextCursor}`
    );
    const body2 = await response2.json();
    expect(body2.data.length).toBe(1);
    expect(body2.meta.hasMore).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/evaluations', { skipAuth: true });
    expect(response.status).toBe(401);
  });

  it('includes queue stats in meta', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluationQueueItem('11155111:2', { status: 'pending' });
    await insertMockEvaluationQueueItem('11155111:3', { status: 'processing' });

    const response = await testRoute('/api/v1/evaluations');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.queue).toBeDefined();
    expect(body.meta.queue.pending).toBe(1);
    expect(body.meta.queue.processing).toBe(1);
  });
});

describe('GET /api/v1/evaluations/:id', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns evaluation by ID', async () => {
    const inserted = await insertMockEvaluation('11155111:1', { overall_score: 85 });

    const response = await testRoute(`/api/v1/evaluations/${inserted.id}`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(inserted.id);
    expect(body.data.agentId).toBe('11155111:1');
    expect(body.data.overallScore).toBe(85);
  });

  it('returns 404 for non-existent evaluation', async () => {
    const response = await testRoute('/api/v1/evaluations/nonexistent');

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/evaluations/test-id', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/evaluations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('queues new evaluation successfully', async () => {
    const response = await testRoute('/api/v1/evaluations', {
      method: 'POST',
      body: {
        agentId: '11155111:123',
        skills: ['code_generation'],
        priority: 5,
      },
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id');
    expect(body.data.agentId).toBe('11155111:123');
    expect(body.data.status).toBe('pending');
    expect(body.message).toBe('Evaluation queued successfully');
  });

  it('returns 409 when agent already has pending evaluation', async () => {
    // Insert a pending queue item
    await insertMockEvaluationQueueItem('11155111:123', { status: 'pending' });

    const response = await testRoute('/api/v1/evaluations', {
      method: 'POST',
      body: {
        agentId: '11155111:123',
      },
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ALREADY_QUEUED');
  });

  it('allows queuing when force=true despite pending evaluation', async () => {
    // Insert a pending queue item
    await insertMockEvaluationQueueItem('11155111:123', { status: 'pending' });

    const response = await testRoute('/api/v1/evaluations', {
      method: 'POST',
      body: {
        agentId: '11155111:123',
        force: true,
      },
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 for invalid agent ID format', async () => {
    const response = await testRoute('/api/v1/evaluations', {
      method: 'POST',
      body: {
        agentId: 'invalid-format',
      },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid JSON body', async () => {
    const response = await testRoute('/api/v1/evaluations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json' as unknown,
    });

    expect(response.status).toBe(400);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/evaluations', {
      method: 'POST',
      body: { agentId: '11155111:123' },
      skipAuth: true,
    });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/agents/:agentId/evaluations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns evaluations for specific agent', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('11155111:1', { overall_score: 75 });
    await insertMockEvaluation('11155111:2', { overall_score: 65 });

    const response = await testRoute('/api/v1/agents/11155111:1/evaluations');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.data.every((e: { agentId: string }) => e.agentId === '11155111:1')).toBe(true);
  });

  it('returns empty array when agent has no evaluations', async () => {
    const response = await testRoute('/api/v1/agents/11155111:999/evaluations');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('returns 400 for invalid agent ID format', async () => {
    const response = await testRoute('/api/v1/agents/invalid-format/evaluations');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('supports pagination with limit and cursor', async () => {
    await insertMockEvaluation('11155111:1', { overall_score: 85 });
    await insertMockEvaluation('11155111:1', { overall_score: 75 });
    await insertMockEvaluation('11155111:1', { overall_score: 65 });

    // First page
    const response1 = await testRoute('/api/v1/agents/11155111:1/evaluations?limit=2');
    const body1 = await response1.json();
    expect(body1.data.length).toBe(2);
    expect(body1.meta.hasMore).toBe(true);

    // Second page
    const response2 = await testRoute(
      `/api/v1/agents/11155111:1/evaluations?limit=2&cursor=${body1.meta.nextCursor}`
    );
    const body2 = await response2.json();
    expect(body2.data.length).toBe(1);
    expect(body2.meta.hasMore).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1/evaluations', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});
