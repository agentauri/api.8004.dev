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
  /** Filter by registration file presence. Default: true (only agents with metadata) */
  hasRegistrationFile?: boolean;
}

/**
 * Request coalescing for getChainStats - prevents duplicate concurrent calls
 * when multiple requests arrive before cache is populated
 */
let pendingChainStatsPromise: Promise<ChainStats[]> | null = null;

/**
 * Subgraph URLs for direct queries (bypass SDK's registrationFile filter)
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
 * Subgraph agent response type (without registrationFile)
 * Note: Field names match the actual subgraph schema (not the SDK's transformed names)
 */
interface SubgraphAgent {
  id: string; // Format: "chainId:tokenId"
  registrationFile?: {
    name?: string;
    description?: string;
    image?: string;
    active?: boolean;
    x402support?: boolean;
    mcpEndpoint?: string;
    a2aEndpoint?: string;
    ens?: string;
    did?: string;
    agentWallet?: string;
  } | null;
}

/**
 * Query ALL agents from subgraph (without registrationFile filter)
 * Returns results in SDK-compatible format
 */
async function queryAllAgentsFromSubgraph(
  chainId: number,
  limit: number,
  _params: Record<string, unknown>
): Promise<{
  items: Array<{
    agentId: string;
    name: string;
    description: string;
    image?: string;
    active: boolean;
    mcp: boolean;
    a2a: boolean;
    x402support: boolean;
    operators: string[];
    ens?: string;
    did?: string;
    walletAddress?: string;
  }>;
  nextCursor?: string;
}> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) return { items: [] };

  // GraphQL query for agents (no registrationFile filter)
  // Note: id is in format "chainId:tokenId", no separate tokenId/owners fields
  // Field names must match subgraph schema: mcpEndpoint/a2aEndpoint instead of mcp/a2a, agentWallet instead of walletAddress
  const query = `{
    agents(first: ${limit}, orderBy: id, orderDirection: desc) {
      id
      registrationFile {
        name
        description
        image
        active
        x402support
        mcpEndpoint
        a2aEndpoint
        ens
        did
        agentWallet
      }
    }
  }`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Subgraph query failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: { agents?: SubgraphAgent[] };
    errors?: unknown[];
  };
  const agents = data?.data?.agents || [];

  // Transform to SDK-compatible format
  const items = agents.map((agent) => {
    const reg = agent.registrationFile;
    // Extract tokenId from id (format: "chainId:tokenId")
    const tokenId = agent.id.split(':')[1] || '0';
    return {
      agentId: agent.id,
      name: reg?.name || `Agent #${tokenId}`,
      description: reg?.description || '',
      image: reg?.image,
      active: reg?.active ?? false,
      // Derive mcp/a2a boolean from presence of endpoint
      mcp: !!reg?.mcpEndpoint,
      a2a: !!reg?.a2aEndpoint,
      x402support: reg?.x402support ?? false,
      operators: [],
      ens: reg?.ens,
      did: reg?.did,
      walletAddress: reg?.agentWallet,
    };
  });

  return { items };
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
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-chain parallel query and merge logic requires multiple conditional branches
    async getAgents(params: GetAgentsParams): Promise<GetAgentsResult> {
      const {
        chainIds,
        limit = 20,
        cursor,
        active,
        hasMcp,
        hasA2a,
        hasX402,
        hasRegistrationFile,
      } = params;

      // Determine which chains to query
      const chainsToQuery = chainIds
        ? SUPPORTED_CHAINS.filter((c) => chainIds.includes(c.chainId))
        : SUPPORTED_CHAINS;

      if (chainsToQuery.length === 0) {
        return { items: [], nextCursor: undefined };
      }

      // Build search params
      const searchParams: Record<string, unknown> = {};
      if (active !== undefined) searchParams.active = active;
      if (hasMcp !== undefined) searchParams.mcp = hasMcp;
      if (hasA2a !== undefined) searchParams.a2a = hasA2a;
      if (hasX402 !== undefined) searchParams.x402support = hasX402;

      try {
        // If hasRegistrationFile=false, query ALL agents via direct subgraph (bypasses SDK filter)
        // Default behavior (hasRegistrationFile undefined or true) uses SDK which filters to agents with metadata
        const queryPromises = chainsToQuery.map(async (chain) => {
          if (hasRegistrationFile === false) {
            // Direct subgraph query for ALL agents (including those without registrationFile)
            return queryAllAgentsFromSubgraph(chain.chainId, limit, searchParams);
          }
          // Default: use SDK (only agents with registrationFile)
          const sdk = getSDK(chain.chainId);
          return sdk.searchAgents(searchParams, ['createdAt:desc'], limit, cursor);
        });

        const allResults = await Promise.all(queryPromises);

        // Merge and deduplicate by agentId
        const agentMap = new Map<string, AgentSummary>();
        for (const result of allResults) {
          for (const agent of result.items) {
            if (!agentMap.has(agent.agentId)) {
              // Transform to our format
              const parts = agent.agentId.split(':');
              const chainIdStr = parts[0] || '0';
              const tokenId = parts[1] || '0';

              agentMap.set(agent.agentId, {
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
              });
            }
          }
        }

        // Group results by chain for fair distribution
        const resultsByChain = new Map<number, AgentSummary[]>();
        for (const agent of agentMap.values()) {
          const chainAgents = resultsByChain.get(agent.chainId) || [];
          chainAgents.push(agent);
          resultsByChain.set(agent.chainId, chainAgents);
        }

        // Sort each chain's results by tokenId DESC (newest first within chain)
        for (const agents of resultsByChain.values()) {
          agents.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
        }

        // Interleave results from all chains (round-robin for fair distribution)
        const mergedItems: AgentSummary[] = [];
        const chainArrays = [...resultsByChain.values()];
        let idx = 0;
        while (mergedItems.length < limit) {
          let added = false;
          for (const chainAgents of chainArrays) {
            const agent = chainAgents[idx];
            if (agent) {
              mergedItems.push(agent);
              added = true;
              if (mergedItems.length >= limit) break;
            }
          }
          if (!added) break; // All chains exhausted
          idx++;
        }

        return {
          items: mergedItems,
          // Multi-chain merge doesn't support cursor pagination
          nextCursor: undefined,
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
