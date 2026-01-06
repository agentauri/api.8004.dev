/**
 * Trending route integration tests
 * @module test/integration/routes/trending
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

describe('GET /api/v1/trending', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns graceful message when no historical data exists', async () => {
    const response = await testRoute('/api/v1/trending');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.dataAvailable).toBe(false);
    expect(body.meta.message).toBeDefined();
  });

  it('returns trending agents with correct structure when data available', async () => {
    // Setup: current reputation
    await insertMockReputation('11155111:1', { average_score: 85, feedback_count: 10 });
    await insertMockReputation('11155111:2', { average_score: 70, feedback_count: 8 });

    // Setup: historical snapshot from 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0] as string;

    await insertMockReputationHistory('11155111:1', dateStr, {
      reputation_score: 60,
      feedback_count: 5,
    });
    await insertMockReputationHistory('11155111:2', dateStr, {
      reputation_score: 80,
      feedback_count: 5,
    });
    await updateMockSnapshotState(dateStr);

    const response = await testRoute('/api/v1/trending?period=7d');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.dataAvailable).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Check structure
    const entry = body.data[0];
    expect(entry).toHaveProperty('agent');
    expect(entry).toHaveProperty('currentScore');
    expect(entry).toHaveProperty('previousScore');
    expect(entry).toHaveProperty('change');
    expect(entry).toHaveProperty('changePercent');
    expect(entry).toHaveProperty('trend');
    expect(entry.agent).toHaveProperty('id');
    expect(entry.agent).toHaveProperty('name');
    expect(entry.agent).toHaveProperty('chainId');
  });

  it('sorts by absolute change (biggest movers first)', async () => {
    // Current reputation
    await insertMockReputation('11155111:1', { average_score: 85, feedback_count: 10 });
    await insertMockReputation('11155111:2', { average_score: 50, feedback_count: 8 });

    // Historical: agent 1 went up 25, agent 2 went down 30
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0] as string;

    await insertMockReputationHistory('11155111:1', dateStr, { reputation_score: 60 });
    await insertMockReputationHistory('11155111:2', dateStr, { reputation_score: 80 });
    await updateMockSnapshotState(dateStr);

    const response = await testRoute('/api/v1/trending?period=7d');
    const body = await response.json();

    // Agent 2 had bigger absolute change (-30) than agent 1 (+25)
    expect(Math.abs(body.data[0].change)).toBeGreaterThanOrEqual(Math.abs(body.data[1].change));
  });

  it('calculates trend direction correctly', async () => {
    await insertMockReputation('11155111:1', { average_score: 85, feedback_count: 10 });
    await insertMockReputation('11155111:2', { average_score: 50, feedback_count: 8 });
    await insertMockReputation('11155111:3', { average_score: 70, feedback_count: 6 });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0] as string;

    // Agent 1: up from 60 to 85
    await insertMockReputationHistory('11155111:1', dateStr, { reputation_score: 60 });
    // Agent 2: down from 80 to 50
    await insertMockReputationHistory('11155111:2', dateStr, { reputation_score: 80 });
    // Agent 3: stable (70.5 to 70)
    await insertMockReputationHistory('11155111:3', dateStr, { reputation_score: 70.5 });
    await updateMockSnapshotState(dateStr);

    const response = await testRoute('/api/v1/trending?period=7d');
    const body = await response.json();

    const agent1 = body.data.find((e: { agent: { id: string } }) => e.agent.id === '11155111:1');
    const agent2 = body.data.find((e: { agent: { id: string } }) => e.agent.id === '11155111:2');
    const agent3 = body.data.find((e: { agent: { id: string } }) => e.agent.id === '11155111:3');

    expect(agent1.trend).toBe('up');
    expect(agent2.trend).toBe('down');
    expect(agent3.trend).toBe('stable');
  });

  it('supports period=24h', async () => {
    const response = await testRoute('/api/v1/trending?period=24h');

    const body = await response.json();
    expect(body.meta.period).toBe('24h');
  });

  it('supports period=7d (default)', async () => {
    const response = await testRoute('/api/v1/trending');

    const body = await response.json();
    expect(body.meta.period).toBe('7d');
  });

  it('supports period=30d', async () => {
    const response = await testRoute('/api/v1/trending?period=30d');

    const body = await response.json();
    expect(body.meta.period).toBe('30d');
  });

  it('respects limit parameter', async () => {
    // Setup multiple agents with history
    await insertMockReputation('11155111:1', { average_score: 90, feedback_count: 10 });
    await insertMockReputation('11155111:2', { average_score: 80, feedback_count: 8 });
    await insertMockReputation('11155111:3', { average_score: 70, feedback_count: 6 });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0] as string;

    await insertMockReputationHistory('11155111:1', dateStr, { reputation_score: 60 });
    await insertMockReputationHistory('11155111:2', dateStr, { reputation_score: 50 });
    await insertMockReputationHistory('11155111:3', dateStr, { reputation_score: 40 });
    await updateMockSnapshotState(dateStr);

    const response = await testRoute('/api/v1/trending?period=7d&limit=2');

    const body = await response.json();
    expect(body.data.length).toBe(2);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/trending', { skipAuth: true });
    expect(response.status).toBe(401);
  });

  // Note: Request ID and security headers are tested in index.test.ts

  it('returns validation error for invalid period', async () => {
    const response = await testRoute('/api/v1/trending?period=invalid');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
