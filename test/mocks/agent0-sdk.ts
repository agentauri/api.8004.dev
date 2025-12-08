/**
 * Agent0 SDK mock
 * @module test/mocks/agent0-sdk
 *
 * This mock replaces the real agent0-sdk during tests to avoid
 * node:https compatibility issues with the workerd environment.
 */

import { vi } from 'vitest';

/**
 * Mock SDK agent list response (matches SDK format, not our transformed format)
 */
export const mockSDKAgentList = {
  items: [
    {
      agentId: '11155111:1',
      name: 'Test Agent 1',
      description: 'A test agent on Sepolia',
      image: 'https://example.com/agent1.png',
      active: true,
      mcp: true,
      a2a: false,
      x402support: false,
      owners: ['0x1234567890123456789012345678901234567890'],
    },
    {
      agentId: '84532:1',
      name: 'Test Agent 2',
      description: 'A test agent on Base Sepolia',
      image: 'https://example.com/agent2.png',
      active: true,
      mcp: false,
      a2a: true,
      x402support: true,
      owners: ['0x0987654321098765432109876543210987654321'],
    },
  ],
  nextCursor: undefined,
};

/**
 * Mock SDK agent detail response
 */
export const mockSDKAgentDetail = {
  agentId: '11155111:1',
  chainId: 11155111,
  name: 'Test Agent 1',
  description: 'A test agent on Sepolia',
  image: 'https://example.com/agent1.png',
  active: true,
  mcp: true,
  a2a: false,
  x402support: false,
  owners: ['0x1234567890123456789012345678901234567890'],
  mcpTools: ['tool1', 'tool2'],
  a2aSkills: [],
  extras: {
    mcpEndpoint: 'https://example.com/mcp',
    contractAddress: '0x1234567890123456789012345678901234567890',
    metadataUri: 'ipfs://QmTest...',
    registeredAt: '2024-01-01T00:00:00.000Z',
  },
};

/**
 * Mock chain stats
 */
export const mockChainStats = [
  { chainId: 11155111, name: 'Ethereum Sepolia', agentCount: 100, activeCount: 75 },
  { chainId: 84532, name: 'Base Sepolia', agentCount: 50, activeCount: 40 },
  { chainId: 80002, name: 'Polygon Amoy', agentCount: 25, activeCount: 20 },
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
   * @param searchParams - Search parameters
   * @param _sort - Sort order (unused in mock)
   * @param limit - Maximum number of results
   * @param cursor - Pagination cursor
   */
  searchAgents = vi
    .fn()
    .mockImplementation(
      async (
        _searchParams?: Record<string, unknown>,
        _sort?: unknown,
        _limit?: number,
        _cursor?: string
      ) => {
        return { ...mockSDKAgentList };
      }
    );

  /**
   * Get single agent by ID
   * @param agentId - Agent ID in format chainId:tokenId
   */
  getAgent = vi.fn().mockImplementation(async (_agentId: string) => {
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
