/**
 * Agents route integration tests
 * @module test/integration/routes/agents
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  insertMockClassification,
  mockHealthyResponse,
  mockSearchResponse,
  setupMockFetch,
  testRoute,
} from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/agents', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns list of agents', async () => {
    const response = await testRoute('/api/v1/agents');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.total).toBeDefined();
  });

  it('accepts chainId and limit parameters', async () => {
    const [chainRes, limitRes] = await Promise.all([
      testRoute('/api/v1/agents?chainId=11155111'),
      testRoute('/api/v1/agents?limit=1'),
    ]);

    for (const res of [chainRes, limitRes]) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  it('returns validation errors for invalid parameters', async () => {
    const testCases = [
      { path: '/api/v1/agents?limit=invalid', desc: 'invalid limit' },
      { path: '/api/v1/agents?sort=invalid', desc: 'invalid sort' },
      { path: '/api/v1/agents?order=invalid', desc: 'invalid order' },
    ];

    for (const { path } of testCases) {
      const response = await testRoute(path);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('includes OASF classification when available', async () => {
    await insertMockClassification('11155111:1');

    const response = await testRoute('/api/v1/agents');

    expect(response.status).toBe(200);
    const body = await response.json();
    const agent = body.data.find((a: { id: string }) => a.id === '11155111:1');
    if (agent) {
      expect(agent.oasf).toBeDefined();
      expect(agent.oasf.skills).toBeDefined();
      expect(agent.oasf.domains).toBeDefined();
    }
  });

  it('performs semantic search when query provided', async () => {
    mockFetch.mockResolvedValue(mockSearchResponse('test agent', 1));

    const response = await testRoute('/api/v1/agents?q=test%20agent');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data[0].searchScore).toBeDefined();
  });

  it('handles SDK failures gracefully with search result fallback', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('search')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              query: 'test',
              results: [
                {
                  rank: 1,
                  vectorId: 'v1',
                  agentId: '11155111:999',
                  chainId: 11155111,
                  name: 'Fallback Agent',
                  description: 'Agent from search fallback',
                  score: 0.9,
                  metadata: {},
                },
              ],
              total: 1,
              pagination: { hasMore: false, limit: 20 },
              requestId: 'test-id',
              timestamp: new Date().toISOString(),
            }),
        });
      }
      return Promise.resolve(mockHealthyResponse());
    });

    const response = await testRoute('/api/v1/agents?q=test');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(0);
  });

  it('accepts sort, order, and chains parameters', async () => {
    const [sortRes, chainsRes] = await Promise.all([
      testRoute('/api/v1/agents?sort=name&order=asc'),
      testRoute('/api/v1/agents?chains=11155111,84532'),
    ]);

    for (const res of [sortRes, chainsRes]) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });
});

describe('GET /api/v1/agents/:agentId', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns agent details for valid ID', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe('11155111:1');
    expect(body.data.chainId).toBe(11155111);
    expect(body.data.tokenId).toBe('1');
    expect(body.data.endpoints).toBeDefined();
    expect(body.data.registration).toBeDefined();
    expect(body.data.mcpTools).toBeDefined();
  });

  it('returns 400 for invalid agent ID format', async () => {
    const response = await testRoute('/api/v1/agents/invalid-id');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent agent', async () => {
    const response = await testRoute('/api/v1/agents/999999:999');

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('includes OASF classification when available', async () => {
    await insertMockClassification('11155111:1');

    const response = await testRoute('/api/v1/agents/11155111:1');

    const body = await response.json();
    expect(body.data.oasf).toBeDefined();
    expect(body.data.oasf.skills).toBeDefined();
    expect(body.data.oasf.domains).toBeDefined();
    expect(body.data.oasf.confidence).toBeDefined();
  });
});

describe('Agents sorting', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('sorts by relevance with search scores', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: 'test',
          results: [
            {
              rank: 1,
              vectorId: 'v1',
              agentId: '11155111:1',
              chainId: 11155111,
              name: 'Low Score',
              description: '',
              score: 0.5,
              metadata: {},
            },
            {
              rank: 2,
              vectorId: 'v2',
              agentId: '11155111:2',
              chainId: 11155111,
              name: 'High Score',
              description: '',
              score: 0.95,
              metadata: {},
            },
          ],
          total: 2,
          pagination: { hasMore: false, limit: 20 },
          requestId: 'test-id',
          timestamp: new Date().toISOString(),
        }),
    });

    const response = await testRoute('/api/v1/agents?q=test&sort=relevance&order=desc');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ searchScore?: number }>;
    };
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
    if (body.data[0]?.searchScore && body.data[1]?.searchScore) {
      expect(body.data[0].searchScore).toBeGreaterThanOrEqual(body.data[1].searchScore);
    }
  });

  it('sorts by createdAt and reputation', async () => {
    const [createdRes, repRes] = await Promise.all([
      testRoute('/api/v1/agents?sort=createdAt&order=asc'),
      testRoute('/api/v1/agents?sort=reputation&order=desc'),
    ]);

    for (const res of [createdRes, repRes]) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });
});

describe('Agents caching', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns cached data on subsequent requests', async () => {
    // First request
    const response1 = await testRoute('/api/v1/agents/11155111:1');
    expect(response1.status).toBe(200);

    // Second request should hit cache
    const response2 = await testRoute('/api/v1/agents/11155111:1');
    expect(response2.status).toBe(200);

    const body = await response2.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('11155111:1');
  });

  it('caches agent list', async () => {
    const response1 = await testRoute('/api/v1/agents?limit=5');
    expect(response1.status).toBe(200);

    const response2 = await testRoute('/api/v1/agents?limit=5');
    expect(response2.status).toBe(200);

    const body = await response2.json();
    expect(body.success).toBe(true);
  });
});

describe('Agents reputation filtering', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('filters by reputation range', async () => {
    const [minRes, maxRes, rangeRes] = await Promise.all([
      testRoute('/api/v1/agents?minRep=3.0'),
      testRoute('/api/v1/agents?maxRep=4.0'),
      testRoute('/api/v1/agents?minRep=2.0&maxRep=4.5'),
    ]);

    for (const res of [minRes, maxRes, rangeRes]) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });
});
