/**
 * Mock chain statistics fixtures for E2E testing
 * @module services/mock/fixtures/chain-stats
 *
 * Provides deterministic chain statistics matching the mock agents
 */

import type { ChainStats } from '@/types';
import { MOCK_AGENTS_SUMMARY } from './agents';

/**
 * Calculate chain stats from mock agents
 */
function calculateChainStats(): ChainStats[] {
  const chainData: Record<
    number,
    {
      total: number;
      withRegFile: number;
      active: number;
      name: string;
      shortName: string;
      explorerUrl: string;
    }
  > = {
    11155111: {
      total: 0,
      withRegFile: 0,
      active: 0,
      name: 'Ethereum Sepolia',
      shortName: 'sepolia',
      explorerUrl: 'https://sepolia.etherscan.io',
    },
    84532: {
      total: 0,
      withRegFile: 0,
      active: 0,
      name: 'Base Sepolia',
      shortName: 'base-sepolia',
      explorerUrl: 'https://sepolia.basescan.org',
    },
    80002: {
      total: 0,
      withRegFile: 0,
      active: 0,
      name: 'Polygon Amoy',
      shortName: 'amoy',
      explorerUrl: 'https://amoy.polygonscan.com',
    },
  };

  // Count agents by chain
  for (const agent of MOCK_AGENTS_SUMMARY) {
    const data = chainData[agent.chainId];
    if (data) {
      data.total++;
      data.withRegFile++; // All mock agents have registration files
      if (agent.active) {
        data.active++;
      }
    }
  }

  // Convert to ChainStats array
  return Object.entries(chainData).map(([chainId, data]) => ({
    chainId: Number(chainId),
    name: data.name,
    shortName: data.shortName,
    explorerUrl: data.explorerUrl,
    totalCount: data.total,
    withRegistrationFileCount: data.withRegFile,
    activeCount: data.active,
    status: 'ok' as const,
  }));
}

/**
 * Pre-calculated mock chain statistics
 *
 * Based on 50 mock agents:
 * - Sepolia (11155111): 20 agents (16 active)
 * - Base Sepolia (84532): 15 agents (12 active)
 * - Polygon Amoy (80002): 15 agents (12 active)
 */
export const MOCK_CHAIN_STATS: ChainStats[] = calculateChainStats();

/**
 * Get chain stats for a specific chain
 */
export function getMockChainStats(chainId: number): ChainStats | undefined {
  return MOCK_CHAIN_STATS.find((s) => s.chainId === chainId);
}

/**
 * Get total agent count across all chains
 */
export function getMockTotalAgentCount(): number {
  return MOCK_CHAIN_STATS.reduce((sum, chain) => sum + chain.totalCount, 0);
}

/**
 * Get total active agent count across all chains
 */
export function getMockTotalActiveCount(): number {
  return MOCK_CHAIN_STATS.reduce((sum, chain) => sum + chain.activeCount, 0);
}
