/**
 * SDK service tests
 * @module test/unit/services/sdk
 */

import { SDKError } from '@/lib/utils/errors';
import { SUPPORTED_CHAINS, createSDKService, getChainConfig } from '@/services/sdk';
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
