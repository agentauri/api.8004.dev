/**
 * Agent health route integration tests
 * @module test/integration/routes/health-agent
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  insertMockReliability,
  mockHealthyResponse,
  setupMockFetch,
  testRoute,
} from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/agents/:agentId/health', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns health status for agent with reliability data', async () => {
    await insertMockReliability('11155111:1');

    const response = await testRoute('/api/v1/agents/11155111:1/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.agentId).toBe('11155111:1');
    expect(body.data.status).toBeDefined();
    expect(body.data.uptimePercentage).toBeDefined();
  });

  it('returns unknown status for agent without reliability data', async () => {
    const response = await testRoute('/api/v1/agents/11155111:999/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('unknown');
    expect(body.data.uptimePercentage).toBe(0);
    expect(body.data.mcp).toBeNull();
    expect(body.data.a2a).toBeNull();
  });

  it('returns healthy status for agent with high success rate', async () => {
    await insertMockReliability('11155111:1', {
      mcp_success_count: 100,
      mcp_failure_count: 5, // 95% success rate
      a2a_success_count: 90,
      a2a_failure_count: 10, // 90% success rate
    });

    const response = await testRoute('/api/v1/agents/11155111:1/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe('healthy');
    expect(body.data.mcp.status).toBe('healthy');
    expect(body.data.a2a.status).toBe('healthy');
  });

  it('returns degraded status for agent with medium success rate', async () => {
    await insertMockReliability('11155111:2', {
      mcp_success_count: 70,
      mcp_failure_count: 30, // 70% success rate
      a2a_success_count: 0,
      a2a_failure_count: 0, // No A2A data
    });

    const response = await testRoute('/api/v1/agents/11155111:2/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe('degraded');
    expect(body.data.mcp.status).toBe('degraded');
    expect(body.data.a2a).toBeNull();
  });

  it('returns unhealthy status for agent with low success rate', async () => {
    await insertMockReliability('11155111:3', {
      mcp_success_count: 30,
      mcp_failure_count: 70, // 30% success rate
      a2a_success_count: 20,
      a2a_failure_count: 80, // 20% success rate
    });

    const response = await testRoute('/api/v1/agents/11155111:3/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe('unhealthy');
    expect(body.data.mcp.status).toBe('unhealthy');
    expect(body.data.a2a.status).toBe('unhealthy');
  });

  it('returns correct structure for mcp and a2a health', async () => {
    await insertMockReliability('11155111:4', {
      mcp_latency_ms: 120,
      mcp_success_count: 100,
      mcp_failure_count: 10,
      a2a_latency_ms: 200,
      a2a_success_count: 80,
      a2a_failure_count: 20,
    });

    const response = await testRoute('/api/v1/agents/11155111:4/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.mcp).toHaveProperty('status');
    expect(body.data.mcp).toHaveProperty('latencyMs');
    expect(body.data.mcp).toHaveProperty('successRate');
    expect(body.data.mcp).toHaveProperty('lastChecked');
    expect(body.data.a2a).toHaveProperty('status');
    expect(body.data.a2a).toHaveProperty('latencyMs');
    expect(body.data.a2a).toHaveProperty('successRate');
    expect(body.data.a2a).toHaveProperty('lastChecked');
  });

  it('calculates uptime percentage as average of active protocols', async () => {
    await insertMockReliability('11155111:5', {
      mcp_success_count: 90,
      mcp_failure_count: 10, // 90% success rate
      a2a_success_count: 80,
      a2a_failure_count: 20, // 80% success rate
    });

    const response = await testRoute('/api/v1/agents/11155111:5/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    // Should be average of 90% and 80% = 85%
    expect(body.data.uptimePercentage).toBe(85);
  });

  it('returns 400 for invalid agent ID format', async () => {
    const response = await testRoute('/api/v1/agents/invalid-format/health');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1/health', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});
