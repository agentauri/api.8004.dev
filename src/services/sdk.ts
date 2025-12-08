/**
 * Agent0 SDK service
 * @module services/sdk
 */

import type { AgentDetail, AgentSummary, ChainStats, Env, SupportedChainId } from '@/types';
import { SDK } from 'agent0-sdk';

/**
 * Chain configuration
 */
export interface ChainConfig {
  chainId: SupportedChainId;
  name: string;
  rpcEnvKey: keyof Pick<Env, 'SEPOLIA_RPC_URL' | 'BASE_SEPOLIA_RPC_URL' | 'POLYGON_AMOY_RPC_URL'>;
}

/**
 * Supported chains configuration
 */
export const SUPPORTED_CHAINS: ChainConfig[] = [
  { chainId: 11155111, name: 'Ethereum Sepolia', rpcEnvKey: 'SEPOLIA_RPC_URL' },
  { chainId: 84532, name: 'Base Sepolia', rpcEnvKey: 'BASE_SEPOLIA_RPC_URL' },
  { chainId: 80002, name: 'Polygon Amoy', rpcEnvKey: 'POLYGON_AMOY_RPC_URL' },
];

/**
 * Get chain config by ID
 */
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
}

/**
 * Parameters for fetching agents
 */
export interface GetAgentsParams {
  chainIds?: number[];
  limit?: number;
  cursor?: string;
  active?: boolean;
  hasMcp?: boolean;
  hasA2a?: boolean;
}

/**
 * Paginated response from getAgents
 */
export interface GetAgentsResult {
  items: AgentSummary[];
  nextCursor?: string;
}

/**
 * SDK service interface
 */
export interface SDKService {
  /**
   * Get agents with optional filters
   */
  getAgents(params: GetAgentsParams): Promise<GetAgentsResult>;

  /**
   * Get a single agent by ID
   */
  getAgent(chainId: number, tokenId: string): Promise<AgentDetail | null>;

  /**
   * Get agent count by chain
   */
  getChainStats(): Promise<ChainStats[]>;
}

/**
 * Create SDK service using agent0-sdk
 */
export function createSDKService(env: Env): SDKService {
  // Cache SDK instances per chain
  const sdkInstances = new Map<number, SDK>();

  function getSDK(chainId: number): SDK {
    const existing = sdkInstances.get(chainId);
    if (existing) return existing;

    const config = getChainConfig(chainId);
    if (!config) throw new Error(`Unsupported chain: ${chainId}`);
    const rpcUrl = env[config.rpcEnvKey];
    const sdk = new SDK({ chainId, rpcUrl });
    sdkInstances.set(chainId, sdk);
    return sdk;
  }

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-chain pagination logic requires this complexity
    async getAgents(params: GetAgentsParams): Promise<GetAgentsResult> {
      const { chainIds, limit = 20, cursor, active, hasMcp, hasA2a } = params;

      // Determine which chains to query
      const chainsToQuery = chainIds
        ? SUPPORTED_CHAINS.filter((c) => chainIds.includes(c.chainId))
        : SUPPORTED_CHAINS;

      try {
        // Use one SDK to do multi-chain search
        const primaryChain = chainsToQuery[0];
        if (!primaryChain) return { items: [], nextCursor: undefined };

        const sdk = getSDK(primaryChain.chainId);

        // Build search params
        const searchParams: Record<string, unknown> = {};
        if (active !== undefined) searchParams.active = active;
        if (hasMcp !== undefined) searchParams.mcp = hasMcp;
        if (hasA2a !== undefined) searchParams.a2a = hasA2a;

        // Search with multi-chain support and cursor-based pagination
        const result = await sdk.searchAgents(
          {
            ...searchParams,
            chains: chainIds || 'all',
          },
          undefined,
          limit,
          cursor
        );

        // Transform to our format
        const items = result.items.map((agent) => {
          const parts = agent.agentId.split(':');
          const chainIdStr = parts[0] || '0';
          const tokenId = parts[1] || '0';
          return {
            id: agent.agentId,
            chainId: Number.parseInt(chainIdStr, 10),
            tokenId,
            name: agent.name,
            description: agent.description,
            image: agent.image,
            active: agent.active,
            hasMcp: agent.mcp,
            hasA2a: agent.a2a,
            x402Support: agent.x402support,
          };
        });

        return {
          items,
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        console.error(
          'SDK searchAgents error:',
          error instanceof Error ? error.message : String(error)
        );
        // Return empty result on error to avoid breaking the API
        return { items: [], nextCursor: undefined };
      }
    },

    async getAgent(chainId: number, tokenId: string): Promise<AgentDetail | null> {
      const config = getChainConfig(chainId);
      if (!config) return null;

      try {
        const sdk = getSDK(chainId);
        const agentId = `${chainId}:${tokenId}`;
        const agent = await sdk.getAgent(agentId);

        if (!agent) return null;

        // Transform to our detailed format
        return {
          id: agent.agentId,
          chainId: agent.chainId,
          tokenId,
          name: agent.name,
          description: agent.description,
          image: agent.image,
          active: agent.active,
          hasMcp: agent.mcp,
          hasA2a: agent.a2a,
          x402Support: agent.x402support,
          endpoints: {
            mcp: agent.mcp
              ? {
                  url: agent.extras?.mcpEndpoint as string,
                  version: '1.0.0',
                }
              : undefined,
            a2a: agent.a2a
              ? {
                  url: agent.extras?.a2aEndpoint as string,
                  version: '1.0.0',
                }
              : undefined,
          },
          registration: {
            chainId,
            tokenId,
            contractAddress: (agent.extras?.contractAddress as string) || '',
            metadataUri: (agent.extras?.metadataUri as string) || '',
            owner: agent.owners[0] || '',
            registeredAt: (agent.extras?.registeredAt as string) || new Date().toISOString(),
          },
          mcpTools: agent.mcpTools,
          a2aSkills: agent.a2aSkills,
        };
      } catch (error) {
        console.error('SDK getAgent error:', error);
        return null;
      }
    },

    async getChainStats(): Promise<ChainStats[]> {
      const results: ChainStats[] = [];

      for (const chain of SUPPORTED_CHAINS) {
        try {
          const sdk = getSDK(chain.chainId);

          // Search all agents on this chain
          const allAgents = await sdk.searchAgents({ chains: [chain.chainId] }, undefined, 1000);
          const activeAgents = await sdk.searchAgents(
            { chains: [chain.chainId], active: true },
            undefined,
            1000
          );

          results.push({
            chainId: chain.chainId,
            name: chain.name,
            agentCount: allAgents.items.length,
            activeCount: activeAgents.items.length,
          });
        } catch (error) {
          console.error(`SDK getChainStats error for chain ${chain.chainId}:`, error);
          // Add with zero counts on error
          results.push({
            chainId: chain.chainId,
            name: chain.name,
            agentCount: 0,
            activeCount: 0,
          });
        }
      }

      return results;
    },
  };
}
