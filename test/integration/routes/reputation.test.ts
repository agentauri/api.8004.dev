/**
 * Reputation route integration tests
 * @module test/integration/routes/reputation
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  insertMockFeedback,
  insertMockReputation,
  insertMockReputationHistory,
  mockHealthyResponse,
  setupMockFetch,
  testRoute,
} from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/agents/:agentId/reputation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns reputation and feedback when they exist', async () => {
    await insertMockReputation('11155111:1');
    await insertMockFeedback('11155111:1', { score: 80 });
    await insertMockFeedback('11155111:1', { score: 70, eas_uid: 'uid-1' });

    const response = await testRoute('/api/v1/agents/11155111:1/reputation');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.agentId).toBe('11155111:1');
    expect(body.data.reputation).toBeDefined();
    expect(body.data.reputation.count).toBe(5); // From mock reputation
    expect(body.data.reputation.averageScore).toBe(72.5);
    expect(body.data.recentFeedback).toBeDefined();
    expect(body.data.recentFeedback.length).toBe(2);
  });

  it('returns empty reputation for non-existent agent', async () => {
    const response = await testRoute('/api/v1/agents/11155111:999/reputation');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.agentId).toBe('11155111:999');
    expect(body.data.reputation.count).toBe(0);
    expect(body.data.reputation.averageScore).toBe(0);
    expect(body.data.recentFeedback).toEqual([]);
  });

  it('returns reputation without feedback when only reputation exists', async () => {
    await insertMockReputation('11155111:2');

    const response = await testRoute('/api/v1/agents/11155111:2/reputation');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.reputation.count).toBe(5);
    expect(body.data.recentFeedback).toEqual([]);
  });
});

describe('GET /api/v1/agents/:agentId/reputation/feedback', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns paginated feedback list', async () => {
    // Insert multiple feedback entries
    for (let i = 0; i < 5; i++) {
      await insertMockFeedback('11155111:1', {
        score: 60 + i * 10,
        eas_uid: `uid-${i}`,
        submitted_at: new Date(Date.now() - i * 1000).toISOString(),
      });
    }

    const response = await testRoute('/api/v1/agents/11155111:1/reputation/feedback?limit=3');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(3);
    expect(body.meta.limit).toBe(3);
  });

  it('returns empty array for agent without feedback', async () => {
    const response = await testRoute('/api/v1/agents/11155111:999/reputation/feedback');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('uses default limit when not specified', async () => {
    await insertMockFeedback('11155111:3');

    const response = await testRoute('/api/v1/agents/11155111:3/reputation/feedback');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta.limit).toBe(20);
  });

  it('caps limit at 100', async () => {
    const response = await testRoute('/api/v1/agents/11155111:4/reputation/feedback?limit=200');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta.limit).toBe(100);
  });

  it('enforces minimum limit of 1', async () => {
    const response = await testRoute('/api/v1/agents/11155111:5/reputation/feedback?limit=0');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta.limit).toBe(1);
  });
});

describe('GET /api/v1/agents/:agentId/reputation/history', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns reputation history with correct structure', async () => {
    // Insert history data points
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0] ?? '';
    await insertMockReputationHistory('11155111:1', todayStr, {
      reputation_score: 85,
      feedback_count: 10,
    });

    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0] ?? '';
    await insertMockReputationHistory('11155111:1', yesterdayStr, {
      reputation_score: 80,
      feedback_count: 8,
    });

    const response = await testRoute('/api/v1/agents/11155111:1/reputation/history');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    // Check structure of data points
    const dataPoint = body.data[0];
    expect(dataPoint).toHaveProperty('date');
    expect(dataPoint).toHaveProperty('reputationScore');
    expect(dataPoint).toHaveProperty('feedbackCount');
  });

  it('returns empty array when no history exists', async () => {
    const response = await testRoute('/api/v1/agents/11155111:999/reputation/history');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.dataPoints).toBe(0);
  });

  it('uses default period of 30d', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1/reputation/history');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.period).toBe('30d');
  });

  it('respects period parameter 7d', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1/reputation/history?period=7d');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.period).toBe('7d');
  });

  it('respects period parameter 90d', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1/reputation/history?period=90d');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.period).toBe('90d');
  });

  it('respects period parameter 1y', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1/reputation/history?period=1y');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.period).toBe('1y');
  });

  it('returns 400 for invalid period', async () => {
    const response = await testRoute(
      '/api/v1/agents/11155111:1/reputation/history?period=invalid'
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('includes correct meta information', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1/reputation/history?period=7d');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta).toHaveProperty('agentId', '11155111:1');
    expect(body.meta).toHaveProperty('period', '7d');
    expect(body.meta).toHaveProperty('startDate');
    expect(body.meta).toHaveProperty('endDate');
    expect(body.meta).toHaveProperty('dataPoints');
  });
});
