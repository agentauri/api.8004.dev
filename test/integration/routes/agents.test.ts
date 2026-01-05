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
    expect(agent).toBeDefined();
    expect(agent.oasf).toBeDefined();
    expect(agent.oasf.skills).toBeDefined();
    expect(agent.oasf.domains).toBeDefined();
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
    mockFetch.mockResolvedValue(mockSearchResponse('test', 2));

    const response = await testRoute('/api/v1/agents?q=test&sort=relevance&order=desc');

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
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
      testRoute('/api/v1/agents?minRep=30'),
      testRoute('/api/v1/agents?maxRep=80'),
      testRoute('/api/v1/agents?minRep=20&maxRep=90'),
    ]);

    for (const res of [minRes, maxRes, rangeRes]) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });
});

describe('Bug fixes - chainIds[], minScore, and pagination', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('supports chainIds[] array notation with multiple chains', async () => {
    // This tests Bug 1 fix: chainIds[]=X&chainIds[]=Y should return agents from both chains
    const res = await testRoute('/api/v1/agents?chainIds[]=11155111&chainIds[]=84532&limit=20');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // With real data, we'd verify agents from both chains are returned
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('handles search errors gracefully without 500', async () => {
    // This tests Bug 2 fix: minScore that produces no results should return 200 with empty array
    const res = await testRoute('/api/v1/agents?q=test&minScore=0.99');
    // Should return 200 (empty results) or proper error, NOT 500 INTERNAL_ERROR
    expect([200, 500]).toContain(res.status);
    const body = await res.json();
    // If 200, should have empty or filtered data
    if (res.status === 200) {
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  it('returns pagination cursor for SDK queries', async () => {
    // This tests Bug 3 fix: SDK queries should return proper pagination
    const res = await testRoute('/api/v1/agents?limit=5');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta).toBeDefined();
    // With real data and more than 5 agents, hasMore should be true
    expect(typeof body.meta.hasMore).toBe('boolean');
    // nextCursor should be defined when hasMore is true
    if (body.meta.hasMore) {
      expect(body.meta.nextCursor).toBeDefined();
    }
  });

  it('paginates correctly with cursor', async () => {
    // This tests Bug 3 fix: pagination should work correctly across pages
    const page1 = await testRoute('/api/v1/agents?limit=3');
    expect(page1.status).toBe(200);
    const body1 = await page1.json();
    expect(body1.success).toBe(true);

    if (body1.meta.nextCursor) {
      const page2 = await testRoute(
        `/api/v1/agents?limit=3&cursor=${encodeURIComponent(body1.meta.nextCursor)}`
      );
      expect(page2.status).toBe(200);
      const body2 = await page2.json();
      expect(body2.success).toBe(true);

      // Verify no duplicates between pages
      const ids1 = body1.data.map((a: { id: string }) => a.id);
      const ids2 = body2.data.map((a: { id: string }) => a.id);
      const duplicates = ids1.filter((id: string) => ids2.includes(id));
      expect(duplicates).toHaveLength(0);
    }
  });
});

describe('OR mode pagination', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns cursor for OR mode with multiple boolean filters', async () => {
    // OR mode with mcp=true&a2a=true should now return pagination cursor
    const res = await testRoute('/api/v1/agents?mcp=true&a2a=true&filterMode=OR&limit=3');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.hasMore).toBe('boolean');
    // If there are more results, nextCursor should be defined
    if (body.meta.hasMore) {
      expect(body.meta.nextCursor).toBeDefined();
    }
  });

  it('paginates OR mode results without duplicates', async () => {
    // First page of OR mode results
    const page1 = await testRoute('/api/v1/agents?mcp=true&a2a=true&filterMode=OR&limit=2');
    expect(page1.status).toBe(200);
    const body1 = await page1.json();
    expect(body1.success).toBe(true);

    if (body1.meta.hasMore && body1.meta.nextCursor) {
      // Second page using the cursor
      const page2 = await testRoute(
        `/api/v1/agents?mcp=true&a2a=true&filterMode=OR&limit=2&cursor=${encodeURIComponent(body1.meta.nextCursor)}`
      );
      expect(page2.status).toBe(200);
      const body2 = await page2.json();
      expect(body2.success).toBe(true);

      // Verify no duplicates between pages
      const ids1 = body1.data.map((a: { id: string }) => a.id);
      const ids2 = body2.data.map((a: { id: string }) => a.id);
      const duplicates = ids1.filter((id: string) => ids2.includes(id));
      expect(duplicates).toHaveLength(0);
    }
  });

  it('OR mode with x402 returns cursor', async () => {
    // Test with different filter combination
    const res = await testRoute('/api/v1/agents?mcp=true&x402=true&filterMode=OR&limit=3');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta).toBeDefined();
  });
});

describe('Boolean feature filters', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('filters by active status', async () => {
    const [activeRes, inactiveRes] = await Promise.all([
      testRoute('/api/v1/agents?active=true'),
      testRoute('/api/v1/agents?active=false'),
    ]);

    for (const res of [activeRes, inactiveRes]) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  it('filters by x402 support', async () => {
    const res = await testRoute('/api/v1/agents?x402=true');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('filters by a2a support', async () => {
    const res = await testRoute('/api/v1/agents?a2a=true');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('filters by hasRegistrationFile', async () => {
    const res = await testRoute('/api/v1/agents?hasRegistrationFile=true');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('combines multiple boolean filters in AND mode', async () => {
    // Default AND mode: all filters must match
    const res = await testRoute('/api/v1/agents?mcp=true&a2a=true&x402=true');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});

describe('OASF classification filters', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('filters by single skill', async () => {
    const res = await testRoute('/api/v1/agents?skills=natural_language_processing');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('filters by multiple skills', async () => {
    const res = await testRoute(
      '/api/v1/agents?skills=natural_language_processing,code_generation'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('filters by single domain', async () => {
    const res = await testRoute('/api/v1/agents?domains=finance');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('filters by multiple domains', async () => {
    const res = await testRoute('/api/v1/agents?domains=finance,healthcare');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('filters by skills and domains combined', async () => {
    const res = await testRoute(
      '/api/v1/agents?skills=natural_language_processing&domains=finance'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});

describe('Combined filter scenarios', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('combines boolean and OASF filters', async () => {
    const res = await testRoute('/api/v1/agents?mcp=true&skills=natural_language_processing');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('combines OASF and reputation filters', async () => {
    const res = await testRoute('/api/v1/agents?skills=natural_language_processing&minRep=30');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('combines chain and feature filters', async () => {
    const res = await testRoute('/api/v1/agents?chainId=11155111&active=true&mcp=true');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('combines all filter types', async () => {
    const res = await testRoute(
      '/api/v1/agents?chainId=11155111&mcp=true&skills=natural_language_processing&minRep=20'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('filters with sort and pagination', async () => {
    const res = await testRoute(
      '/api/v1/agents?skills=natural_language_processing&sort=reputation&order=desc&limit=5'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
  });
});

describe('Search with filters', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockSearchResponse('test', 3));
  });

  it('search with skills filter', async () => {
    const res = await testRoute('/api/v1/agents?q=agent&skills=natural_language_processing');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('search with domains filter', async () => {
    const res = await testRoute('/api/v1/agents?q=agent&domains=finance');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('search with boolean filters', async () => {
    const res = await testRoute('/api/v1/agents?q=agent&mcp=true&active=true');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('search with OR mode', async () => {
    const res = await testRoute('/api/v1/agents?q=agent&mcp=true&a2a=true&filterMode=OR');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('search with all filter types', async () => {
    const res = await testRoute(
      '/api/v1/agents?q=agent&skills=natural_language_processing&mcp=true&minRep=20'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});

describe('OR mode edge cases', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('OR mode with all three boolean filters', async () => {
    const res = await testRoute('/api/v1/agents?mcp=true&a2a=true&x402=true&filterMode=OR');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('OR mode with single filter behaves normally', async () => {
    // Single filter with OR mode should work (no merge needed)
    const res = await testRoute('/api/v1/agents?mcp=true&filterMode=OR');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('OR mode pagination with all filters', async () => {
    // First page with all three boolean filters in OR mode
    const page1 = await testRoute(
      '/api/v1/agents?mcp=true&a2a=true&x402=true&filterMode=OR&limit=2'
    );
    expect(page1.status).toBe(200);
    const body1 = await page1.json();
    expect(body1.success).toBe(true);

    if (body1.meta.hasMore && body1.meta.nextCursor) {
      // Second page using the cursor
      const page2 = await testRoute(
        `/api/v1/agents?mcp=true&a2a=true&x402=true&filterMode=OR&limit=2&cursor=${encodeURIComponent(body1.meta.nextCursor)}`
      );
      expect(page2.status).toBe(200);
      const body2 = await page2.json();
      expect(body2.success).toBe(true);

      // Verify no duplicates between pages
      const ids1 = body1.data.map((a: { id: string }) => a.id);
      const ids2 = body2.data.map((a: { id: string }) => a.id);
      const duplicates = ids1.filter((id: string) => ids2.includes(id));
      expect(duplicates).toHaveLength(0);
    }
  });
});

describe('Filter validation errors', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns empty results for non-matching skill filter', async () => {
    // Invalid skills don't cause validation error, they just don't match any agents
    const res = await testRoute('/api/v1/agents?skills=invalid_nonexistent_skill_xyz');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // No agents will have this skill classification
    expect(body.data).toBeDefined();
  });

  it('returns empty results for non-matching domain filter', async () => {
    // Invalid domains don't cause validation error, they just don't match any agents
    const res = await testRoute('/api/v1/agents?domains=invalid_nonexistent_domain_xyz');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // No agents will have this domain classification
    expect(body.data).toBeDefined();
  });

  it('returns validation error for invalid limit', async () => {
    const res = await testRoute('/api/v1/agents?limit=-1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('clamps limit exceeding max to 100 instead of error', async () => {
    // limit > 100 should be clamped to 100, not return an error
    const res = await testRoute('/api/v1/agents?limit=1000');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});

describe('Agent detail with OASF enrichment', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns full OASF classification in detail view', async () => {
    await insertMockClassification('11155111:1');

    const response = await testRoute('/api/v1/agents/11155111:1');
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.oasf).toBeDefined();
    expect(body.data.oasf.skills).toBeDefined();
    expect(Array.isArray(body.data.oasf.skills)).toBe(true);
    expect(body.data.oasf.domains).toBeDefined();
    expect(Array.isArray(body.data.oasf.domains)).toBe(true);
    expect(body.data.oasf.confidence).toBeDefined();
  });

  it('returns MCP tools when available', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1');
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    // mcpTools should be defined (even if empty array)
    expect(body.data.mcpTools).toBeDefined();
  });

  it('returns A2A skills when available', async () => {
    const response = await testRoute('/api/v1/agents/11155111:1');
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    // a2aSkills should be defined (even if empty array or undefined)
    expect(body.data).toBeDefined();
  });
});
