/**
 * Leaderboard route integration tests
 * @module test/integration/routes/leaderboard
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  insertMockReputation,
  insertMockReputationHistory,
  mockHealthyResponse,
  setupMockFetch,
  testRoute,
  updateMockSnapshotState,
} from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/leaderboard', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns empty leaderboard when no reputation data exists', async () => {
    const response = await testRoute('/api/v1/leaderboard');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('returns leaderboard entries with correct structure', async () => {
    await insertMockReputation('11155111:1', { average_score: 90 });
    await insertMockReputation('11155111:2', { average_score: 75 });

    const response = await testRoute('/api/v1/leaderboard');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);

    // Check structure
    const entry = body.data[0];
    expect(entry).toHaveProperty('rank');
    expect(entry).toHaveProperty('agent');
    expect(entry).toHaveProperty('reputation');
    expect(entry).toHaveProperty('feedbackCount');
    expect(entry).toHaveProperty('trend');
    expect(entry.agent).toHaveProperty('id');
    expect(entry.agent).toHaveProperty('name');
    expect(entry.agent).toHaveProperty('chainId');
  });

  it('ranks agents by reputation score descending', async () => {
    await insertMockReputation('11155111:1', { average_score: 50 });
    await insertMockReputation('11155111:2', { average_score: 90 });
    await insertMockReputation('11155111:3', { average_score: 70 });

    const response = await testRoute('/api/v1/leaderboard');

    const body = await response.json();
    expect(body.data[0].reputation).toBeGreaterThanOrEqual(body.data[1].reputation);
    expect(body.data[1].reputation).toBeGreaterThanOrEqual(body.data[2].reputation);
    expect(body.data[0].rank).toBe(1);
    expect(body.data[1].rank).toBe(2);
    expect(body.data[2].rank).toBe(3);
  });

  it('calculates trend from historical data', async () => {
    // Current reputation
    await insertMockReputation('11155111:1', { average_score: 80, feedback_count: 10 });

    // Historical snapshot from 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0] as string;

    await insertMockReputationHistory('11155111:1', dateStr, {
      reputation_score: 60,
      feedback_count: 5,
    });
    await updateMockSnapshotState(dateStr);

    const response = await testRoute('/api/v1/leaderboard?period=7d');

    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].trend).toBe('up');
  });

  it('supports period=all (no historical comparison)', async () => {
    await insertMockReputation('11155111:1', { average_score: 80 });

    const response = await testRoute('/api/v1/leaderboard?period=all');

    const body = await response.json();
    expect(body.meta.period).toBe('all');
  });

  it('supports period=30d', async () => {
    await insertMockReputation('11155111:1', { average_score: 80 });

    const response = await testRoute('/api/v1/leaderboard?period=30d');

    const body = await response.json();
    expect(body.meta.period).toBe('30d');
  });

  it('supports period=7d', async () => {
    await insertMockReputation('11155111:1', { average_score: 80 });

    const response = await testRoute('/api/v1/leaderboard?period=7d');

    const body = await response.json();
    expect(body.meta.period).toBe('7d');
  });

  it('supports period=24h', async () => {
    await insertMockReputation('11155111:1', { average_score: 80 });

    const response = await testRoute('/api/v1/leaderboard?period=24h');

    const body = await response.json();
    expect(body.meta.period).toBe('24h');
  });

  it('respects limit parameter', async () => {
    await insertMockReputation('11155111:1', { average_score: 90 });
    await insertMockReputation('11155111:2', { average_score: 80 });
    await insertMockReputation('11155111:3', { average_score: 70 });

    const response = await testRoute('/api/v1/leaderboard?limit=2');

    const body = await response.json();
    expect(body.data.length).toBe(2);
    expect(body.meta.hasMore).toBe(true);
  });

  it('supports cursor-based pagination', async () => {
    await insertMockReputation('11155111:1', { average_score: 90 });
    await insertMockReputation('11155111:2', { average_score: 80 });
    await insertMockReputation('11155111:3', { average_score: 70 });

    // First page
    const response1 = await testRoute('/api/v1/leaderboard?limit=2');
    const body1 = await response1.json();
    expect(body1.data.length).toBe(2);
    expect(body1.meta.nextCursor).toBeDefined();

    // Second page
    const response2 = await testRoute(
      `/api/v1/leaderboard?limit=2&cursor=${body1.meta.nextCursor}`
    );
    const body2 = await response2.json();
    expect(body2.data.length).toBe(1);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/leaderboard', { skipAuth: true });
    expect(response.status).toBe(401);
  });

  // Note: Request ID and security headers are tested in index.test.ts

  it('returns validation error for invalid period', async () => {
    const response = await testRoute('/api/v1/leaderboard?period=invalid');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
