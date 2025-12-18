/**
 * Agent0 SDK service
 * @module services/sdk
 */

import { SDKError } from '@/lib/utils/errors';
import type {
  AgentDetail,
  AgentHealthCheck,
  AgentHealthScore,
  AgentSummary,
  AgentWarning,
  ChainStats,
  Env,
  SupportedChainId,
  TrustMethod,
} from '@/types';
import { SDK } from 'agent0-sdk';
import type { SearchParams } from 'agent0-sdk';
import { createMockSDKService } from './mock/mock-sdk';

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
  /** Filter by MCP tool names */
  mcpTools?: string[];
  /** Filter by A2A skill names */
  a2aSkills?: string[];
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
  /** Filter by MCP tool names */
  mcpTools?: string[];
  /** Filter by A2A skill names */
  a2aSkills?: string[];
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
 * Parameters for reputation-based search
 */
export interface ReputationSearchParams {
  /** Chain IDs to search */
  chainIds?: number[];
  /** Minimum average reputation score (1-5) */
  minRep?: number;
  /** Maximum average reputation score (1-5) - applied via post-filtering */
  maxRep?: number;
  /** Maximum results */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
}

/**
 * Result from reputation-based search
 */
export interface ReputationSearchResult {
  items: AgentSummary[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
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
    'https://gateway.thegraph.com/api/00a452ad3cd1900273ea62c1bf283f93/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT',
  84532:
    'https://gateway.thegraph.com/api/00a452ad3cd1900273ea62c1bf283f93/subgraphs/id/GjQEDgEKqoh5Yc8MUgxoQoRATEJdEiH7HbocfR1aFiHa',
  80002:
    'https://gateway.thegraph.com/api/00a452ad3cd1900273ea62c1bf283f93/subgraphs/id/2A1JB18r1mF2VNP4QBH4mmxd74kbHoM6xLXC8ABAKf7j',
};

/**
 * Subgraph extra fields not exposed by SDK's AgentSummary
 */
interface SubgraphAgentExtras {
  agentURI?: string;
  a2aEndpoint?: string;
  a2aVersion?: string;
  mcpEndpoint?: string;
  mcpVersion?: string;
  updatedAt?: string;
  createdAt?: string;
}

/**
 * Fetch extra agent fields directly from subgraph
 * The SDK's AgentSummary doesn't expose agentURI, endpoints, versions, etc.
 * @param chainId - Chain ID
 * @param agentId - Agent ID in format "chainId:tokenId"
 * @returns Extra fields from subgraph
 */
async function fetchAgentExtrasFromSubgraph(
  chainId: number,
  agentId: string
): Promise<SubgraphAgentExtras> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) return {};

  try {
    const query = `{
      agent(id: "${agentId}") {
        agentURI
        updatedAt
        createdAt
        registrationFile {
          a2aEndpoint
          a2aVersion
          mcpEndpoint
          mcpVersion
        }
      }
    }`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) return {};

    const data = (await response.json()) as {
      data?: {
        agent?: {
          agentURI?: string;
          updatedAt?: string;
          createdAt?: string;
          registrationFile?: {
            a2aEndpoint?: string;
            a2aVersion?: string;
            mcpEndpoint?: string;
            mcpVersion?: string;
          };
        };
      };
    };

    const agent = data?.data?.agent;
    if (!agent) return {};

    return {
      agentURI: agent.agentURI || undefined,
      a2aEndpoint: agent.registrationFile?.a2aEndpoint || undefined,
      a2aVersion: agent.registrationFile?.a2aVersion || undefined,
      mcpEndpoint: agent.registrationFile?.mcpEndpoint || undefined,
      mcpVersion: agent.registrationFile?.mcpVersion || undefined,
      updatedAt: agent.updatedAt || undefined,
      createdAt: agent.createdAt || undefined,
    };
  } catch {
    // Silently fail - the SDK data is still usable
    return {};
  }
}

/**
 * Compute warnings for an agent based on its data quality
 */
function computeAgentWarnings(agent: {
  name?: string;
  description?: string;
  image?: string;
  mcp?: boolean;
  a2a?: boolean;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  reputationCount?: number;
}): AgentWarning[] {
  const warnings: AgentWarning[] = [];

  // Metadata warnings
  if (!agent.name || agent.name.trim() === '') {
    warnings.push({
      type: 'metadata',
      message: 'Agent name is missing',
      severity: 'high',
    });
  }

  if (!agent.description || agent.description.trim() === '') {
    warnings.push({
      type: 'metadata',
      message: 'Agent description is missing',
      severity: 'medium',
    });
  } else if (agent.description.length < 50) {
    warnings.push({
      type: 'metadata',
      message: 'Agent description is too short (less than 50 characters)',
      severity: 'low',
    });
  }

  if (!agent.image || agent.image.trim() === '') {
    warnings.push({
      type: 'metadata',
      message: 'Agent image is missing',
      severity: 'low',
    });
  }

  // Endpoint warnings
  if (agent.mcp && (!agent.mcpEndpoint || agent.mcpEndpoint.trim() === '')) {
    warnings.push({
      type: 'endpoint',
      message: 'MCP capability claimed but no endpoint configured',
      severity: 'high',
    });
  }

  if (agent.a2a && (!agent.a2aEndpoint || agent.a2aEndpoint.trim() === '')) {
    warnings.push({
      type: 'endpoint',
      message: 'A2A capability claimed but no endpoint configured',
      severity: 'high',
    });
  }

  // Reputation warnings
  if (agent.reputationCount === 0 || agent.reputationCount === undefined) {
    warnings.push({
      type: 'reputation',
      message: 'No feedback received yet',
      severity: 'low',
    });
  }

  return warnings;
}

/**
 * Compute health score for an agent based on its data quality
 */
function computeAgentHealthScore(agent: {
  name?: string;
  description?: string;
  image?: string;
  mcp?: boolean;
  a2a?: boolean;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  reputationCount?: number;
  reputationScore?: number;
}): AgentHealthScore {
  const checks: AgentHealthCheck[] = [];

  // Metadata check (40% weight)
  let metadataScore = 0;
  let metadataMessage = '';
  const hasName = agent.name && agent.name.trim() !== '';
  const hasDescription = agent.description && agent.description.trim() !== '';
  const descriptionLength = agent.description?.length ?? 0;
  const hasGoodDescription = hasDescription && descriptionLength >= 50;
  const hasImage = agent.image && agent.image.trim() !== '';

  if (hasName) metadataScore += 40;
  if (hasDescription) metadataScore += 30;
  if (hasGoodDescription) metadataScore += 10;
  if (hasImage) metadataScore += 20;

  if (metadataScore === 100) {
    metadataMessage = 'All metadata complete';
  } else if (metadataScore >= 70) {
    metadataMessage = 'Metadata mostly complete';
  } else if (metadataScore >= 40) {
    metadataMessage = 'Some metadata missing';
  } else {
    metadataMessage = 'Critical metadata missing';
  }

  checks.push({
    category: 'metadata',
    status: metadataScore >= 70 ? 'pass' : metadataScore >= 40 ? 'warning' : 'fail',
    score: metadataScore,
    message: metadataMessage,
  });

  // Endpoints check (40% weight)
  let endpointsScore = 100;
  let endpointsMessage = 'No endpoints required';

  const hasMcpWithEndpoint = !agent.mcp || (agent.mcpEndpoint && agent.mcpEndpoint.trim() !== '');
  const hasA2aWithEndpoint = !agent.a2a || (agent.a2aEndpoint && agent.a2aEndpoint.trim() !== '');

  if (agent.mcp || agent.a2a) {
    endpointsScore = 0;
    const issues: string[] = [];

    if (agent.mcp && hasMcpWithEndpoint) {
      endpointsScore += 50;
    } else if (agent.mcp) {
      issues.push('MCP');
    }

    if (agent.a2a && hasA2aWithEndpoint) {
      endpointsScore += 50;
    } else if (agent.a2a) {
      issues.push('A2A');
    }

    // Normalize score if only one protocol is used
    if (agent.mcp && !agent.a2a) {
      endpointsScore = hasMcpWithEndpoint ? 100 : 0;
    } else if (agent.a2a && !agent.mcp) {
      endpointsScore = hasA2aWithEndpoint ? 100 : 0;
    }

    if (endpointsScore === 100) {
      endpointsMessage = 'All endpoints configured';
    } else if (issues.length > 0) {
      endpointsMessage = `Missing ${issues.join(' and ')} endpoint`;
    }
  }

  checks.push({
    category: 'endpoints',
    status: endpointsScore >= 70 ? 'pass' : endpointsScore >= 40 ? 'warning' : 'fail',
    score: endpointsScore,
    message: endpointsMessage,
  });

  // Reputation check (20% weight)
  let reputationScore = 0;
  let reputationMessage = '';

  const feedbackCount = agent.reputationCount ?? 0;
  const avgScore = agent.reputationScore ?? 0;

  if (feedbackCount === 0) {
    reputationScore = 50; // Neutral - no feedback yet
    reputationMessage = 'No feedback received yet';
  } else if (feedbackCount >= 10 && avgScore >= 70) {
    reputationScore = 100;
    reputationMessage = 'Strong reputation';
  } else if (feedbackCount >= 5 && avgScore >= 50) {
    reputationScore = 80;
    reputationMessage = 'Good reputation';
  } else if (feedbackCount >= 1 && avgScore >= 50) {
    reputationScore = 70;
    reputationMessage = 'Early reputation building';
  } else if (avgScore < 50) {
    reputationScore = 30;
    reputationMessage = 'Low reputation score';
  } else {
    reputationScore = 50;
    reputationMessage = 'Building reputation';
  }

  checks.push({
    category: 'reputation',
    status: reputationScore >= 70 ? 'pass' : reputationScore >= 40 ? 'warning' : 'fail',
    score: reputationScore,
    message: reputationMessage,
  });

  // Calculate weighted overall score
  // Extract scores with defaults (checks array always has 3 elements)
  const metaWeight = checks[0]?.score ?? 0;
  const endpointsWeight = checks[1]?.score ?? 0;
  const reputationWeight = checks[2]?.score ?? 0;
  const overallScore = Math.round(
    metaWeight * 0.4 + endpointsWeight * 0.4 + reputationWeight * 0.2
  );

  return {
    overallScore,
    checks,
  };
}

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

  /**
   * Search agents by reputation score using SDK's native reputation search
   * Uses minRep natively, maxRep via post-filtering
   */
  searchByReputation(params: ReputationSearchParams): Promise<ReputationSearchResult>;
}

/**
 * Create SDK service using agent0-sdk
 * When MOCK_EXTERNAL_SERVICES=true, returns a mock implementation for E2E testing
 */
export function createSDKService(env: Env): SDKService {
  // Use mock service for deterministic E2E testing
  if (env.MOCK_EXTERNAL_SERVICES === 'true') {
    return createMockSDKService();
  }

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

  /**
   * Transform SDK agent to our AgentSummary format
   */
  function transformAgent(agent: {
    agentId: string;
    name: string;
    description: string;
    image?: string;
    active: boolean;
    mcp: boolean;
    a2a: boolean;
    x402support: boolean;
    operators?: string[];
    ens?: string | null;
    did?: string | null;
    walletAddress?: string | null;
    mcpPrompts?: unknown[];
    mcpResources?: unknown[];
  }): AgentSummary {
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
  }

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-chain query and transformation logic requires multiple conditional branches
    async getAgents(params: GetAgentsParams): Promise<GetAgentsResult> {
      const {
        chainIds,
        limit = 20,
        cursor,
        active,
        hasMcp,
        hasA2a,
        hasX402,
        mcpTools,
        a2aSkills,
      } = params;

      // Determine which chains to query
      const chainsToQuery = chainIds
        ? SUPPORTED_CHAINS.filter((c) => chainIds.includes(c.chainId))
        : SUPPORTED_CHAINS;

      if (chainsToQuery.length === 0) {
        return { items: [], nextCursor: undefined, total: 0 };
      }

      // Build base search params (without chains - each SDK queries its own chain)
      const baseSearchParams: Omit<SearchParams, 'chains'> = {};
      // Filter by active status when explicitly specified
      if (active !== undefined) baseSearchParams.active = active;
      // Only pass true values to SDK - SDK subgraph filter doesn't correctly handle =false
      // (it looks for mcpEndpoint: null but agents may have empty string)
      // The =false cases are handled by post-filtering in routes/agents.ts
      if (hasMcp === true) baseSearchParams.mcp = true;
      if (hasA2a === true) baseSearchParams.a2a = true;
      if (hasX402 === true) baseSearchParams.x402support = true;
      if (mcpTools && mcpTools.length > 0) baseSearchParams.mcpTools = mcpTools;
      if (a2aSkills && a2aSkills.length > 0) baseSearchParams.a2aSkills = a2aSkills;

      try {
        // Single chain: use direct SDK query with cursor pagination
        if (chainsToQuery.length === 1) {
          const chainConfig = chainsToQuery[0];
          if (!chainConfig) {
            return { items: [], nextCursor: undefined, total: 0 };
          }
          const sdk = getSDK(chainConfig.chainId);
          const searchParams: SearchParams = {
            ...baseSearchParams,
            chains: [chainConfig.chainId],
          };
          const result = await sdk.searchAgents(searchParams, ['createdAt:desc'], limit, cursor);

          const items = result.items.map(transformAgent);
          const total = result.meta?.totalResults ?? items.length;

          return {
            items,
            nextCursor: result.nextCursor,
            total,
          };
        }

        // Multi-chain: query each chain separately and merge results
        // NOTE: The SDK's multi-chain support via subgraphOverrides doesn't work correctly -
        // it only queries the chain the SDK was initialized with. So we must query each chain
        // with its own SDK instance and merge the results manually.

        // For multi-chain queries, we use offset-based pagination via cursor encoding
        // Cursor format: JSON { chainOffsets: { [chainId]: number }, globalOffset: number }
        interface MultiChainCursor {
          chainOffsets: Record<number, number>;
          globalOffset: number;
        }

        let chainOffsets: Record<number, number> = {};
        let globalOffset = 0;

        if (cursor) {
          try {
            const decoded = JSON.parse(
              Buffer.from(cursor, 'base64url').toString()
            ) as MultiChainCursor;
            chainOffsets = decoded.chainOffsets || {};
            globalOffset = decoded.globalOffset || 0;
          } catch {
            // Invalid cursor, start from beginning
          }
        }

        // Query each chain in parallel with proportional limits
        // Request more items than needed to ensure we can fill the page after sorting
        const perChainLimit = Math.ceil(limit * 1.5);

        const chainPromises = chainsToQuery.map(async (chainConfig) => {
          const sdk = getSDK(chainConfig.chainId);
          const searchParams: SearchParams = {
            ...baseSearchParams,
            chains: [chainConfig.chainId],
          };

          // Use chain-specific cursor if available (for SDK's native pagination)
          const chainCursor = chainOffsets[chainConfig.chainId];
          const result = await sdk.searchAgents(
            searchParams,
            ['createdAt:desc'],
            perChainLimit,
            chainCursor ? String(chainCursor) : undefined
          );

          return {
            chainId: chainConfig.chainId,
            items: result.items.map(transformAgent),
            nextCursor: result.nextCursor,
            total: result.meta?.totalResults ?? result.items.length,
          };
        });

        const chainResults = await Promise.all(chainPromises);

        // Track totals and cursors from each chain
        let totalAcrossChains = 0;
        const newChainOffsets: Record<number, number> = {};

        for (const result of chainResults) {
          totalAcrossChains += result.total;
          // Track cursor for each chain
          if (result.nextCursor) {
            newChainOffsets[result.chainId] = Number.parseInt(result.nextCursor, 10) || 0;
          }
        }

        // Interleave results from all chains to ensure fair representation
        // Each chain's results are already sorted by createdAt (tokenId) desc
        // We interleave by taking items round-robin from each chain
        const chainItems = chainResults.map((r) => [...r.items]); // Copy arrays for mutation
        const interleavedItems: AgentSummary[] = [];

        while (interleavedItems.length < limit * 2) {
          // Check if all chains are exhausted
          let hasMore = false;
          for (const items of chainItems) {
            if (items.length > 0) {
              hasMore = true;
              const item = items.shift();
              if (item) {
                interleavedItems.push(item);
              }
            }
          }
          if (!hasMore) break;
        }

        // Apply pagination
        const paginatedItems = interleavedItems.slice(0, limit);
        const hasMore = interleavedItems.length > limit;

        // Create cursor for next page
        let nextCursor: string | undefined;
        if (hasMore) {
          const cursorData: MultiChainCursor = {
            chainOffsets: newChainOffsets,
            globalOffset: globalOffset + limit,
          };
          nextCursor = Buffer.from(JSON.stringify(cursorData)).toString('base64url');
        }

        return {
          items: paginatedItems,
          nextCursor,
          total: totalAcrossChains,
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

        // Fetch SDK data and subgraph extras in parallel
        const [agent, extras] = await Promise.all([
          sdk.getAgent(agentId),
          fetchAgentExtrasFromSubgraph(chainId, agentId),
        ]);

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
                  url: extras.mcpEndpoint ?? getExtraString(agent.extras, 'mcpEndpoint') ?? '',
                  version: extras.mcpVersion ?? '1.0.0',
                }
              : undefined,
            a2a: agent.a2a
              ? {
                  url: extras.a2aEndpoint ?? getExtraString(agent.extras, 'a2aEndpoint') ?? '',
                  version: extras.a2aVersion ?? '1.0.0',
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
            metadataUri: extras.agentURI ?? getExtraString(agent.extras, 'metadataUri') ?? '',
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
          // Last updated timestamp from subgraph (convert Unix timestamp to ISO)
          lastUpdatedAt: extras.updatedAt
            ? new Date(Number.parseInt(extras.updatedAt, 10) * 1000).toISOString()
            : undefined,
          // Compute quality/health warnings
          warnings: computeAgentWarnings({
            name: agent.name,
            description: agent.description,
            image: agent.image,
            mcp: agent.mcp,
            a2a: agent.a2a,
            mcpEndpoint: extras.mcpEndpoint,
            a2aEndpoint: extras.a2aEndpoint,
            reputationCount: undefined, // Will be populated when reputation is fetched
          }),
          // Compute aggregated health score
          healthScore: computeAgentHealthScore({
            name: agent.name,
            description: agent.description,
            image: agent.image,
            mcp: agent.mcp,
            a2a: agent.a2a,
            mcpEndpoint: extras.mcpEndpoint,
            a2aEndpoint: extras.a2aEndpoint,
            reputationCount: undefined, // Will be populated when reputation is fetched
            reputationScore: undefined,
          }),
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
        mcpTools,
        a2aSkills,
        filterMode = 'AND',
        limit = 20,
        cursor,
      } = params;

      // Parse cursor to get offset for local pagination
      // We do local pagination because we re-score and sort results
      let offset = 0;
      if (cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
          if (typeof decoded.offset === 'number') {
            offset = decoded.offset;
          }
        } catch {
          // Invalid cursor, start from beginning
        }
      }

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
        const _sdk = getSDK(primaryChain.chainId);

        // Build base search params
        const baseSearchParams: SearchParams = {
          chains: chainsToQuery.map((c) => c.chainId),
        };

        // NOTE: Do NOT pass query to SDK - its substring search is broken for old agents
        // Instead, we fetch all agents and filter locally by name/description

        // Filter by active status when explicitly specified
        if (active !== undefined) baseSearchParams.active = active;

        // Add MCP tools and A2A skills filters if provided
        if (mcpTools && mcpTools.length > 0) baseSearchParams.mcpTools = mcpTools;
        if (a2aSkills && a2aSkills.length > 0) baseSearchParams.a2aSkills = a2aSkills;

        let allItems: AgentSummary[] = [];

        // Calculate how many items to fetch to cover offset + limit + buffer
        const fetchLimit = Math.min(offset + limit + 50, 200);

        if (isOrMode) {
          // OR mode: run separate searches for each boolean filter AND each chain, then merge
          // We need to query each chain separately because SDK doesn't support multi-chain queries
          const searchPromises: Promise<AgentSummary[]>[] = [];

          for (const chainConfig of chainsToQuery) {
            const chainSdk = getSDK(chainConfig.chainId);

            for (const filter of booleanFilters) {
              const filterParams: SearchParams = {
                ...baseSearchParams,
                chains: [chainConfig.chainId],
              };
              if (filter === 'mcp') filterParams.mcp = true;
              if (filter === 'a2a') filterParams.a2a = true;
              if (filter === 'x402') filterParams.x402support = true;

              searchPromises.push(
                chainSdk.searchAgents(filterParams, ['createdAt:desc'], fetchLimit).then((result) =>
                  result.items.map((agent) => {
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
                  })
                )
              );
            }
          }

          const results = await Promise.all(searchPromises);

          // Merge and deduplicate by agentId
          const agentMap = new Map<string, AgentSummary>();
          for (const items of results) {
            for (const agent of items) {
              if (!agentMap.has(agent.id)) {
                agentMap.set(agent.id, agent);
              }
            }
          }
          allItems = [...agentMap.values()];
        } else {
          // AND mode: single search with all filters
          if (mcp !== undefined) baseSearchParams.mcp = mcp;
          if (a2a !== undefined) baseSearchParams.a2a = a2a;
          if (x402 !== undefined) baseSearchParams.x402support = x402;

          // SDK doesn't support fuzzy/substring search reliably for old agents
          // When query provided, search each chain separately for full pagination depth
          const queryLower = query?.trim().toLowerCase();

          if (queryLower) {
            // Search each chain separately to get full pagination depth
            const maxPagesPerChain = 20;
            const pageSize = 100;

            // Parallel search each chain
            const chainSearchPromises = chainsToQuery.map(async (chainConfig) => {
              const chainItems: AgentSummary[] = [];
              const chainSdk = getSDK(chainConfig.chainId);
              const chainParams = { ...baseSearchParams, chains: [chainConfig.chainId] };

              let cursor: string | undefined;
              let pagesChecked = 0;

              while (pagesChecked < maxPagesPerChain) {
                const result = await chainSdk.searchAgents(
                  chainParams,
                  ['createdAt:desc'],
                  pageSize,
                  cursor
                );

                for (const agent of result.items) {
                  const nameMatch = agent.name?.toLowerCase().includes(queryLower);
                  const descMatch = agent.description?.toLowerCase().includes(queryLower);
                  if (!nameMatch && !descMatch) continue;

                  const parts = agent.agentId.split(':');
                  const chainIdStr = parts[0] || '0';
                  const tokenId = parts[1] || '0';

                  chainItems.push({
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

                cursor = result.nextCursor;
                pagesChecked++;

                if (!cursor) break;
              }

              return chainItems;
            });

            const chainResults = await Promise.all(chainSearchPromises);

            // Merge results from all chains
            for (const items of chainResults) {
              allItems.push(...items);
            }
          } else {
            // No query - query each chain separately and merge results
            // SDK doesn't support multi-chain queries, so we must query each chain
            const perChainFetchLimit = Math.ceil(fetchLimit / chainsToQuery.length);

            const chainSearchPromises = chainsToQuery.map(async (chainConfig) => {
              const chainSdk = getSDK(chainConfig.chainId);
              const chainParams = { ...baseSearchParams, chains: [chainConfig.chainId] };
              const result = await chainSdk.searchAgents(
                chainParams,
                ['createdAt:desc'],
                perChainFetchLimit
              );
              return result.items;
            });

            const chainResults = await Promise.all(chainSearchPromises);

            for (const items of chainResults) {
              for (const agent of items) {
                const parts = agent.agentId.split(':');
                const chainIdStr = parts[0] || '0';
                const tokenId = parts[1] || '0';

                allItems.push({
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

        // Apply offset and limit for local pagination
        const limitedItems = scoredItems.slice(offset, offset + limit);
        const hasMore = scoredItems.length > offset + limit;

        // Generate cursor for pagination with accumulated offset
        let nextCursor: string | undefined;
        if (hasMore) {
          nextCursor = Buffer.from(JSON.stringify({ offset: offset + limit })).toString(
            'base64url'
          );
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

    async searchByReputation(params: ReputationSearchParams): Promise<ReputationSearchResult> {
      const { chainIds, minRep, maxRep, limit = 20, cursor } = params;

      // Determine which chains to query
      const chainsToQuery = chainIds
        ? SUPPORTED_CHAINS.filter((c) => chainIds.includes(c.chainId))
        : SUPPORTED_CHAINS;

      if (chainsToQuery.length === 0) {
        return { items: [], total: 0, hasMore: false };
      }

      try {
        const primaryChain = chainsToQuery[0];
        if (!primaryChain) {
          return { items: [], total: 0, hasMore: false };
        }
        const sdk = getSDK(primaryChain.chainId);

        // Use SDK's native reputation search with minAverageScore
        // Over-fetch if maxRep is set (we'll need to post-filter)
        const fetchLimit = maxRep !== undefined ? Math.min(limit * 3, 100) : limit;

        const result = await sdk.searchAgentsByReputation(
          undefined, // agents - no specific agent filter
          undefined, // tags
          undefined, // reviewers
          undefined, // capabilities
          undefined, // skills
          undefined, // tasks
          undefined, // names
          minRep, // minAverageScore - the key parameter
          undefined, // includeRevoked
          fetchLimit, // pageSize
          cursor, // cursor for pagination
          undefined, // sort
          chainsToQuery.map((c) => c.chainId) // chains
        );

        // Transform SDK results to our format
        let items: AgentSummary[] = result.items.map((agent) => {
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
            // Note: reputation data needs to be enriched by caller
          };
        });

        // Post-filter by maxRep if specified (SDK doesn't support this natively)
        // Note: We can't filter by reputationScore here because SDK doesn't return it
        // The route handler will need to enrich with reputation data and filter

        const total = result.meta?.totalResults ?? items.length;
        const hasMore = !!result.nextCursor || items.length >= fetchLimit;

        // Apply limit after any post-filtering
        if (items.length > limit) {
          items = items.slice(0, limit);
        }

        return {
          items,
          total,
          hasMore,
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        throw new SDKError('searchByReputation', error);
      }
    },
  };
}
