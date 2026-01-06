/**
 * Platform stats route integration tests
 * @module test/integration/routes/stats
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/stats', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns platform statistics', async () => {
    const response = await testRoute('/api/v1/stats');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('returns correct stats structure with three count types', async () => {
    const response = await testRoute('/api/v1/stats');

    const body = await response.json();
    const data = body.data;

    expect(data).toHaveProperty('totalAgents');
    expect(data).toHaveProperty('withRegistrationFile');
    expect(data).toHaveProperty('activeAgents');
    expect(data).toHaveProperty('chainBreakdown');
    expect(typeof data.totalAgents).toBe('number');
    expect(typeof data.withRegistrationFile).toBe('number');
    expect(typeof data.activeAgents).toBe('number');
    expect(Array.isArray(data.chainBreakdown)).toBe(true);
  });

  it('includes chain breakdown with all count types for all chains', async () => {
    const response = await testRoute('/api/v1/stats');

    const body = await response.json();
    const chainIds = body.data.chainBreakdown.map((c: { chainId: number }) => c.chainId);

    // Should include all supported chains
    expect(chainIds).toContain(11155111); // Ethereum Sepolia
    expect(chainIds).toContain(84532); // Base Sepolia
    expect(chainIds).toContain(80002); // Polygon Amoy

    // Each chain should have all count types
    for (const chain of body.data.chainBreakdown) {
      expect(chain).toHaveProperty('totalCount');
      expect(chain).toHaveProperty('withRegistrationFileCount');
      expect(chain).toHaveProperty('activeCount');
      expect(typeof chain.totalCount).toBe('number');
      expect(typeof chain.withRegistrationFileCount).toBe('number');
      expect(typeof chain.activeCount).toBe('number');
    }
  });

  it('aggregates totals from all chains', async () => {
    const response = await testRoute('/api/v1/stats');

    const body = await response.json();
    const { totalAgents, withRegistrationFile, activeAgents, chainBreakdown } = body.data;

    // Totals should equal sum of chain breakdowns
    const expectedTotal = chainBreakdown.reduce(
      (sum: number, chain: { totalCount: number }) => sum + chain.totalCount,
      0
    );
    const expectedWithRegFile = chainBreakdown.reduce(
      (sum: number, chain: { withRegistrationFileCount: number }) =>
        sum + chain.withRegistrationFileCount,
      0
    );
    const expectedActive = chainBreakdown.reduce(
      (sum: number, chain: { activeCount: number }) => sum + chain.activeCount,
      0
    );

    expect(totalAgents).toBe(expectedTotal);
    expect(withRegistrationFile).toBe(expectedWithRegFile);
    expect(activeAgents).toBe(expectedActive);
  });

  // Note: Request ID and security headers are tested in index.test.ts

  it('uses caching', async () => {
    // First request
    const response1 = await testRoute('/api/v1/stats');
    expect(response1.status).toBe(200);

    // Second request should use cache
    const response2 = await testRoute('/api/v1/stats');
    expect(response2.status).toBe(200);
  });
});
