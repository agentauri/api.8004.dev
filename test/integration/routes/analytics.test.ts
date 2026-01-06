/**
 * Analytics route integration tests
 * @module test/integration/routes/analytics
 */

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/analytics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns analytics summary for default period', async () => {
    const response = await testRoute('/api/v1/analytics');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.period).toBe('day');
    expect(body.data.periodStart).toBeDefined();
    expect(body.data.periodEnd).toBeDefined();
    expect(body.data.platformStats).toBeDefined();
    expect(body.data.popularFilters).toBeDefined();
    expect(body.data.topEndpoints).toBeDefined();
    expect(body.data.searchVolume).toBeDefined();
    expect(body.data.chainActivity).toBeDefined();
  });

  it('accepts period parameter', async () => {
    const response = await testRoute('/api/v1/analytics?period=week');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.period).toBe('week');
  });

  it('returns 400 for invalid period', async () => {
    const response = await testRoute('/api/v1/analytics?period=invalid');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/analytics', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/analytics/stats', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns platform statistics', async () => {
    const response = await testRoute('/api/v1/analytics/stats');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.totalAgents).toBeDefined();
    expect(body.data.activeAgents).toBeDefined();
    expect(body.data.totalSearches).toBeDefined();
    expect(body.data.totalClassifications).toBeDefined();
    expect(body.data.totalFeedback).toBeDefined();
    expect(body.data.chainDistribution).toBeDefined();
    expect(body.data.protocolAdoption).toBeDefined();
    expect(body.data.protocolAdoption.mcp).toBeDefined();
    expect(body.data.protocolAdoption.a2a).toBeDefined();
    expect(body.data.protocolAdoption.x402).toBeDefined();
  });

  it('returns counts from classifications', async () => {
    // Add a classification
    await env.DB.exec(
      "INSERT INTO agent_classifications (id, agent_id, chain_id, skills, domains, confidence, model_version, classified_at) VALUES ('test1', '11155111:1', 11155111, '[]', '[]', 0.9, 'test-model', datetime('now'))"
    );

    const response = await testRoute('/api/v1/analytics/stats');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.totalClassifications).toBe(1);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/analytics/stats', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/analytics/filters', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns popular filters', async () => {
    const response = await testRoute('/api/v1/analytics/filters');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.period).toBe('day');
    expect(body.meta.limit).toBe(20);
  });

  it('accepts period and limit parameters', async () => {
    const response = await testRoute('/api/v1/analytics/filters?period=week&limit=10');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.period).toBe('week');
    expect(body.meta.limit).toBe(10);
  });

  it('returns recorded filter usage', async () => {
    // Record some filter usage
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const periodStart = now.toISOString().replace('T', ' ').substring(0, 19);

    await env.DB.exec(
      `INSERT INTO analytics_filters (id, filter_name, filter_value, usage_count, period, period_start) VALUES ('f1', 'chainIds', '11155111', 5, 'day', '${periodStart}')`
    );

    const response = await testRoute('/api/v1/analytics/filters?period=day');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].filterName).toBe('chainIds');
    expect(body.data[0].usageCount).toBe(5);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/analytics/filters', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/analytics/endpoints', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns top endpoints', async () => {
    const response = await testRoute('/api/v1/analytics/endpoints');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.period).toBe('day');
    expect(body.meta.limit).toBe(20);
  });

  it('returns recorded API usage', async () => {
    // Record some API usage
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const periodStart = now.toISOString().replace('T', ' ').substring(0, 19);

    await env.DB.exec(
      `INSERT INTO analytics_api_usage (id, endpoint, method, status_code, latency_ms, period, period_start, request_count) VALUES ('u1', '/api/v1/agents', 'GET', 200, 50, 'hour', '${periodStart}', 10)`
    );

    const response = await testRoute('/api/v1/analytics/endpoints?period=day');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].endpoint).toBe('/api/v1/agents');
    expect(body.data[0].requestCount).toBe(10);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/analytics/endpoints', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/analytics/search', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns search volume statistics', async () => {
    const response = await testRoute('/api/v1/analytics/search');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBeDefined();
    expect(body.data.avgLatencyMs).toBeDefined();
    expect(body.data.avgResultCount).toBeDefined();
    expect(body.meta.period).toBe('day');
  });

  it('returns recorded search statistics', async () => {
    // Record some searches
    await env.DB.exec(
      "INSERT INTO analytics_search (id, query_hash, query_text, result_count, latency_ms, created_at) VALUES ('s1', 'hash1', 'test query', 10, 100, datetime('now'))"
    );
    await env.DB.exec(
      "INSERT INTO analytics_search (id, query_hash, query_text, result_count, latency_ms, created_at) VALUES ('s2', 'hash2', 'another query', 20, 200, datetime('now'))"
    );

    const response = await testRoute('/api/v1/analytics/search?period=day');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.total).toBe(2);
    expect(body.data.avgLatencyMs).toBe(150);
    expect(body.data.avgResultCount).toBe(15);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/analytics/search', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/analytics/chains', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns chain activity', async () => {
    const response = await testRoute('/api/v1/analytics/chains');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data).toBe('object');
    expect(body.meta.period).toBe('day');
  });

  it('returns activity breakdown by chain', async () => {
    // Add data for multiple chains
    await env.DB.exec(
      "INSERT INTO agent_classifications (id, agent_id, chain_id, skills, domains, confidence, model_version, classified_at) VALUES ('c1', '11155111:1', 11155111, '[]', '[]', 0.9, 'test', datetime('now'))"
    );
    await env.DB.exec(
      "INSERT INTO agent_classifications (id, agent_id, chain_id, skills, domains, confidence, model_version, classified_at) VALUES ('c2', '84532:1', 84532, '[]', '[]', 0.9, 'test', datetime('now'))"
    );
    await env.DB.exec(
      "INSERT INTO agent_feedback (id, agent_id, chain_id, score, submitter, submitted_at) VALUES ('f1', '11155111:1', 11155111, 80, '0x123', datetime('now'))"
    );

    const response = await testRoute('/api/v1/analytics/chains?period=day');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data['11155111']).toBeDefined();
    expect(body.data['11155111'].agents).toBe(1);
    expect(body.data['11155111'].feedback).toBe(1);
    expect(body.data['84532']).toBeDefined();
    expect(body.data['84532'].agents).toBe(1);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/analytics/chains', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/analytics/history/:metricType', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns historical metrics', async () => {
    const response = await testRoute('/api/v1/analytics/history/agents');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.metricType).toBe('agents');
    expect(body.meta.period).toBe('day'); // Default period is 'day'
  });

  it('returns stored historical data', async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const periodStart = now.toISOString().replace('T', ' ').substring(0, 19);
    now.setDate(now.getDate() + 1);
    const periodEnd = now.toISOString().replace('T', ' ').substring(0, 19);

    // Insert with period='day' to match default query
    await env.DB.exec(
      `INSERT INTO analytics_metrics (id, metric_type, period, period_start, period_end, chain_id, data) VALUES ('m1', 'agents', 'day', '${periodStart}', '${periodEnd}', 11155111, '{"total": 10, "mcpEnabled": 5}')`
    );

    const response = await testRoute('/api/v1/analytics/history/agents?chainId=11155111');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].metricType).toBe('agents');
    expect(body.data[0].chainId).toBe(11155111);
    expect(body.data[0].data.total).toBe(10);
  });

  it('returns 400 for invalid metric type', async () => {
    const response = await testRoute('/api/v1/analytics/history/invalid');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('accepts period parameter', async () => {
    const response = await testRoute('/api/v1/analytics/history/search?period=day');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.period).toBe('day');
  });

  it('accepts limit parameter', async () => {
    const response = await testRoute('/api/v1/analytics/history/agents?limit=50');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/analytics/history/agents', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});
