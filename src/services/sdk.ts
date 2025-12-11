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
import type { SearchParams } from 'agent0-sdk';

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
  /** Filter by registration file presence. Default: true (only agents with metadata) */
  hasRegistrationFile?: boolean;
}

/**
 * Request coalescing for getChainStats - prevents duplicate concurrent calls
 * when multiple requests arrive before cache is populated
 */
let pendingChainStatsPromise: Promise<ChainStats[]> | null = null;

/**
 * Subgraph URLs for direct queries (used by getChainStats for accurate count)
 */
const SUBGRAPH_URLS: Record<number, string> = {
  11155111:
    'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT',
  84532:
    'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/GjQEDgEKqoh5Yc8MUgxoQoRATEJdEiH7HbocfR1aFiHa',
  80002:
    'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/2A1JB18r1mF2VNP4QBH4mmxd74kbHoM6xLXC8ABAKf7j',
};

/**
 * Paginated response from getAgents
 */
export interface GetAgentsResult {
  items: AgentSummary[];
  nextCursor?: string;
  total: number;
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
    // Pass subgraphOverrides for multi-chain query support
    const sdk = new SDK({ chainId, rpcUrl, subgraphOverrides: SUBGRAPH_URLS });
    sdkInstances.set(chainId, sdk);
    return sdk;
  }

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-chain query and transformation logic requires multiple conditional branches
    async getAgents(params: GetAgentsParams): Promise<GetAgentsResult> {
      const { chainIds, limit = 20, cursor, active, hasMcp, hasA2a, hasX402 } = params;

      // Determine which chains to query
      const chainsToQuery = chainIds
        ? SUPPORTED_CHAINS.filter((c) => chainIds.includes(c.chainId))
        : SUPPORTED_CHAINS;

      if (chainsToQuery.length === 0) {
        return { items: [], nextCursor: undefined, total: 0 };
      }

      // Build search params with native multi-chain support
      const searchParams: SearchParams = {
        chains: chainsToQuery.map((c) => c.chainId),
      };
      if (active !== undefined) searchParams.active = active;
      if (hasMcp !== undefined) searchParams.mcp = hasMcp;
      if (hasA2a !== undefined) searchParams.a2a = hasA2a;
      if (hasX402 !== undefined) searchParams.x402support = hasX402;

      try {
        // Use SDK with native multi-chain support and cursor-based pagination
        // The SDK handles pagination correctly when cursor is passed as 4th parameter
        // Use the first requested chain's SDK (all SDKs have subgraphOverrides for multi-chain)
        const primaryChain = chainsToQuery[0];
        if (!primaryChain) {
          return { items: [], nextCursor: undefined, total: 0 };
        }
        const sdk = getSDK(primaryChain.chainId);
        const result = await sdk.searchAgents(
          searchParams,
          ['createdAt:desc'],
          limit,
          cursor // Pass cursor for native SDK pagination!
        );

        // Transform SDK results to our format
        const items: AgentSummary[] = result.items.map((agent) => {
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
            operators: agent.operators || [],
            ens: agent.ens || undefined,
            did: agent.did || undefined,
            walletAddress: agent.walletAddress || undefined,
            inputModes: agent.mcpPrompts?.length ? ['mcp-prompt'] : undefined,
            outputModes: agent.mcpResources?.length ? ['mcp-resource'] : undefined,
          };
        });

        // Get total from SDK meta or default to items length
        const total = result.meta?.totalResults ?? items.length;

        return {
          items,
          nextCursor: result.nextCursor,
          total,
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
          // I/O mode metadata derived from MCP capabilities
          inputModes: agent.mcpPrompts?.length ? ['mcp-prompt'] : undefined,
          outputModes: agent.mcpResources?.length ? ['mcp-resource'] : undefined,
        };
      } catch (error) {
        // Throw SDKError to propagate to route handlers for proper 503 response
        throw new SDKError('getAgent', error);
      }
    },

    async getChainStats(): Promise<ChainStats[]> {
      // Request coalescing: if a request is already in progress, return the same promise
      // This prevents duplicate concurrent calls when cache is empty
      if (pendingChainStatsPromise) {
        return pendingChainStatsPromise;
      }

      // Helper to count agents via direct subgraph query (without registrationFile filter)
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Pagination loop with safety limits requires multiple exit conditions
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

      // Helper to count agents with SDK pagination
      async function countWithSDK(
        sdk: ReturnType<typeof getSDK>,
        filter: Record<string, boolean>
      ): Promise<number> {
        let count = 0;
        let cursor: string | undefined;
        do {
          const result = await sdk.searchAgents(filter, undefined, 999, cursor);
          count += result.items.length;
          cursor = result.nextCursor;
        } while (cursor);
        return count;
      }

      // Fetch stats for a single chain - all 3 counts in parallel
      async function getStatsForChain(
        chain: (typeof SUPPORTED_CHAINS)[number]
      ): Promise<ChainStats> {
        try {
          const sdk = getSDK(chain.chainId);

          // Run all 3 counts in parallel for this chain
          const [totalCount, withRegFileCount, activeCount] = await Promise.all([
            countAllAgentsDirectly(chain.chainId),
            countWithSDK(sdk, {}),
            countWithSDK(sdk, { active: true }),
          ]);

          return {
            chainId: chain.chainId,
            name: chain.name,
            shortName: chain.shortName,
            explorerUrl: chain.explorerUrl,
            totalCount,
            withRegistrationFileCount: withRegFileCount,
            activeCount,
            status: 'ok',
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(
            `SDK getChainStats error for chain ${chain.chainId} (${chain.name}):`,
            errorMessage
          );
          return {
            chainId: chain.chainId,
            name: chain.name,
            shortName: chain.shortName,
            explorerUrl: chain.explorerUrl,
            totalCount: 0,
            withRegistrationFileCount: 0,
            activeCount: 0,
            status: 'error',
          };
        }
      }

      // Create the promise and store it for coalescing
      pendingChainStatsPromise = Promise.all(SUPPORTED_CHAINS.map(getStatsForChain));

      try {
        const results = await pendingChainStatsPromise;
        return results;
      } finally {
        // Clear the pending promise so new requests can be made
        pendingChainStatsPromise = null;
      }
    },
  };
}
