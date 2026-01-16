/**
 * Metadata route integration tests
 * @module test/integration/routes/metadata
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

/**
 * Create a mock subgraph response for agent metadata
 */
function mockSubgraphMetadataResponse(metadata: unknown[] = []) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: { agentMetadatas: metadata },
      }),
  };
}

describe('Metadata Route', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  describe('GET /api/v1/agents/:agentId/metadata', () => {
    it('returns metadata for valid agent ID', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(
            mockSubgraphMetadataResponse([
              {
                id: 'meta-1',
                key: 'website',
                value: 'https://example.com',
                updatedAt: '1700000000',
              },
              {
                id: 'meta-2',
                key: 'twitter',
                value: '@agent123',
                updatedAt: '1700001000',
              },
            ])
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:1/metadata');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.agentId).toBe('11155111:1');
      expect(body.data.metadata).toHaveLength(2);
      expect(body.data.count).toBe(2);
      expect(body.data.metadata[0].key).toBe('website');
      expect(body.data.metadata[0].value).toBe('https://example.com');
    });

    it('returns empty array when no metadata exists', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(mockSubgraphMetadataResponse([]));
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:999/metadata');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.metadata).toEqual([]);
      expect(body.data.count).toBe(0);
    });

    it('rejects invalid agent ID format', async () => {
      const response = await testRoute('/api/v1/agents/invalid-id/metadata');

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid agent ID format');
    });

    it('transforms timestamps to ISO format', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(
            mockSubgraphMetadataResponse([
              {
                id: 'meta-1',
                key: 'website',
                value: 'https://example.com',
                updatedAt: '1700000000', // Unix timestamp
              },
            ])
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:1/metadata');

      expect(response.status).toBe(200);
      const body = await response.json();
      // Should be ISO string format
      expect(body.data.metadata[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('uses caching', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          callCount++;
          return Promise.resolve(
            mockSubgraphMetadataResponse([
              {
                id: 'meta-1',
                key: 'website',
                value: 'https://example.com',
                updatedAt: '1700000000',
              },
            ])
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      // First request
      const response1 = await testRoute('/api/v1/agents/11155111:1/metadata');
      expect(response1.status).toBe(200);

      // Second request should hit cache
      const response2 = await testRoute('/api/v1/agents/11155111:1/metadata');
      expect(response2.status).toBe(200);

      // Should only call fetch once due to caching
      expect(callCount).toBe(1);
    });
  });

  describe('GET /api/v1/agents/:agentId/metadata/:key', () => {
    it('returns specific metadata entry by key', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(
            mockSubgraphMetadataResponse([
              {
                id: 'meta-1',
                key: 'website',
                value: 'https://example.com',
                updatedAt: '1700000000',
              },
              {
                id: 'meta-2',
                key: 'twitter',
                value: '@agent123',
                updatedAt: '1700001000',
              },
            ])
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:1/metadata/website');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.agentId).toBe('11155111:1');
      expect(body.data.key).toBe('website');
      expect(body.data.value).toBe('https://example.com');
    });

    it('returns 404 for non-existent key', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(
            mockSubgraphMetadataResponse([
              {
                id: 'meta-1',
                key: 'website',
                value: 'https://example.com',
                updatedAt: '1700000000',
              },
            ])
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:1/metadata/nonexistent');

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("not found");
    });

    it('rejects invalid agent ID format', async () => {
      const response = await testRoute('/api/v1/agents/bad-format/metadata/website');

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });
});
