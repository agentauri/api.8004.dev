/**
 * Agent0 SDK service
 * @module services/sdk
 */

import { SDKError } from '@/lib/utils/errors';
import type {
  AgentDetail,
  AgentSummary,
  ChainStats,
  Env,
  SupportedChainId,
  TrustMethod,
} from '@/types';
import { SDK } from 'agent0-sdk';

/**
 * Derive supported trust methods from agent data
 */
function deriveSupportedTrust(x402Support: boolean): TrustMethod[] {
  const methods: TrustMethod[] = [];
  if (x402Support) methods.push('x402');
  // EAS attestations will be added in future when reputation system is integrated
  return methods;
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  chainId: SupportedChainId;
  name: string;
  shortName: string;
  explorerUrl: string;
  rpcEnvKey: keyof Pick<Env, 'SEPOLIA_RPC_URL' | 'BASE_SEPOLIA_RPC_URL' | 'POLYGON_AMOY_RPC_URL'>;
}

/**
 * Supported chains configuration
 */
export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    shortName: 'sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcEnvKey: 'SEPOLIA_RPC_URL',
  },
  {
    chainId: 84532,
    name: 'Base Sepolia',
    shortName: 'base-sepolia',
    explorerUrl: 'https://sepolia.basescan.org',
    rpcEnvKey: 'BASE_SEPOLIA_RPC_URL',
  },
  {
    chainId: 80002,
    name: 'Polygon Amoy',
    shortName: 'amoy',
    explorerUrl: 'https://amoy.polygonscan.com',
    rpcEnvKey: 'POLYGON_AMOY_RPC_URL',
  },
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
  hasX402?: boolean;
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
    async getAgents(params: GetAgentsParams): Promise<GetAgentsResult> {
      const { chainIds, limit = 20, cursor, active, hasMcp, hasA2a, hasX402 } = params;

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
        if (hasX402 !== undefined) searchParams.x402support = hasX402;

        // Search with multi-chain support and cursor-based pagination
        // Note: sort is required for proper cross-chain ordering (SDK doesn't sort if undefined)
        const result = await sdk.searchAgents(
          {
            ...searchParams,
            chains: chainIds || 'all',
          },
          ['createdAt:desc'],
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
            supportedTrust: deriveSupportedTrust(agent.x402support),
            // Additional fields from SDK
            operators: agent.operators || [],
            ens: agent.ens || undefined,
            did: agent.did || undefined,
            walletAddress: agent.walletAddress || undefined,
          };
        });

        return {
          items,
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        // Throw SDKError to propagate to route handlers for proper 503 response
        throw new SDKError('searchAgents', error);
      }
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Agent detail mapping requires multiple conditional field extractions
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
          supportedTrust: deriveSupportedTrust(agent.x402support),
          // Additional fields from SDK
          operators: agent.operators || [],
          ens: agent.ens || undefined,
          did: agent.did || undefined,
          walletAddress: agent.walletAddress || undefined,
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
            ens: agent.ens || (agent.extras?.ens as string) || undefined,
            did: agent.did || (agent.extras?.did as string) || undefined,
            agentWallet: agent.walletAddress || (agent.extras?.agentWallet as string) || undefined,
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
          // MCP prompts and resources
          mcpPrompts: agent.mcpPrompts || [],
          mcpResources: agent.mcpResources || [],
        };
      } catch (error) {
        // Throw SDKError to propagate to route handlers for proper 503 response
        throw new SDKError('getAgent', error);
      }
    },

    async getChainStats(): Promise<ChainStats[]> {
      // Subgraph URLs for direct queries (to count ALL agents without registrationFile filter)
      const SUBGRAPH_URLS: Record<number, string> = {
        11155111:
          'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT',
        84532:
          'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/GjQEDgEKqoh5Yc8MUgxoQoRATEJdEiH7HbocfR1aFiHa',
        80002:
          'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/2A1JB18r1mF2VNP4QBH4mmxd74kbHoM6xLXC8ABAKf7j',
      };

      // Helper to count agents via direct subgraph query (without registrationFile filter)
      async function countAllAgentsDirectly(chainId: number): Promise<number> {
        const url = SUBGRAPH_URLS[chainId];
        if (!url) return 0;

        let total = 0;
        let skip = 0;

        while (true) {
          const query = `{ agents(first: 1000, skip: ${skip}) { id } }`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });

          if (!response.ok) break;

          const data = (await response.json()) as { data?: { agents?: { id: string }[] } };
          const agents = data?.data?.agents || [];
          const count = agents.length;

          if (count === 0) break;
          total += count;
          if (count < 1000) break;
          skip += 1000;
          if (skip > 10000) break; // Safety limit
        }

        return total;
      }

      const results: ChainStats[] = [];

      for (const chain of SUPPORTED_CHAINS) {
        try {
          const sdk = getSDK(chain.chainId);

          // 1. Count ALL agents (no filter) - direct subgraph query
          const totalCount = await countAllAgentsDirectly(chain.chainId);

          // 2. Count agents with registrationFile (SDK default behavior)
          // SDK applies registrationFile_not: null filter automatically
          let withRegFileCount = 0;
          let cursor: string | undefined;
          do {
            const result = await sdk.searchAgents({}, undefined, 999, cursor);
            withRegFileCount += result.items.length;
            cursor = result.nextCursor;
          } while (cursor);

          // 3. Count active agents (active: true AND has registrationFile)
          let activeCount = 0;
          cursor = undefined;
          do {
            const result = await sdk.searchAgents({ active: true }, undefined, 999, cursor);
            activeCount += result.items.length;
            cursor = result.nextCursor;
          } while (cursor);

          results.push({
            chainId: chain.chainId,
            name: chain.name,
            shortName: chain.shortName,
            explorerUrl: chain.explorerUrl,
            totalCount,
            withRegistrationFileCount: withRegFileCount,
            activeCount,
            status: 'ok',
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(
            `SDK getChainStats error for chain ${chain.chainId} (${chain.name}):`,
            errorMessage
          );
          results.push({
            chainId: chain.chainId,
            name: chain.name,
            shortName: chain.shortName,
            explorerUrl: chain.explorerUrl,
            totalCount: 0,
            withRegistrationFileCount: 0,
            activeCount: 0,
            status: 'error',
          });
        }
      }

      return results;
    },
  };
}
