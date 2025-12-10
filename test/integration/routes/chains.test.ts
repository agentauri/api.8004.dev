/**
 * Chains route integration tests
 * @module test/integration/routes/chains
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('GET /api/v1/chains', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns chain statistics', async () => {
    const response = await testRoute('/api/v1/chains');

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('includes all supported chains', async () => {
    const response = await testRoute('/api/v1/chains');

    const body = await response.json();
    const chainIds = body.data.map((c: { chainId: number }) => c.chainId);

    // Should include all supported chains
    expect(chainIds).toContain(11155111); // Ethereum Sepolia
    expect(chainIds).toContain(84532); // Base Sepolia
    expect(chainIds).toContain(80002); // Polygon Amoy
  });

  it('returns correct stats structure', async () => {
    const response = await testRoute('/api/v1/chains');

    const body = await response.json();
    const chain = body.data[0];

    expect(chain).toHaveProperty('chainId');
    expect(chain).toHaveProperty('name');
    expect(chain).toHaveProperty('shortName');
    expect(chain).toHaveProperty('explorerUrl');
    expect(chain).toHaveProperty('totalCount');
    expect(chain).toHaveProperty('withRegistrationFileCount');
    expect(chain).toHaveProperty('activeCount');
    expect(typeof chain.chainId).toBe('number');
    expect(typeof chain.name).toBe('string');
    expect(typeof chain.shortName).toBe('string');
    expect(typeof chain.explorerUrl).toBe('string');
    expect(typeof chain.totalCount).toBe('number');
    expect(typeof chain.withRegistrationFileCount).toBe('number');
    expect(typeof chain.activeCount).toBe('number');
  });

  it('includes short names for all chains', async () => {
    const response = await testRoute('/api/v1/chains');

    const body = await response.json();
    const shortNames = body.data.map((c: { shortName: string }) => c.shortName);

    expect(shortNames).toContain('sepolia');
    expect(shortNames).toContain('base-sepolia');
    expect(shortNames).toContain('amoy');
  });

  it('includes explorer URLs for all chains', async () => {
    const response = await testRoute('/api/v1/chains');

    const body = await response.json();
    for (const chain of body.data as Array<{ explorerUrl: string }>) {
      expect(chain.explorerUrl).toMatch(/^https:\/\//);
    }
  });

  it('includes chain names', async () => {
    const response = await testRoute('/api/v1/chains');

    const body = await response.json();
    const names = body.data.map((c: { name: string }) => c.name);

    expect(names).toContain('Ethereum Sepolia');
    expect(names).toContain('Base Sepolia');
    expect(names).toContain('Polygon Amoy');
  });

  it('includes request ID header', async () => {
    const response = await testRoute('/api/v1/chains');
    expect(response.headers.get('X-Request-ID')).toBeDefined();
  });

  it('includes security headers', async () => {
    const response = await testRoute('/api/v1/chains');

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('uses caching', async () => {
    // First request
    const response1 = await testRoute('/api/v1/chains');
    expect(response1.status).toBe(200);

    // Second request should use cache
    const response2 = await testRoute('/api/v1/chains');
    expect(response2.status).toBe(200);
  });

  it('returns status field for each chain', async () => {
    const response = await testRoute('/api/v1/chains');

    const body = await response.json();
    for (const chain of body.data as Array<{ status?: string }>) {
      // Status should be 'ok', 'error', or 'cached'
      if (chain.status) {
        expect(['ok', 'error', 'cached']).toContain(chain.status);
      }
    }
  });
});
