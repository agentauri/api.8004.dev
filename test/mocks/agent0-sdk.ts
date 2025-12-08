/**
 * Agent0 SDK mock
 * @module test/mocks/agent0-sdk
 */

import { vi } from 'vitest';

/**
 * Mock agent data
 */
export const mockAgents = [
  {
    id: '11155111:1',
    chainId: 11155111,
    tokenId: '1',
    name: 'Test Agent 1',
    description: 'A test agent on Sepolia',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
  },
  {
    id: '84532:1',
    chainId: 84532,
    tokenId: '1',
    name: 'Test Agent 2',
    description: 'A test agent on Base Sepolia',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: true,
  },
];

/**
 * Mock agent detail
 */
export const mockAgentDetail = {
  ...mockAgents[0],
  endpoints: {
    mcp: {
      url: 'https://example.com/mcp',
      version: '1.0.0',
    },
  },
  registration: {
    chainId: 11155111,
    tokenId: '1',
    contractAddress: '0x1234567890123456789012345678901234567890',
    metadataUri: 'ipfs://Qm...',
    owner: '0x0987654321098765432109876543210987654321',
    registeredAt: new Date().toISOString(),
  },
  mcpTools: ['tool1', 'tool2'],
  a2aSkills: [],
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
 * Create mock SDK
 */
export function createMockSDK() {
  return {
    searchAgents: vi.fn().mockResolvedValue(mockAgents),
    getAgent: vi.fn().mockResolvedValue(mockAgentDetail),
    getStats: vi.fn().mockResolvedValue({ totalAgents: 100, activeAgents: 75 }),
  };
}
