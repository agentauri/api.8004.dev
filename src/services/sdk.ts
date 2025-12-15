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
 * Type guard for string extras fields
 * @param value - The value to check
 * @returns True if value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Safely extract a string from SDK extras
 * @param extras - SDK extras object
 * @param key - Key to extract
 * @returns The string value or undefined
 */
function getExtraString(
  extras: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!extras) return undefined;
  const value = extras[key];
  return isNonEmptyString(value) ? value : undefined;
}

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
 * Parameters for fallback search (used when vector search fails)
 */
export interface FallbackSearchParams {
  /** Search query (used for name/description substring match) */
  query: string;
  /** Chain IDs to search */
  chainIds?: number[];
  /** Filter by active status */
  active?: boolean;
  /** Filter by MCP support */
  mcp?: boolean;
  /** Filter by A2A support */
  a2a?: boolean;
  /** Filter by x402 support */
  x402?: boolean;
  /** Filter mode for boolean filters */
  filterMode?: 'AND' | 'OR';
  /** Maximum results */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
}

/**
 * Individual search result with score
 */
export interface FallbackSearchResultItem {
  agent: AgentSummary;
  score: number;
  matchReasons: string[];
}

/**
 * Fallback search result
 */
export interface FallbackSearchResult {
  items: FallbackSearchResultItem[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
  byChain: Record<number, number>;
}

/**
 * Calculate basic search score based on name/description match quality
 * @param query - The search query
 * @param name - Agent name
 * @param description - Agent description
 * @returns Score between 0 and 1
 */
export function calculateBasicScore(query: string, name: string, description: string): number {
  const queryLower = query.toLowerCase().trim();
  const nameLower = (name || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  // Empty query matches everything with base score
  if (!queryLower) return 0.5;

  // Exact name match = 1.0
  if (nameLower === queryLower) return 1.0;

  // Name starts with query = 0.9
  if (nameLower.startsWith(queryLower)) return 0.9;

  // Name contains query = 0.8
  if (nameLower.includes(queryLower)) return 0.8;

  // Description starts with query = 0.7
  if (descLower.startsWith(queryLower)) return 0.7;

  // Description contains query = 0.6
  if (descLower.includes(queryLower)) return 0.6;

  // Partial word match in name = 0.5+
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);
  const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 0);
  const matchingNameWords = queryWords.filter((qw) =>
    nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))
  );
  if (matchingNameWords.length > 0) {
    return 0.5 + 0.3 * (matchingNameWords.length / queryWords.length);
  }

  // Partial word match in description = 0.3+
  const descWords = descLower.split(/\s+/).filter((w) => w.length > 0);
  const matchingDescWords = queryWords.filter((qw) =>
    descWords.some((dw) => dw.includes(qw) || qw.includes(dw))
  );
  if (matchingDescWords.length > 0) {
    return 0.3 + 0.2 * (matchingDescWords.length / queryWords.length);
  }

  // Default for filter-only matches (no text match)
  return 0.3;
}

/**
 * Generate match reasons based on query and agent data
 */
function generateMatchReasons(
  query: string,
  name: string,
  description: string,
  filters: { mcp?: boolean; a2a?: boolean; x402?: boolean }
): string[] {
  const reasons: string[] = [];
  const queryLower = query.toLowerCase().trim();
  const nameLower = (name || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  if (queryLower) {
    if (nameLower.includes(queryLower)) {
      reasons.push('name_match');
    }
    if (descLower.includes(queryLower)) {
      reasons.push('description_match');
    }
  }

  if (filters.mcp) reasons.push('has_mcp');
  if (filters.a2a) reasons.push('has_a2a');
  if (filters.x402) reasons.push('has_x402');

  return reasons.length > 0 ? reasons : ['filter_match'];
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

  /**
   * Fallback search using SDK (used when vector search is unavailable)
   * Performs substring matching on name/description with basic scoring
   */
  search(params: FallbackSearchParams): Promise<FallbackSearchResult>;
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
      // Only filter by active=true. active=false means "no filter" (show all agents)
      // This matches vector search behavior where active=false doesn't filter
      if (active === true) searchParams.active = true;
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
                  url: getExtraString(agent.extras, 'mcpEndpoint') ?? '',
                  version: '1.0.0',
                }
              : undefined,
            a2a: agent.a2a
              ? {
                  url: getExtraString(agent.extras, 'a2aEndpoint') ?? '',
                  version: '1.0.0',
                }
              : undefined,
            ens: agent.ens || getExtraString(agent.extras, 'ens'),
            did: agent.did || getExtraString(agent.extras, 'did'),
            agentWallet: agent.walletAddress || getExtraString(agent.extras, 'agentWallet'),
          },
          registration: {
            chainId,
            tokenId,
            contractAddress: getExtraString(agent.extras, 'contractAddress') ?? '',
            metadataUri: getExtraString(agent.extras, 'metadataUri') ?? '',
            owner: agent.owners[0] || '',
            registeredAt: getExtraString(agent.extras, 'registeredAt') ?? new Date().toISOString(),
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
      // SECURITY: Limit iterations to prevent DoS from infinite pagination
      const MAX_COUNT_ITERATIONS = 20; // Max ~20,000 agents (20 * 999)
      async function countWithSDK(
        sdk: ReturnType<typeof getSDK>,
        filter: Record<string, boolean>
      ): Promise<number> {
        let count = 0;
        let cursor: string | undefined;
        let iterations = 0;
        do {
          const result = await sdk.searchAgents(filter, undefined, 999, cursor);
          count += result.items.length;
          cursor = result.nextCursor;
          iterations++;
          if (iterations >= MAX_COUNT_ITERATIONS) break; // Safety limit
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

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Fallback search with OR mode requires multiple branches
    async search(params: FallbackSearchParams): Promise<FallbackSearchResult> {
      const {
        query,
        chainIds,
        active,
        mcp,
        a2a,
        x402,
        filterMode = 'AND',
        limit = 20,
        cursor,
      } = params;

      // Determine which chains to query
      const chainsToQuery = chainIds
        ? SUPPORTED_CHAINS.filter((c) => chainIds.includes(c.chainId))
        : SUPPORTED_CHAINS;

      if (chainsToQuery.length === 0) {
        return { items: [], total: 0, hasMore: false, byChain: {} };
      }

      // Check if OR mode with multiple boolean filters
      const booleanFilters: Array<'mcp' | 'a2a' | 'x402'> = [];
      if (mcp) booleanFilters.push('mcp');
      if (a2a) booleanFilters.push('a2a');
      if (x402) booleanFilters.push('x402');

      const isOrMode = filterMode === 'OR' && booleanFilters.length > 1;

      try {
        const primaryChain = chainsToQuery[0];
        if (!primaryChain) {
          return { items: [], total: 0, hasMore: false, byChain: {} };
        }
        const sdk = getSDK(primaryChain.chainId);

        // Build base search params
        const baseSearchParams: SearchParams = {
          chains: chainsToQuery.map((c) => c.chainId),
        };

        // Add name filter for substring search if query provided
        if (query?.trim()) {
          baseSearchParams.name = query.trim();
        }

        // Only filter by active=true. active=false means "no filter" (show all agents)
        // This matches vector search behavior where active=false doesn't filter
        if (active === true) baseSearchParams.active = true;

        let allItems: AgentSummary[] = [];

        if (isOrMode) {
          // OR mode: run separate searches for each boolean filter and merge
          const searchPromises = booleanFilters.map(async (filter) => {
            const filterParams: SearchParams = { ...baseSearchParams };
            if (filter === 'mcp') filterParams.mcp = true;
            if (filter === 'a2a') filterParams.a2a = true;
            if (filter === 'x402') filterParams.x402support = true;

            const result = await sdk.searchAgents(filterParams, ['createdAt:desc'], limit * 2);
            return result.items;
          });

          const results = await Promise.all(searchPromises);

          // Merge and deduplicate by agentId
          const agentMap = new Map<string, AgentSummary>();
          for (const items of results) {
            for (const agent of items) {
              if (!agentMap.has(agent.agentId)) {
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
                  inputModes: agent.mcpPrompts?.length ? ['mcp-prompt'] : undefined,
                  outputModes: agent.mcpResources?.length ? ['mcp-resource'] : undefined,
                });
              }
            }
          }
          allItems = [...agentMap.values()];
        } else {
          // AND mode: single search with all filters
          if (mcp !== undefined) baseSearchParams.mcp = mcp;
          if (a2a !== undefined) baseSearchParams.a2a = a2a;
          if (x402 !== undefined) baseSearchParams.x402support = x402;

          const result = await sdk.searchAgents(
            baseSearchParams,
            ['createdAt:desc'],
            limit * 2, // Fetch extra for scoring/filtering
            cursor
          );

          allItems = result.items.map((agent) => {
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
        }

        // Calculate scores and generate match reasons
        const scoredItems: FallbackSearchResultItem[] = allItems.map((agent) => ({
          agent,
          score: calculateBasicScore(query, agent.name, agent.description),
          matchReasons: generateMatchReasons(query, agent.name, agent.description, {
            mcp: agent.hasMcp,
            a2a: agent.hasA2a,
            x402: agent.x402Support,
          }),
        }));

        // Sort by score descending
        scoredItems.sort((a, b) => b.score - a.score);

        // Calculate byChain breakdown
        const byChain: Record<number, number> = {};
        for (const item of scoredItems) {
          byChain[item.agent.chainId] = (byChain[item.agent.chainId] || 0) + 1;
        }

        // Apply limit
        const limitedItems = scoredItems.slice(0, limit);
        const hasMore = scoredItems.length > limit;

        // Generate cursor for pagination (simple offset-based)
        let nextCursor: string | undefined;
        if (hasMore) {
          nextCursor = Buffer.from(JSON.stringify({ offset: limit })).toString('base64url');
        }

        return {
          items: limitedItems,
          total: scoredItems.length,
          hasMore,
          nextCursor,
          byChain,
        };
      } catch (error) {
        throw new SDKError('search', error);
      }
    },
  };
}
