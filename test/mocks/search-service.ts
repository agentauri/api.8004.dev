/**
 * Search service mock
 * @module test/mocks/search-service
 */

import { vi } from 'vitest';

/**
 * Mock search results
 */
export const mockSearchResults = {
  results: [
    {
      agentId: '11155111:1',
      chainId: 11155111,
      name: 'Test Agent 1',
      description: 'A test agent',
      score: 0.95,
      metadata: {},
    },
    {
      agentId: '11155111:2',
      chainId: 11155111,
      name: 'Test Agent 2',
      description: 'Another test agent',
      score: 0.85,
      metadata: {},
    },
  ],
  total: 2,
  hasMore: false,
  nextCursor: undefined,
};

/**
 * Mock health check response
 */
export const mockHealthResponse = {
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '1.0.0',
};

/**
 * Create mock fetch for search service
 */
export function createMockSearchFetch() {
  return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('/health')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockHealthResponse),
      });
    }

    if (urlStr.includes('/search') && options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            query: 'test',
            results: mockSearchResults.results.map((r, i) => ({
              rank: i + 1,
              vectorId: `vec-${i}`,
              ...r,
            })),
            total: mockSearchResults.total,
            pagination: {
              hasMore: mockSearchResults.hasMore,
              nextCursor: mockSearchResults.nextCursor,
              limit: 20,
            },
            requestId: 'test-request-id',
            timestamp: new Date().toISOString(),
          }),
      });
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
  });
}
