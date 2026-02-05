/**
 * Agent0 SDK mock
 * @module test/mocks/agent0-sdk
 *
 * This mock replaces the real agent0-sdk during tests to avoid
 * node:https compatibility issues with the workerd environment.
 */

import { vi } from 'vitest';

/**
 * Configuration for SDK mock behavior
 * Tests can modify these to simulate errors
 */
export const mockConfig = {
  searchAgentsError: null as Error | null,
  getAgentError: null as Error | null,
  chainErrorMap: new Map<number, Error>(),
};

/**
 * Mock SDK agent list response (SDK v1.5.2 format: array of agents)
 * In v1.5.2, mcp/a2a are endpoint strings (or undefined), not booleans
 */
export const mockSDKAgentList = [
  {
    agentId: '11155111:1',
    name: 'Test Agent 1',
    description: 'A test agent on Sepolia',
    image: 'https://example.com/agent1.png',
    active: true,
    mcp: 'https://example.com/mcp',  // SDK v1.5.2: endpoint string or undefined
    a2a: undefined,                   // SDK v1.5.2: endpoint string or undefined
    x402support: false,
    owners: ['0x1234567890123456789012345678901234567890'],
  },
  {
    agentId: '84532:1',
    name: 'Test Agent 2',
    description: 'A test agent on Base Sepolia',
    image: 'https://example.com/agent2.png',
    active: true,
    mcp: undefined,                   // SDK v1.5.2: endpoint string or undefined
    a2a: 'https://example.com/a2a',   // SDK v1.5.2: endpoint string or undefined
    x402support: true,
    owners: ['0x0987654321098765432109876543210987654321'],
  },
];

/**
 * Mock SDK agent detail response (SDK v1.5.2 format)
 * In v1.5.2, mcp/a2a are endpoint strings (or undefined), not booleans
 */
export const mockSDKAgentDetail = {
  agentId: '11155111:1',
  chainId: 11155111,
  name: 'Test Agent 1',
  description: 'A test agent on Sepolia',
  image: 'https://example.com/agent1.png',
  active: true,
  mcp: 'https://example.com/mcp',  // SDK v1.5.2: endpoint string or undefined
  a2a: undefined,                   // SDK v1.5.2: endpoint string or undefined
  x402support: false,
  owners: ['0x1234567890123456789012345678901234567890'],
  mcpTools: ['tool1', 'tool2'],
  a2aSkills: [],
  extras: {
    mcpEndpoint: 'https://example.com/mcp',
    a2aEndpoint: undefined,
    mcpVersion: '1.0',
    contractAddress: '0x1234567890123456789012345678901234567890',
    metadataUri: 'ipfs://QmTest...',
    registeredAt: '2024-01-01T00:00:00.000Z',
  },
};

/**
 * Mock chain stats
 */
export const mockChainStats = [
  {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    totalCount: 150,
    withRegistrationFileCount: 100,
    activeCount: 75,
  },
  {
    chainId: 84532,
    name: 'Base Sepolia',
    totalCount: 80,
    withRegistrationFileCount: 50,
    activeCount: 40,
  },
  {
    chainId: 80002,
    name: 'Polygon Amoy',
    totalCount: 40,
    withRegistrationFileCount: 25,
    activeCount: 20,
  },
];

/**
 * Mock SDK class that matches the real agent0-sdk interface
 */
export class SDK {
  chainId: number;
  rpcUrl: string;

  constructor(options: { chainId: number; rpcUrl: string }) {
    this.chainId = options.chainId;
    this.rpcUrl = options.rpcUrl;
  }

  /**
   * Search agents with optional filters
   * SDK v1.5.2: Returns AgentSummary[] directly (no wrapper object)
   * Returns chain-specific agents to avoid duplicates in multi-chain queries
   */
  searchAgents = vi.fn().mockImplementation(async () => {
    // Check for chain-specific error
    const chainError = mockConfig.chainErrorMap.get(this.chainId);
    if (chainError) {
      throw chainError;
    }
    // Check for global error
    if (mockConfig.searchAgentsError) {
      throw mockConfig.searchAgentsError;
    }
    // Return chain-specific agents to avoid duplicates in multi-chain queries
    // SDK v1.5.2 returns array directly
    const chainSpecificAgents = mockSDKAgentList.filter((agent) => {
      const agentChainId = Number.parseInt(agent.agentId.split(':')[0] || '0', 10);
      return agentChainId === this.chainId;
    });
    return chainSpecificAgents;
  });

  /**
   * Get single agent by ID
   */
  getAgent = vi.fn().mockImplementation(async (_agentId: string) => {
    if (mockConfig.getAgentError) {
      throw mockConfig.getAgentError;
    }
    return { ...mockSDKAgentDetail };
  });
}

/**
 * Legacy helper for backward compatibility
 * @deprecated Use SDK class directly
 */
export function createMockSDK() {
  return new SDK({ chainId: 11155111, rpcUrl: 'https://rpc.example.com' });
}
