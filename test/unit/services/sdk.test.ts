/**
 * SDK service tests
 * @module test/unit/services/sdk
 */

import { SDKError } from '@/lib/utils/errors';
import {
  SUPPORTED_CHAINS,
  calculateBasicScore,
  createSDKService,
  getChainConfig,
} from '@/services/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockConfig } from '../../mocks/agent0-sdk';
import { createMockEnv } from '../../setup';

describe('SUPPORTED_CHAINS', () => {
  it.each([
    { chainId: 11155111, name: 'Ethereum Sepolia', rpcEnvKey: 'SEPOLIA_RPC_URL' },
    { chainId: 84532, name: 'Base Sepolia', rpcEnvKey: 'BASE_SEPOLIA_RPC_URL' },
    { chainId: 80002, name: 'Polygon Amoy', rpcEnvKey: 'POLYGON_AMOY_RPC_URL' },
  ])('includes $name (chainId: $chainId)', ({ chainId, name, rpcEnvKey }) => {
    const chain = SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
    expect(chain).toBeDefined();
    expect(chain?.name).toBe(name);
    expect(chain?.rpcEnvKey).toBe(rpcEnvKey);
  });
});

describe('getChainConfig', () => {
  it('returns config for supported chains', () => {
    for (const chain of SUPPORTED_CHAINS) {
      const config = getChainConfig(chain.chainId);
      expect(config).toBeDefined();
      expect(config?.chainId).toBe(chain.chainId);
      expect(config?.name).toBe(chain.name);
    }
  });

  it('returns undefined for unsupported chain', () => {
    expect(getChainConfig(999999)).toBeUndefined();
  });
});

describe('createSDKService', () => {
  const mockEnv = createMockEnv();

  describe('getAgents', () => {
    it('returns agents with expected structure', async () => {
      const sdk = createSDKService(mockEnv);
      const result = await sdk.getAgents({});

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result).toHaveProperty('nextCursor');

      const agent = result.items[0];
      expect(agent).toMatchObject({
        id: expect.any(String),
        chainId: expect.any(Number),
        tokenId: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        active: expect.any(Boolean),
        hasMcp: expect.any(Boolean),
        hasA2a: expect.any(Boolean),
        x402Support: expect.any(Boolean),
      });
    });

    it('filters by chainIds', async () => {
      const sdk = createSDKService(mockEnv);
      const result = await sdk.getAgents({ chainIds: [11155111] });
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor');
    });

    it('respects limit parameter', async () => {
      const sdk = createSDKService(mockEnv);
      const result = await sdk.getAgents({ limit: 1 });
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('getAgent', () => {
    it('returns agent with full details', async () => {
      const sdk = createSDKService(mockEnv);
      const agent = await sdk.getAgent(11155111, '1');

      expect(agent).toBeDefined();
      expect(agent?.chainId).toBe(11155111);
      expect(agent?.tokenId).toBe('1');
      expect(agent).toHaveProperty('endpoints');
      expect(agent).toHaveProperty('registration');
      expect(agent).toHaveProperty('mcpTools');
      expect(agent).toHaveProperty('a2aSkills');

      expect(agent?.endpoints?.mcp).toBeDefined();
      expect(agent?.endpoints?.mcp?.url).toBeDefined();
      expect(agent?.endpoints?.mcp?.version).toBeDefined();

      expect(agent?.registration).toMatchObject({
        chainId: 11155111,
        tokenId: '1',
        contractAddress: expect.any(String),
        owner: expect.any(String),
      });
    });

    it('returns null for unsupported chain', async () => {
      const sdk = createSDKService(mockEnv);
      expect(await sdk.getAgent(999999, '1')).toBeNull();
    });
  });

  describe('getChainStats', () => {
    it('returns stats for all supported chains', async () => {
      const sdk = createSDKService(mockEnv);
      const stats = await sdk.getChainStats();

      expect(stats).toBeDefined();
      expect(stats.length).toBe(SUPPORTED_CHAINS.length);

      const chainIds = stats.map((s) => s.chainId);
      for (const chain of SUPPORTED_CHAINS) {
        expect(chainIds).toContain(chain.chainId);
      }

      const stat = stats[0];
      expect(stat).toMatchObject({
        chainId: expect.any(Number),
        name: expect.any(String),
        totalCount: expect.any(Number),
        withRegistrationFileCount: expect.any(Number),
        activeCount: expect.any(Number),
      });
    });
  });
});

describe('SDK error paths', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const mockEnv = createMockEnv();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock config
    mockConfig.searchAgentsError = null;
    mockConfig.getAgentError = null;
    mockConfig.chainErrorMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up mock config
    mockConfig.searchAgentsError = null;
    mockConfig.getAgentError = null;
    mockConfig.chainErrorMap.clear();
  });

  it('throws SDKError when SDK searchAgents fails', async () => {
    // Use mock config to simulate SDK error
    mockConfig.searchAgentsError = new Error('SDK connection failed');

    const sdk = createSDKService(mockEnv);
    await expect(sdk.getAgents({})).rejects.toThrow(SDKError);
    await expect(sdk.getAgents({})).rejects.toThrow('searchAgents');
  });

  it('returns empty result when filtering to non-existent chains', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.getAgents({ chainIds: [999999] });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeUndefined();
  });

  it('throws SDKError when getAgent fails', async () => {
    mockConfig.getAgentError = new Error('Agent fetch failed');
    const sdk = createSDKService(mockEnv);

    await expect(sdk.getAgent(11155111, '1')).rejects.toThrow(SDKError);
    await expect(sdk.getAgent(11155111, '1')).rejects.toThrow('getAgent');
  });

  it('returns null for unsupported chain in getAgent', async () => {
    const sdk = createSDKService(mockEnv);
    expect(await sdk.getAgent(999999, '1')).toBeNull();
  });

  it('handles chain stats errors gracefully', async () => {
    mockConfig.searchAgentsError = new Error('RPC timeout');
    const sdk = createSDKService(mockEnv);
    const stats = await sdk.getChainStats();

    expect(stats.length).toBe(3);
    for (const stat of stats) {
      expect(stat.status).toBe('error');
      expect(stat.totalCount).toBe(0);
      expect(stat.withRegistrationFileCount).toBe(0);
      expect(stat.activeCount).toBe(0);
    }
  });

  it('continues processing other chains when one fails', async () => {
    // Only first chain fails
    mockConfig.chainErrorMap.set(11155111, new Error('First chain failed'));
    const sdk = createSDKService(mockEnv);
    const stats = await sdk.getChainStats();

    const firstChain = stats.find((s) => s.chainId === 11155111);
    expect(firstChain?.status).toBe('error');

    const otherChains = stats.filter((s) => s.chainId !== 11155111);
    for (const chain of otherChains) {
      expect(chain.status).toBe('ok');
    }
  });
});

describe('calculateBasicScore', () => {
  it('returns 1.0 for exact name match', () => {
    expect(calculateBasicScore('test', 'test', 'some description')).toBe(1.0);
    expect(calculateBasicScore('Test Agent', 'test agent', 'desc')).toBe(1.0);
  });

  it('returns 0.9 for name starting with query', () => {
    expect(calculateBasicScore('test', 'test agent', 'some description')).toBe(0.9);
    expect(calculateBasicScore('My', 'My Agent', 'desc')).toBe(0.9);
  });

  it('returns 0.8 for name containing query', () => {
    expect(calculateBasicScore('agent', 'My test agent', 'some description')).toBe(0.8);
    expect(calculateBasicScore('Bot', 'SuperBot', 'desc')).toBe(0.8);
  });

  it('returns 0.7 for description starting with query', () => {
    expect(calculateBasicScore('An AI', 'Bot', 'An AI assistant')).toBe(0.7);
  });

  it('returns 0.6 for description containing query', () => {
    expect(calculateBasicScore('assistant', 'Bot', 'An AI assistant for tasks')).toBe(0.6);
    expect(calculateBasicScore('help', 'Agent', 'This agent can help you')).toBe(0.6);
  });

  it('returns 0.5-0.8 for partial word match in name', () => {
    const score = calculateBasicScore('test bot', 'testing robot', 'description');
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThanOrEqual(0.8);
  });

  it('returns 0.3-0.5 for partial word match in description only', () => {
    // Use a query where only partial words match in description, not the full query
    // "intelligent bot" - "intelligent" matches description, "bot" doesn't
    const score = calculateBasicScore(
      'intelligent bot',
      'Generic Agent',
      'An intelligent AI assistant'
    );
    expect(score).toBeGreaterThanOrEqual(0.3);
    expect(score).toBeLessThanOrEqual(0.5);
  });

  it('returns 0.5 for empty query', () => {
    expect(calculateBasicScore('', 'Test Agent', 'description')).toBe(0.5);
    expect(calculateBasicScore('   ', 'Test Agent', 'description')).toBe(0.5);
  });

  it('returns 0.3 for no match', () => {
    expect(calculateBasicScore('xyz123', 'Test Agent', 'A test agent')).toBe(0.3);
  });

  it('handles null/undefined names and descriptions gracefully', () => {
    expect(calculateBasicScore('test', '', '')).toBe(0.3);
    // @ts-expect-error testing with null
    expect(calculateBasicScore('test', null, null)).toBe(0.3);
  });

  it('is case insensitive', () => {
    expect(calculateBasicScore('TEST', 'test', 'desc')).toBe(1.0);
    expect(calculateBasicScore('agent', 'AGENT', 'desc')).toBe(1.0);
    expect(calculateBasicScore('Test Agent', 'TEST AGENT', 'desc')).toBe(1.0);
  });
});

describe('SDK search method', () => {
  const mockEnv = createMockEnv();

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.searchAgentsError = null;
    mockConfig.getAgentError = null;
    mockConfig.chainErrorMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockConfig.searchAgentsError = null;
    mockConfig.getAgentError = null;
    mockConfig.chainErrorMap.clear();
  });

  it('returns search results with scores', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Test' });

    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeDefined();
    expect(result.hasMore).toBeDefined();
    expect(result.byChain).toBeDefined();

    if (result.items.length > 0) {
      const firstItem = result.items[0];
      expect(firstItem?.score).toBeDefined();
      expect(firstItem?.score).toBeGreaterThan(0);
      expect(firstItem?.score).toBeLessThanOrEqual(1);
      expect(firstItem?.matchReasons).toBeDefined();
      expect(Array.isArray(firstItem?.matchReasons)).toBe(true);
    }
  });

  it('sorts results by score descending', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent' });

    for (let i = 1; i < result.items.length; i++) {
      const currentScore = result.items[i]?.score ?? 0;
      const previousScore = result.items[i - 1]?.score ?? 0;
      expect(currentScore).toBeLessThanOrEqual(previousScore);
    }
  });

  it('respects limit parameter', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent', limit: 1 });

    expect(result.items.length).toBeLessThanOrEqual(1);
  });

  it('applies active filter', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent', active: true });

    expect(result).toBeDefined();
  });

  it('applies mcp filter', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent', mcp: true });

    expect(result).toBeDefined();
  });

  it('applies a2a filter', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent', a2a: true });

    expect(result).toBeDefined();
  });

  it('applies x402 filter', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent', x402: true });

    expect(result).toBeDefined();
  });

  it('applies chainIds filter', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent', chainIds: [11155111] });

    expect(result).toBeDefined();
  });

  it('handles OR mode with multiple boolean filters', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({
      query: 'Agent',
      mcp: true,
      a2a: true,
      filterMode: 'OR',
    });

    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
  });

  it('returns empty result for unsupported chains only', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent', chainIds: [999999] });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('throws SDKError when SDK fails', async () => {
    mockConfig.searchAgentsError = new Error('SDK connection failed');
    const sdk = createSDKService(mockEnv);

    await expect(sdk.search({ query: 'test' })).rejects.toThrow(SDKError);
  });

  it('calculates byChain breakdown correctly', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent' });

    expect(result.byChain).toBeDefined();
    // Total items should equal sum of byChain values
    const byChainTotal = Object.values(result.byChain).reduce((sum, count) => sum + count, 0);
    expect(byChainTotal).toBe(result.items.length);
  });

  it('generates hasMore and nextCursor correctly', async () => {
    const sdk = createSDKService(mockEnv);
    const result = await sdk.search({ query: 'Agent', limit: 1 });

    if (result.hasMore) {
      expect(result.nextCursor).toBeDefined();
    }
  });
});
