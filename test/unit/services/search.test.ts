/**
 * Search service tests
 * @module test/unit/services/search
 */

import { createSearchService } from '@/services/search';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('createSearchService', () => {
  const baseUrl = 'https://search.example.com';

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('search', () => {
    it('sends search request with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test query',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      await service.search({ query: 'test query' });

      // v1 API endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v1/search`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toBe('test query');
      // v1 API uses limit with smart sizing: Math.min(limit * 2, MAX_SEARCH_RESULTS=100)
      // Default limit=20 → 20*2=40
      expect(body.limit).toBe(40);
      expect(body.minScore).toBe(0.3);
    });

    it('applies custom minScore (limit is applied client-side)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 50 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      await service.search({ query: 'test', limit: 50, minScore: 0.5 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // v1 API uses limit with smart sizing: Math.min(limit * 2, MAX_SEARCH_RESULTS=100)
      // limit=50 → 50*2=100 (capped at MAX)
      expect(body.limit).toBe(100);
      expect(body.minScore).toBe(0.5);
    });

    it('applies chainId filter for single chain', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      await service.search({
        query: 'test',
        filters: { chainIds: [11155111] },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // v1 API: single chainId uses equals operator
      expect(body.filters.equals.chainId).toBe(11155111);
    });

    it('runs separate searches for multiple chainIds and merges results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      await service.search({
        query: 'test',
        filters: { chainIds: [11155111, 84532] },
      });

      // Multi-chain now runs separate searches per chain and merges
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
      const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
      // v1 API: each call has single chainId in equals operator
      expect(body1.filters.equals.chainId).toBe(11155111);
      expect(body2.filters.equals.chainId).toBe(84532);
    });

    it('applies skills filter as capabilities', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      await service.search({
        query: 'test',
        filters: { skills: ['nlp', 'code'] },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // v1 API: skills mapped to capabilities in 'in' operator
      expect(body.filters.in.capabilities).toEqual(['nlp', 'code']);
    });

    it('applies boolean filters with v1 operator format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      await service.search({
        query: 'test',
        filters: { active: true, mcp: true, a2a: false, x402: true },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // v1 API: scalar values use equals operator
      expect(body.filters.equals.active).toBe(true);
      // v1 API: boolean true values use exists operator
      // Note: a2a=false is ignored (v1 API doesn't support filtering for false)
      expect(body.filters.exists).toEqual(['mcp', 'x402support']);
      // a2a=false should NOT be in the filters
      expect(body.filters.exists).not.toContain('a2a');
    });

    it('transforms response to service format', async () => {
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
                name: 'Test Agent',
                description: 'A test agent',
                score: 0.95,
                metadata: { key: 'value' },
              },
            ],
            total: 1,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      const result = await service.search({ query: 'test' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        agentId: '11155111:1',
        chainId: 11155111,
        name: 'Test Agent',
        description: 'A test agent',
        score: 0.95,
        metadata: { key: 'value' },
      });
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const service = createSearchService(baseUrl);
      await expect(service.search({ query: 'test' })).rejects.toThrow(
        'Search service error: 500 Internal Server Error'
      );
    });

    it('removes trailing slash from base URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService('https://search.example.com/');
      await service.search({ query: 'test' });

      // v1 API endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        'https://search.example.com/api/v1/search',
        expect.any(Object)
      );
    });

    it('uses AND mode by default', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      await service.search({
        query: 'test',
        filters: { mcp: true, a2a: true },
      });

      // Should only make one request with both filters (AND mode)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // v1 API: boolean true values use exists operator
      expect(body.filters.exists).toEqual(['mcp', 'a2a']);
    });

    it('runs separate searches for OR mode with multiple boolean filters', async () => {
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
                name: 'Agent 1',
                description: 'Test',
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

      const service = createSearchService(baseUrl);
      await service.search({
        query: 'test',
        filters: { mcp: true, a2a: true, filterMode: 'OR' },
      });

      // Should make two separate requests (one for mcp, one for a2a)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call should have mcp=true only (in exists array)
      const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body1.filters.exists).toEqual(['mcp']);

      // Second call should have a2a=true only (in exists array)
      const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body2.filters.exists).toEqual(['a2a']);
    });

    it('merges and deduplicates OR results by agentId', async () => {
      // First call returns agent 1 and 2
      mockFetch.mockResolvedValueOnce({
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
                name: 'Agent 1',
                description: 'Test',
                score: 0.9,
                metadata: {},
              },
              {
                rank: 2,
                vectorId: 'v2',
                agentId: '84532:2',
                chainId: 84532,
                name: 'Agent 2',
                description: 'Test',
                score: 0.8,
                metadata: {},
              },
            ],
            total: 100,
            pagination: { hasMore: true, nextCursor: 'cursor1', limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      // Second call returns agent 1 (duplicate) and 3
      mockFetch.mockResolvedValueOnce({
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
                name: 'Agent 1',
                description: 'Test',
                score: 0.95, // Higher score for duplicate
                metadata: {},
              },
              {
                rank: 2,
                vectorId: 'v3',
                agentId: '11155111:3',
                chainId: 11155111,
                name: 'Agent 3',
                description: 'Test',
                score: 0.7,
                metadata: {},
              },
            ],
            total: 50,
            pagination: { hasMore: true, nextCursor: 'cursor2', limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      const result = await service.search({
        query: 'test',
        filters: { mcp: true, a2a: true, filterMode: 'OR' },
      });

      // Should have 3 unique agents
      expect(result.results).toHaveLength(3);
      // Total should be SUM of all filter totals (100 + 50 = 150)
      expect(result.total).toBe(150);

      // Agent 1 should have higher score (0.95, not 0.9)
      const agent1 = result.results.find((r) => r.agentId === '11155111:1');
      expect(agent1?.score).toBe(0.95);

      // Results should be sorted by score descending
      expect(result.results[0].agentId).toBe('11155111:1'); // 0.95
      expect(result.results[1].agentId).toBe('84532:2'); // 0.8
      expect(result.results[2].agentId).toBe('11155111:3'); // 0.7

      // hasMore is false when merged results (3) < limit (20)
      // The smart limit logic means we fetch more than needed, so all results fit in one page
      expect(result.hasMore).toBe(false);

      // nextCursor is undefined when hasMore is false
      expect(result.nextCursor).toBeUndefined();

      // byChain should show breakdown (2 on sepolia, 1 on base)
      expect(result.byChain).toEqual({
        11155111: 3, // Agent 1 counted twice (from both searches) + Agent 3
        84532: 1, // Agent 2
      });
    });

    it('uses single search for OR mode with only one boolean filter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: [],
            total: 0,
            pagination: { hasMore: false, limit: 20 },
            requestId: 'test-id',
            timestamp: new Date().toISOString(),
          }),
      });

      const service = createSearchService(baseUrl);
      await service.search({
        query: 'test',
        filters: { mcp: true, filterMode: 'OR' },
      });

      // Should only make one request (OR with single filter is same as AND)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('healthCheck', () => {
    it('returns true when service is healthy', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const service = createSearchService(baseUrl);
      const result = await service.healthCheck();

      expect(result).toBe(true);
      // v1 API health endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v1/health`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('returns false on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      const service = createSearchService(baseUrl);
      const result = await service.healthCheck();

      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const service = createSearchService(baseUrl);
      const result = await service.healthCheck();

      expect(result).toBe(false);
    });

    it('returns false when status is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'degraded' }),
      });

      const service = createSearchService(baseUrl);
      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });
});
