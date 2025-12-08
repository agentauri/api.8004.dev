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

      // agent0lab uses /api/search, not /api/v1/search
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/search`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toBe('test query');
      expect(body.limit).toBe(20);
      expect(body.minScore).toBe(0.3);
      expect(body.includeMetadata).toBe(true);
    });

    it('applies custom limit and minScore', async () => {
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
      expect(body.limit).toBe(50);
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
      expect(body.filters.chainId).toBe(11155111);
    });

    it('applies chainIds filter for multiple chains', async () => {
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

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.filters.in.chainId).toEqual([11155111, 84532]);
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
      expect(body.filters.capabilities).toEqual(['nlp', 'code']);
    });

    it('applies boolean filters', async () => {
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
        filters: { active: true, mcp: true, a2a: false },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.filters.equals.active).toBe(true);
      expect(body.filters.equals.mcp).toBe(true);
      expect(body.filters.equals.a2a).toBe(false);
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

      // agent0lab uses /api/search
      expect(mockFetch).toHaveBeenCalledWith(
        'https://search.example.com/api/search',
        expect.any(Object)
      );
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
      // agent0lab uses /health, not /api/v1/health
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/health`,
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
