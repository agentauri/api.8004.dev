/**
 * Classification route integration tests
 * @module test/integration/routes/classify
 */

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  insertMockClassification,
  mockHealthyResponse,
  setupMockFetch,
  testRoute,
} from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/agents/:agentId/classify', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns classification when exists', async () => {
    await insertMockClassification('11155111:1');

    const response = await testRoute('/api/v1/agents/11155111:1/classify');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.skills).toBeDefined();
    expect(body.data.domains).toBeDefined();
    expect(body.data.confidence).toBeDefined();
    expect(body.data.modelVersion).toBeDefined();
  });

  it('returns 404 when classification does not exist', async () => {
    const response = await testRoute('/api/v1/agents/11155111:999/classify');

    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 202 when classification is pending', async () => {
    // Insert a pending queue entry
    await env.DB.prepare(
      `INSERT INTO classification_queue (id, agent_id, status)
       VALUES (?, ?, ?)`
    )
      .bind('queue-id-1', '11155111:2', 'pending')
      .run();

    const response = await testRoute('/api/v1/agents/11155111:2/classify');

    expect(response.status).toBe(202);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('pending');
    expect(body.estimatedTime).toBeDefined();
  });

  it('returns 202 when classification is processing', async () => {
    await env.DB.prepare(
      `INSERT INTO classification_queue (id, agent_id, status)
       VALUES (?, ?, ?)`
    )
      .bind('queue-id-2', '11155111:3', 'processing')
      .run();

    const response = await testRoute('/api/v1/agents/11155111:3/classify');

    expect(response.status).toBe(202);

    const body = await response.json();
    expect(body.status).toBe('processing');
  });
});

describe('POST /api/v1/agents/:agentId/classify', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('queues classification for new agent', async () => {
    const response = await testRoute('/api/v1/agents/11155111:100/classify', {
      method: 'POST',
      body: {},
    });

    expect(response.status).toBe(202);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('queued');
    expect(body.agentId).toBe('11155111:100');
  });

  it('returns already_classified when exists and force is false', async () => {
    await insertMockClassification('11155111:101');

    const response = await testRoute('/api/v1/agents/11155111:101/classify', {
      method: 'POST',
      body: { force: false },
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('already_classified');
  });

  it('queues re-classification when force is true', async () => {
    await insertMockClassification('11155111:102');

    const response = await testRoute('/api/v1/agents/11155111:102/classify', {
      method: 'POST',
      body: { force: true },
    });

    expect(response.status).toBe(202);

    const body = await response.json();
    expect(body.status).toBe('queued');
  });

  it('returns 202 when already queued', async () => {
    await env.DB.prepare(
      `INSERT INTO classification_queue (id, agent_id, status)
       VALUES (?, ?, ?)`
    )
      .bind('queue-id-3', '11155111:103', 'pending')
      .run();

    const response = await testRoute('/api/v1/agents/11155111:103/classify', {
      method: 'POST',
      body: {},
    });

    expect(response.status).toBe(202);

    const body = await response.json();
    expect(body.status).toBe('pending');
  });

  it('handles request without body', async () => {
    const response = await testRoute('/api/v1/agents/11155111:104/classify', {
      method: 'POST',
    });

    expect(response.status).toBe(202);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('queued');
  });
});
