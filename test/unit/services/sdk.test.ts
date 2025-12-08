/**
 * SDK service tests
 * @module test/unit/services/sdk
 */

import { SUPPORTED_CHAINS, createSDKService, getChainConfig } from '@/services/sdk';
import { describe, expect, it } from 'vitest';
import { createMockEnv } from '../../setup';

describe('SUPPORTED_CHAINS', () => {
  it('includes Ethereum Sepolia', () => {
    const sepolia = SUPPORTED_CHAINS.find((c) => c.chainId === 11155111);
    expect(sepolia).toBeDefined();
    expect(sepolia?.name).toBe('Ethereum Sepolia');
    expect(sepolia?.rpcEnvKey).toBe('SEPOLIA_RPC_URL');
  });

  it('includes Base Sepolia', () => {
    const baseSepolia = SUPPORTED_CHAINS.find((c) => c.chainId === 84532);
    expect(baseSepolia).toBeDefined();
    expect(baseSepolia?.name).toBe('Base Sepolia');
    expect(baseSepolia?.rpcEnvKey).toBe('BASE_SEPOLIA_RPC_URL');
  });

  it('includes Polygon Amoy', () => {
    const polygonAmoy = SUPPORTED_CHAINS.find((c) => c.chainId === 80002);
    expect(polygonAmoy).toBeDefined();
    expect(polygonAmoy?.name).toBe('Polygon Amoy');
    expect(polygonAmoy?.rpcEnvKey).toBe('POLYGON_AMOY_RPC_URL');
  });
});

describe('getChainConfig', () => {
  it('returns config for supported chain', () => {
    const config = getChainConfig(11155111);
    expect(config).toBeDefined();
    expect(config?.chainId).toBe(11155111);
    expect(config?.name).toBe('Ethereum Sepolia');
  });

  it('returns undefined for unsupported chain', () => {
    const config = getChainConfig(999999);
    expect(config).toBeUndefined();
  });

  it('returns config for all supported chains', () => {
    for (const chain of SUPPORTED_CHAINS) {
      const config = getChainConfig(chain.chainId);
      expect(config).toBeDefined();
      expect(config?.chainId).toBe(chain.chainId);
    }
  });
});

describe('createSDKService', () => {
  const mockEnv = createMockEnv();

  describe('getAgents', () => {
    it('returns agents from all chains when no filter', async () => {
      const sdk = createSDKService(mockEnv);
      const result = await sdk.getAgents({});

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      // Mock returns 2 agents
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('returns result with nextCursor', async () => {
      const sdk = createSDKService(mockEnv);
      const result = await sdk.getAgents({ chainIds: [11155111] });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor');
    });

    it('returns agents even with limit parameter', async () => {
      const sdk = createSDKService(mockEnv);
      const result = await sdk.getAgents({ limit: 1 });

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('returns agents with expected structure', async () => {
      const sdk = createSDKService(mockEnv);
      const result = await sdk.getAgents({});

      expect(result.items.length).toBeGreaterThan(0);
      const agent = result.items[0];
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('chainId');
      expect(agent).toHaveProperty('tokenId');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('active');
      expect(agent).toHaveProperty('hasMcp');
      expect(agent).toHaveProperty('hasA2a');
      expect(agent).toHaveProperty('x402Support');
    });
  });

  describe('getAgent', () => {
    it('returns agent for valid chain and token', async () => {
      const sdk = createSDKService(mockEnv);
      const agent = await sdk.getAgent(11155111, '1');

      expect(agent).toBeDefined();
      expect(agent?.chainId).toBe(11155111);
      expect(agent?.tokenId).toBe('1');
    });

    it('returns null for unsupported chain', async () => {
      const sdk = createSDKService(mockEnv);
      const agent = await sdk.getAgent(999999, '1');

      expect(agent).toBeNull();
    });

    it('returns agent with full details', async () => {
      const sdk = createSDKService(mockEnv);
      const agent = await sdk.getAgent(11155111, '1');

      expect(agent).toHaveProperty('endpoints');
      expect(agent).toHaveProperty('registration');
      expect(agent).toHaveProperty('mcpTools');
      expect(agent).toHaveProperty('a2aSkills');
    });

    it('includes MCP endpoint details', async () => {
      const sdk = createSDKService(mockEnv);
      const agent = await sdk.getAgent(11155111, '1');

      expect(agent?.endpoints?.mcp).toBeDefined();
      expect(agent?.endpoints?.mcp?.url).toBeDefined();
      expect(agent?.endpoints?.mcp?.version).toBeDefined();
    });

    it('includes registration details', async () => {
      const sdk = createSDKService(mockEnv);
      const agent = await sdk.getAgent(11155111, '1');

      expect(agent?.registration).toBeDefined();
      expect(agent?.registration?.chainId).toBe(11155111);
      expect(agent?.registration?.tokenId).toBe('1');
      expect(agent?.registration?.contractAddress).toBeDefined();
      expect(agent?.registration?.owner).toBeDefined();
    });
  });

  describe('getChainStats', () => {
    it('returns stats for all chains', async () => {
      const sdk = createSDKService(mockEnv);
      const stats = await sdk.getChainStats();

      expect(stats).toBeDefined();
      expect(stats.length).toBe(SUPPORTED_CHAINS.length);
    });

    it('returns stats with expected structure', async () => {
      const sdk = createSDKService(mockEnv);
      const stats = await sdk.getChainStats();

      const stat = stats[0];
      expect(stat).toHaveProperty('chainId');
      expect(stat).toHaveProperty('name');
      expect(stat).toHaveProperty('agentCount');
      expect(stat).toHaveProperty('activeCount');
    });

    it('includes all supported chains', async () => {
      const sdk = createSDKService(mockEnv);
      const stats = await sdk.getChainStats();

      const chainIds = stats.map((s) => s.chainId);
      for (const chain of SUPPORTED_CHAINS) {
        expect(chainIds).toContain(chain.chainId);
      }
    });
  });
});
