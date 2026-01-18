/**
 * Agent0 SDK service
 * @module services/sdk
 */

import type { SearchParams } from 'agent0-sdk';
import { SDK } from 'agent0-sdk';
import { circuitBreakers } from '@/lib/utils/circuit-breaker';
import { SDKError } from '@/lib/utils/errors';
import { deriveSupportedTrust } from '@/lib/utils/agent-transform';
import type {
  AgentDetail,
  AgentHealthCheck,
  AgentHealthScore,
  AgentSummary,
  AgentWarning,
  ChainStats,
  Env,
  SupportedChainId,
} from '@/types';
import { CACHE_TTL, hashQueryParams } from './cache';
import { createMockSDKService } from './mock/mock-sdk';
import {
  type AgentSortField,
  type CachedPaginationSet,
  decodeOffset,
  deduplicateAgents,
  generatePaginationCacheKey,
  getCachedPaginationSet,
  getPaginatedSlice,
  interleaveChainResults,
  type SortOrder,
  setCachedPaginationSet,
} from './pagination-cache';

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
 * Sanitize agentId for GraphQL queries
 * Validates format (chainId:tokenId) and ensures both parts are numeric
 * @throws Error if agentId format is invalid
 */
function sanitizeAgentIdForGraphQL(agentId: string): string {
  // Agent IDs must be in format chainId:tokenId (e.g., "11155111:123")
  const parts = agentId.split(':');
  if (parts.length !== 2) {
    throw new SDKError('sanitizeAgentIdForGraphQL', new Error(`Invalid agent ID format: ${agentId}`));
  }

  const [chainPart, tokenPart] = parts;
  const chainId = Number(chainPart);
  const tokenId = Number(tokenPart);

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new SDKError('sanitizeAgentIdForGraphQL', new Error(`Invalid chain ID in agent ID: ${agentId}`));
  }
  if (!Number.isInteger(tokenId) || tokenId < 0) {
    throw new SDKError('sanitizeAgentIdForGraphQL', new Error(`Invalid token ID in agent ID: ${agentId}`));
  }

  // Return sanitized format (strictly numeric)
  return `${chainId}:${tokenId}`;
}

/**
 * Sanitize numeric values for GraphQL queries
 * Ensures the value is a valid non-negative integer
 */
function sanitizeNumericForGraphQL(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new SDKError('sanitizeNumericForGraphQL', new Error(`Invalid ${name}: must be a non-negative integer`));
  }
  return value;
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  chainId: SupportedChainId;
  name: string;
  shortName: string;
  explorerUrl: string;
  rpcEnvKey: keyof Pick<
    Env,
    | 'SEPOLIA_RPC_URL'
    | 'BASE_SEPOLIA_RPC_URL'
    | 'POLYGON_AMOY_RPC_URL'
    | 'LINEA_SEPOLIA_RPC_URL'
    | 'HEDERA_TESTNET_RPC_URL'
    | 'HYPEREVM_TESTNET_RPC_URL'
    | 'SKALE_BASE_SEPOLIA_RPC_URL'
  >;
}

/**
 * Chain IDs with ERC-8004 v1.0 contracts actively deployed and indexed
 */
export const ACTIVE_CHAIN_IDS: Set<number> = new Set([
  11155111, // Ethereum Sepolia
  84532,    // Base Sepolia
  80002,    // Polygon Amoy
]);

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
  {
    chainId: 59141,
    name: 'Linea Sepolia',
    shortName: 'linea-sepolia',
    explorerUrl: 'https://sepolia.lineascan.build',
    rpcEnvKey: 'LINEA_SEPOLIA_RPC_URL',
  },
  {
    chainId: 296,
    name: 'Hedera Testnet',
    shortName: 'hedera-testnet',
    explorerUrl: 'https://hashscan.io/testnet',
    rpcEnvKey: 'HEDERA_TESTNET_RPC_URL',
  },
  {
    chainId: 998,
    name: 'HyperEVM Testnet',
    shortName: 'hyperevm-testnet',
    explorerUrl: 'https://testnet.purrsec.com',
    rpcEnvKey: 'HYPEREVM_TESTNET_RPC_URL',
  },
  {
    chainId: 1351057110,
    name: 'SKALE Base Sepolia',
    shortName: 'skale-base-sepolia',
    explorerUrl: 'https://wan-red-ain.explorer.mainnet.skalenodes.com',
    rpcEnvKey: 'SKALE_BASE_SEPOLIA_RPC_URL',
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
  /** Offset for pagination (alternative to cursor) */
  offset?: number;
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
  /** Sort field for results */
  sort?: AgentSortField;
  /** Sort order (default: desc) */
  order?: SortOrder;
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

// Import and re-export buildSubgraphUrls from centralized config
import {
  buildSubgraphUrls as _buildSubgraphUrls,
  buildSubgraphUrl,
  DEFAULT_GRAPH_API_KEY,
  getGraphKeyManager,
  SUBGRAPH_IDS,
} from '@/lib/config/graph';
export const buildSubgraphUrls = _buildSubgraphUrls;

/**
 * Execute a subgraph GraphQL query with circuit breaker protection
 * @param url - Subgraph URL
 * @param query - GraphQL query string
 * @returns Parsed JSON response or null on error
 */
async function fetchSubgraphWithCircuitBreaker<T>(url: string, query: string): Promise<T | null> {
  return circuitBreakers.theGraph
    .execute(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Subgraph error ${response.status}`);
      }

      return (await response.json()) as T;
    })
    .catch((error) => {
      // Log but don't throw for circuit open or other errors
      console.warn('[SDK] Subgraph call failed:', error.message);
      return null;
    });
}

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
 * Uses circuit breaker for resilience.
 * @param chainId - Chain ID
 * @param agentId - Agent ID in format "chainId:tokenId"
 * @returns Extra fields from subgraph
 */
async function fetchAgentExtrasFromSubgraph(
  chainId: number,
  agentId: string,
  subgraphUrls: Record<number, string>
): Promise<SubgraphAgentExtras> {
  const url = subgraphUrls[chainId];
  if (!url) return {};

  // Sanitize agentId to prevent GraphQL injection
  const sanitizedAgentId = sanitizeAgentIdForGraphQL(agentId);

  const query = `{
    agent(id: "${sanitizedAgentId}") {
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

  type SubgraphResponse = {
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

  const data = await fetchSubgraphWithCircuitBreaker<SubgraphResponse>(url, query);
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
}

/**
 * Feedback record from subgraph
 * Updated for ERC-8004 v1.0: added endpoint, feedbackIndex, feedbackHash
 */
export interface SubgraphFeedback {
  id: string;
  score: number;
  clientAddress: string;
  tag1?: string;
  tag2?: string;
  endpoint?: string; // v1.0: endpoint reference
  feedbackIndex?: number; // v1.0: per-client feedback index
  feedbackUri?: string;
  feedbackHash?: string; // v1.0: content hash
  createdAt: string;
  isRevoked: boolean;
}

/**
 * Validation record from subgraph
 */
export interface SubgraphValidation {
  id: string;
  validatorAddress: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  tag?: string;
  requestUri?: string;
  responseUri?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * AgentStats from subgraph - includes validation statistics and score distribution
 */
export interface SubgraphAgentStats {
  id: string;
  totalFeedback: number;
  totalValidations: number;
  completedValidations: number;
  pendingValidations: number;
  /** Average feedback score (0-100) */
  averageScore: number;
  /** Average validation score (0-100) */
  averageValidationScore: number;
  /** Score distribution: [0-20, 21-40, 41-60, 61-80, 81-100] */
  scoreDistribution: number[];
  /** Unique validators count */
  uniqueValidators: number;
  /** Unique feedback submitters count */
  uniqueSubmitters: number;
  updatedAt: string;
}

/**
 * Agent metadata entry from subgraph (on-chain key-value storage)
 */
export interface SubgraphAgentMetadata {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * Protocol stats from subgraph (per-chain statistics)
 */
export interface SubgraphProtocol {
  id: string;
  chainId: string;
  totalAgents: number;
  totalFeedback: number;
  totalValidations: number;
  /** All unique tags used in feedback */
  tags: string[];
  updatedAt: string;
}

/**
 * FeedbackResponse from subgraph - agent responses to feedback
 */
export interface SubgraphFeedbackResponse {
  id: string;
  responder: string;
  responseUri?: string;
  responseHash?: string;
  createdAt: string;
}

/**
 * Fetch feedbacks for an agent directly from subgraph
 * Uses circuit breaker for resilience.
 * @param chainId - Chain ID
 * @param agentId - Agent ID in format "chainId:tokenId"
 * @param limit - Maximum number of feedbacks to return
 * @returns Feedback records from subgraph
 */
export async function fetchFeedbacksFromSubgraph(
  chainId: number,
  agentId: string,
  subgraphUrls: Record<number, string>,
  limit = 100
): Promise<SubgraphFeedback[]> {
  const url = subgraphUrls[chainId];
  if (!url) return [];

  // Sanitize inputs to prevent GraphQL injection
  const sanitizedAgentId = sanitizeAgentIdForGraphQL(agentId);
  const sanitizedLimit = sanitizeNumericForGraphQL(limit, 'limit');

  const query = `{
    feedbacks(where: {agent: "${sanitizedAgentId}"}, first: ${sanitizedLimit}, orderBy: createdAt, orderDirection: desc) {
      id
      score
      clientAddress
      tag1
      tag2
      feedbackUri
      createdAt
      isRevoked
    }
  }`;

  type FeedbackResponse = {
    data?: {
      feedbacks?: SubgraphFeedback[];
    };
  };

  const data = await fetchSubgraphWithCircuitBreaker<FeedbackResponse>(url, query);
  return data?.data?.feedbacks || [];
}

/**
 * Fetch validations for an agent directly from subgraph
 * Uses circuit breaker for resilience.
 * @param chainId - Chain ID
 * @param agentId - Agent ID in format "chainId:tokenId"
 * @param limit - Maximum number of validations to return
 * @returns Validation records from subgraph
 */
export async function fetchValidationsFromSubgraph(
  chainId: number,
  agentId: string,
  subgraphUrls: Record<number, string>,
  limit = 100
): Promise<SubgraphValidation[]> {
  const url = subgraphUrls[chainId];
  if (!url) return [];

  // Sanitize inputs to prevent GraphQL injection
  const sanitizedAgentId = sanitizeAgentIdForGraphQL(agentId);
  const sanitizedLimit = sanitizeNumericForGraphQL(limit, 'limit');

  const query = `{
    validations(where: {agent: "${sanitizedAgentId}"}, first: ${sanitizedLimit}, orderBy: createdAt, orderDirection: desc) {
      id
      validatorAddress
      status
      tag
      requestUri
      responseUri
      createdAt
      updatedAt
    }
  }`;

  type ValidationResponse = {
    data?: {
      validations?: SubgraphValidation[];
    };
  };

  const data = await fetchSubgraphWithCircuitBreaker<ValidationResponse>(url, query);
  return data?.data?.validations || [];
}

/**
 * Fetch AgentStats for an agent directly from subgraph
 * Includes validation statistics and score distribution
 * @param chainId - Chain ID
 * @param agentId - Agent ID in format "chainId:tokenId"
 * @returns AgentStats from subgraph or null if not found
 */
export async function fetchAgentStatsFromSubgraph(
  chainId: number,
  agentId: string,
  subgraphUrls: Record<number, string>
): Promise<SubgraphAgentStats | null> {
  const url = subgraphUrls[chainId];
  if (!url) return null;

  // Sanitize inputs to prevent GraphQL injection
  const sanitizedAgentId = sanitizeAgentIdForGraphQL(agentId);

  // AgentStats ID is the same as agent ID
  const query = `{
    agentStats(id: "${sanitizedAgentId}") {
      id
      totalFeedback
      totalValidations
      completedValidations
      pendingValidations
      averageScore
      averageValidationScore
      scoreDistribution
      uniqueValidators
      uniqueSubmitters
      updatedAt
    }
  }`;

  type AgentStatsResponse = {
    data?: {
      agentStats?: SubgraphAgentStats | null;
    };
  };

  const data = await fetchSubgraphWithCircuitBreaker<AgentStatsResponse>(url, query);
  return data?.data?.agentStats || null;
}

/**
 * Fetch on-chain metadata for an agent directly from subgraph
 * Metadata is key-value pairs stored on-chain via setMetadata()
 * @param chainId - Chain ID
 * @param agentId - Agent ID in format "chainId:tokenId"
 * @returns Array of metadata entries
 */
export async function fetchAgentMetadataFromSubgraph(
  chainId: number,
  agentId: string,
  subgraphUrls: Record<number, string>
): Promise<SubgraphAgentMetadata[]> {
  const url = subgraphUrls[chainId];
  if (!url) return [];

  // Sanitize inputs to prevent GraphQL injection
  const sanitizedAgentId = sanitizeAgentIdForGraphQL(agentId);

  const query = `{
    agentMetadatas(where: {agent: "${sanitizedAgentId}"}, orderBy: updatedAt, orderDirection: desc) {
      id
      key
      value
      updatedAt
    }
  }`;

  type MetadataResponse = {
    data?: {
      agentMetadatas?: SubgraphAgentMetadata[];
    };
  };

  const data = await fetchSubgraphWithCircuitBreaker<MetadataResponse>(url, query);
  return data?.data?.agentMetadatas || [];
}

/**
 * Fetch Protocol statistics for a chain
 * Includes totals for agents, feedback, validations
 * @param chainId - Chain ID
 * @returns Protocol stats or null if not found
 */
export async function fetchProtocolStatsFromSubgraph(
  chainId: number,
  subgraphUrls: Record<number, string>
): Promise<SubgraphProtocol | null> {
  const url = subgraphUrls[chainId];
  if (!url) return null;

  // Protocol ID is the chainId as string
  const query = `{
    protocol(id: "${chainId}") {
      id
      chainId
      totalAgents
      totalFeedback
      totalValidations
      tags
      updatedAt
    }
  }`;

  type ProtocolResponse = {
    data?: {
      protocol?: SubgraphProtocol | null;
    };
  };

  const data = await fetchSubgraphWithCircuitBreaker<ProtocolResponse>(url, query);
  return data?.data?.protocol || null;
}

/**
 * Fetch FeedbackResponses for a specific feedback entry
 * @param chainId - Chain ID
 * @param feedbackId - Feedback ID
 * @returns Array of feedback responses
 */
export async function fetchFeedbackResponsesFromSubgraph(
  chainId: number,
  feedbackId: string,
  subgraphUrls: Record<number, string>
): Promise<SubgraphFeedbackResponse[]> {
  const url = subgraphUrls[chainId];
  if (!url) return [];

  // Sanitize feedbackId to prevent injection
  if (!/^[a-zA-Z0-9:_-]+$/.test(feedbackId)) {
    return [];
  }

  const query = `{
    feedbackResponses(where: {feedback: "${feedbackId}"}, orderBy: createdAt, orderDirection: desc) {
      id
      responder
      responseUri
      responseHash
      createdAt
    }
  }`;

  type FeedbackResponsesResponse = {
    data?: {
      feedbackResponses?: SubgraphFeedbackResponse[];
    };
  };

  const data = await fetchSubgraphWithCircuitBreaker<FeedbackResponsesResponse>(url, query);
  return data?.data?.feedbackResponses || [];
}

/**
 * Raw agent data from subgraph (includes agents without registration files)
 * Updated for ERC-8004 v1.0: agentWallet is now on Agent entity, agentWalletChainId removed
 */
export interface SubgraphRawAgent {
  id: string; // format: "chainId:tokenId"
  chainId: string;
  agentId: string;
  agentURI: string | null;
  agentWallet: string | null; // v1.0: On-chain verified wallet (moved from registrationFile)
  owner: string; // Single owner address
  operators: string[];
  createdAt: string;
  updatedAt: string;
  registrationFile: {
    name: string;
    description: string;
    image: string | null;
    active: boolean;
    mcpEndpoint: string | null;
    a2aEndpoint: string | null;
    x402support: boolean;
    ens: string | null;
    did: string | null;
    // NOTE: agentWallet and agentWalletChainId removed in ERC-8004 v1.0
    mcpVersion: string | null;
    a2aVersion: string | null;
    supportedTrusts: string[] | null;
    mcpTools?: Array<{ name: string }>;
    mcpPrompts?: Array<{ name: string }>;
    mcpResources?: Array<{ name: string }>;
    a2aSkills?: Array<{ name: string }>;
    createdAt?: string;
  } | null;
}

/**
 * Fetch ALL agents from subgraph directly (bypassing SDK's registrationFile filter)
 *
 * This function queries the subgraph GraphQL API directly to get ALL agents,
 * including those without registration files. The SDK's searchAgents method
 * hardcodes `registrationFile_not: null` which excludes agents without metadata.
 *
 * @param chainId - Chain ID to query
 * @param options - Query options
 * @returns Array of raw agents from subgraph
 */
export async function fetchAllAgentsFromSubgraph(
  chainId: number,
  subgraphUrls: Record<number, string>,
  options: {
    /** Include only agents WITH registration files (default: false = include ALL) */
    withRegistrationFileOnly?: boolean;
    /** Maximum agents to fetch (default: 5000) */
    limit?: number;
    /** Pagination skip offset */
    skip?: number;
  } = {}
): Promise<SubgraphRawAgent[]> {
  const { withRegistrationFileOnly = false, limit = 5000, skip = 0 } = options;
  const url = subgraphUrls[chainId];
  if (!url) return [];

  const allAgents: SubgraphRawAgent[] = [];
  let currentSkip = skip;
  const batchSize = Math.min(1000, limit); // Graph has 1000 limit per query

  // Build WHERE clause
  const whereClause = withRegistrationFileOnly ? 'where: { registrationFile_not: null }' : ''; // No filter = all agents

  while (allAgents.length < limit) {
    // ERC-8004 v1.0: agentWallet is now on Agent entity, agentWalletChainId removed
    const query = `{
      agents(
        first: ${batchSize}
        skip: ${currentSkip}
        orderBy: agentId
        ${whereClause}
      ) {
        id
        chainId
        agentId
        agentURI
        agentWallet
        owner
        operators
        createdAt
        updatedAt
        registrationFile {
          name
          description
          image
          active
          mcpEndpoint
          a2aEndpoint
          x402support
          ens
          did
          mcpVersion
          a2aVersion
          supportedTrusts
          mcpTools { name }
          mcpPrompts { name }
          mcpResources { name }
          a2aSkills { name }
          createdAt
        }
      }
    }`;

    type AgentsResponse = {
      data?: { agents?: SubgraphRawAgent[] };
      errors?: Array<{ message: string }>;
    };

    const data = await fetchSubgraphWithCircuitBreaker<AgentsResponse>(url, query);

    if (!data) {
      // Circuit breaker triggered or request failed
      break;
    }

    if (data.errors?.length) {
      console.error(`Subgraph errors for chain ${chainId}:`, data.errors[0]?.message);
      break;
    }

    const agents = data?.data?.agents || [];
    if (agents.length === 0) break;

    allAgents.push(...agents);
    currentSkip += agents.length;

    // If we got less than batch size, no more results
    if (agents.length < batchSize) break;

    // Safety limit to prevent infinite loops
    if (currentSkip > 20000) {
      console.warn(
        `fetchAllAgentsFromSubgraph: hit safety limit at ${currentSkip} for chain ${chainId}`
      );
      break;
    }
  }

  return allAgents.slice(0, limit);
}

/**
 * Fetch reputation summary from SDK
 * @param sdk - SDK instance
 * @param agentId - Agent ID in format "chainId:tokenId"
 * @returns Reputation summary or null
 */
export async function fetchReputationFromSDK(
  sdk: SDK,
  agentId: string
): Promise<{ count: number; averageScore: number } | null> {
  try {
    const result = await sdk.getReputationSummary(agentId);
    if (result && typeof result.count === 'number' && typeof result.averageScore === 'number') {
      return { count: result.count, averageScore: result.averageScore };
    }
    return null;
  } catch {
    return null;
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Health scoring requires evaluating multiple agent attributes
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
   * Get multiple agents by IDs in parallel
   * Efficiently fetches multiple agents, avoiding N+1 queries
   */
  getAgentsBatch(agentIds: string[]): Promise<Map<string, AgentDetail>>;

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
 * @param env - Environment bindings
 * @param cache - Optional KV namespace for pagination caching (enables consistent multi-chain pagination)
 */
export function createSDKService(env: Env, cache?: KVNamespace): SDKService {
  // Use mock service for deterministic E2E testing
  // Defense-in-depth: also check ENVIRONMENT to prevent accidental mock in production
  if (env.MOCK_EXTERNAL_SERVICES === 'true' && env.ENVIRONMENT !== 'production') {
    return createMockSDKService();
  }

  // Build subgraph URLs using the Graph API key
  // Use env.GRAPH_API_KEY if set, otherwise fall back to the public SDK key
  const graphApiKey = env.GRAPH_API_KEY || DEFAULT_GRAPH_API_KEY;
  const subgraphUrls = buildSubgraphUrls(graphApiKey);

  // Create key manager for direct subgraph queries (stats, etc.)
  // Uses round-robin rotation between SDK key and user key (if different)
  const keyManager = getGraphKeyManager(env.GRAPH_API_KEY, 'round-robin');

  // Cache SDK instances per chain
  const sdkInstances = new Map<number, SDK>();

  function getSDK(chainId: number): SDK {
    const existing = sdkInstances.get(chainId);
    if (existing) return existing;

    const config = getChainConfig(chainId);
    if (!config) throw new Error(`Unsupported chain: ${chainId}`);
    const rpcUrl = env[config.rpcEnvKey];
    // Pass subgraphOverrides for multi-chain query support
    const sdk = new SDK({ chainId, rpcUrl, subgraphOverrides: subgraphUrls });
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
        offset,
        active,
        hasMcp,
        hasA2a,
        hasX402,
        mcpTools,
        a2aSkills,
        hasRegistrationFile,
        sort,
        order,
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
      // Note: hasRegistrationFile is handled by post-filtering as SDK doesn't support it directly

      try {
        // Single chain: use direct SDK query with cursor/offset pagination
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

          // Use offset as cursor if provided (SDK accepts offset as cursor string)
          const effectiveCursor = cursor ?? (offset !== undefined ? String(offset) : undefined);
          const result = await sdk.searchAgents(searchParams, {
            sort: ['createdAt:desc'],
            pageSize: limit,
            cursor: effectiveCursor,
          });

          const items = result.items.map(transformAgent);
          const total = result.meta?.totalResults ?? items.length;

          // Calculate if there are more results
          const currentOffset = offset ?? ((cursor ? Number.parseInt(cursor, 10) : 0) || 0);
          const hasMore = currentOffset + items.length < total;

          return {
            items,
            nextCursor: hasMore ? String(currentOffset + limit) : undefined,
            total,
          };
        }

        // Multi-chain: use cached pagination for consistent results across pages
        // NOTE: The SDK's multi-chain support via subgraphOverrides doesn't work correctly -
        // it only queries the chain the SDK was initialized with. So we must query each chain
        // with its own SDK instance and merge the results manually.

        // Calculate global offset from cursor or offset parameter
        let globalOffset = 0;
        if (offset !== undefined) {
          globalOffset = offset;
        } else if (cursor) {
          globalOffset = decodeOffset(cursor);
        }

        // Generate cache key from filter parameters (excludes pagination params)
        const cacheParams = {
          chainIds: chainsToQuery.map((c) => c.chainId),
          active,
          hasMcp,
          hasA2a,
          hasX402,
          mcpTools,
          a2aSkills,
          hasRegistrationFile,
          sort,
          order,
        };
        const cacheKey = generatePaginationCacheKey(cacheParams);
        const filterHash = hashQueryParams(cacheParams);

        // Check cache for existing pagination set
        if (cache) {
          const cachedSet = await getCachedPaginationSet(cache, cacheKey);
          if (cachedSet) {
            // Cache hit: return slice from cached set
            const sliceResult = getPaginatedSlice(cachedSet, globalOffset, limit, sort, order);
            return {
              items: sliceResult.items,
              nextCursor: sliceResult.nextCursor,
              total: sliceResult.total,
            };
          }
        }

        // Cache miss: fetch all results from all chains and cache them
        // Query each chain in parallel, fetching larger batches for caching
        const maxItemsPerChain = 200; // Fetch up to 200 items per chain for caching

        const chainPromises = chainsToQuery.map(async (chainConfig) => {
          const sdk = getSDK(chainConfig.chainId);
          const searchParams: SearchParams = {
            ...baseSearchParams,
            chains: [chainConfig.chainId],
          };

          // Fetch multiple pages to get comprehensive results
          const allChainItems: AgentSummary[] = [];
          let chainCursor: string | undefined;
          let itemsFetched = 0;
          const pageSize = 100;

          while (itemsFetched < maxItemsPerChain) {
            const result = await sdk.searchAgents(searchParams, {
              sort: ['createdAt:desc'],
              pageSize,
              cursor: chainCursor,
            });

            const items = result.items.map(transformAgent);
            allChainItems.push(...items);
            itemsFetched += items.length;

            chainCursor = result.nextCursor;
            if (!chainCursor || items.length < pageSize) break;
          }

          return {
            chainId: chainConfig.chainId,
            items: allChainItems,
          };
        });

        const chainResults = await Promise.allSettled(chainPromises);

        // Collect successful chain results
        const successfulChains: Array<{ chainId: number; items: AgentSummary[] }> = [];
        for (const result of chainResults) {
          if (result.status === 'fulfilled') {
            successfulChains.push(result.value);
          } else {
            // Only log unexpected errors - suppress expected failures for chains pending v1.0 deployment
            const errorMessage = result.reason?.message ?? String(result.reason);
            const isExpectedError =
              errorMessage.includes('subgraph not found') ||
              errorMessage.includes('not authorized') ||
              errorMessage.includes('has no field');

            if (!isExpectedError) {
              console.warn('Multi-chain pagination: chain query failed:', result.reason);
            }
          }
        }

        // Interleave results from different chains in round-robin fashion
        // This ensures fair representation from all chains in paginated results
        // Each chain's results are sorted by tokenId before interleaving
        const interleavedItems = interleaveChainResults(successfulChains);

        // Deduplicate by agent ID (in case same agent appears somehow)
        const sortedItems = deduplicateAgents(interleavedItems);

        // Cache the full sorted set for subsequent page requests
        if (cache) {
          await setCachedPaginationSet(
            cache,
            cacheKey,
            sortedItems,
            filterHash,
            CACHE_TTL.PAGINATION_SET
          );
        }

        // Return slice for current page with optional custom sort
        const cachedSet: CachedPaginationSet = {
          items: sortedItems,
          total: sortedItems.length,
          filterHash,
          cachedAt: Date.now(),
        };
        const sliceResult = getPaginatedSlice(cachedSet, globalOffset, limit, sort, order);

        return {
          items: sliceResult.items,
          nextCursor: sliceResult.nextCursor,
          total: sliceResult.total,
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
          fetchAgentExtrasFromSubgraph(chainId, agentId, subgraphUrls),
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

    async getAgentsBatch(agentIds: string[]): Promise<Map<string, AgentDetail>> {
      const result = new Map<string, AgentDetail>();
      if (agentIds.length === 0) return result;

      // Process in parallel with concurrency limit
      const BATCH_SIZE = 10;
      const batches: string[][] = [];
      for (let i = 0; i < agentIds.length; i += BATCH_SIZE) {
        batches.push(agentIds.slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(async (agentId) => {
            const [chainIdStr, tokenId] = agentId.split(':');
            if (!chainIdStr || !tokenId) return null;
            const chainId = Number.parseInt(chainIdStr, 10);
            if (Number.isNaN(chainId)) return null;
            const agent = await this.getAgent(chainId, tokenId);
            return agent ? { agentId, agent } : null;
          })
        );

        for (const r of batchResults) {
          if (r.status === 'fulfilled' && r.value) {
            result.set(r.value.agentId, r.value.agent);
          }
        }
      }

      return result;
    },

    async getChainStats(): Promise<ChainStats[]> {
      // Request coalescing: if a request is already in progress, return the same promise
      // This prevents duplicate concurrent calls when cache is empty
      if (pendingChainStatsPromise) {
        return pendingChainStatsPromise;
      }

      /**
       * Helper to count agents via direct subgraph query with optional filter
       * Uses GraphKeyManager for key rotation and circuit breaker for resilience
       * @param chainId - Chain ID to query
       * @param whereClause - Optional GraphQL where clause (e.g., "registrationFile_: { active: true }")
       */
      async function countAgentsDirectly(chainId: number, whereClause?: string): Promise<number> {
        // Check if chain has a subgraph deployment
        if (!(chainId in SUBGRAPH_IDS)) return 0;

        // Use key manager with retry for key rotation
        return keyManager.executeWithRetry(async (apiKey) => {
          const url = buildSubgraphUrl(chainId, apiKey);
          if (!url) return 0;

          let total = 0;
          let skip = 0;
          const whereFilter = whereClause ? `where: { ${whereClause} }, ` : '';

          while (true) {
            const query = `{ agents(first: 1000, skip: ${skip}, ${whereFilter}orderBy: agentId, orderDirection: asc) { id } }`;
            type CountResponse = { data?: { agents?: { id: string }[] } };
            const data = await fetchSubgraphWithCircuitBreaker<CountResponse>(url, query);

            if (!data) {
              // Circuit breaker triggered - throw to trigger key rotation
              throw new Error(`Subgraph query failed for chain ${chainId}`);
            }

            const agents = data?.data?.agents || [];
            const count = agents.length;

            if (count === 0) break;
            total += count;
            if (count < 1000) break;
            skip += 1000;
            if (skip > 10000) break; // Safety limit
          }

          return total;
        });
      }

      // Specific count functions using direct subgraph queries
      const countAllAgents = (chainId: number) => countAgentsDirectly(chainId);
      const countWithRegistrationFile = (chainId: number) =>
        countAgentsDirectly(chainId, 'registrationFile_: { id_not: null }');
      const countActiveAgents = (chainId: number) =>
        countAgentsDirectly(chainId, 'registrationFile_: { active: true }');

      // Fetch stats for a single chain - all 3 counts in parallel via direct subgraph queries
      async function getStatsForChain(
        chain: (typeof SUPPORTED_CHAINS)[number]
      ): Promise<ChainStats> {
        // Run all 3 counts in parallel using direct subgraph queries
        // This bypasses the SDK which has schema mismatches with v1.0 subgraph
        const results = await Promise.allSettled([
          countAllAgents(chain.chainId),
          countWithRegistrationFile(chain.chainId),
          countActiveAgents(chain.chainId),
        ]);

        // Extract values, falling back to 0 on failure
        const totalCount = results[0].status === 'fulfilled' ? results[0].value : 0;
        const withRegFileCount = results[1].status === 'fulfilled' ? results[1].value : 0;
        const activeCount = results[2].status === 'fulfilled' ? results[2].value : 0;

        // Log any failures (expected for chains without subgraphs)
        const failedResults = results.filter((r) => r.status === 'rejected');
        if (failedResults.length > 0 && failedResults.length < results.length) {
          // Only log if some succeeded (not all failed due to missing subgraph)
          console.warn(
            `Partial stats failure for chain ${chain.chainId}: ${failedResults.length}/${results.length} queries failed`
          );
        }

        // Determine status based on query success
        const allSucceeded = results.every((r) => r.status === 'fulfilled');
        const anySucceeded = results.some((r) => r.status === 'fulfilled');
        const status = allSucceeded ? 'ok' : anySucceeded ? 'partial' : 'error';

        return {
          chainId: chain.chainId,
          name: chain.name,
          shortName: chain.shortName,
          explorerUrl: chain.explorerUrl,
          totalCount,
          withRegistrationFileCount: withRegFileCount,
          activeCount,
          status: status as 'ok' | 'error',
          deploymentStatus: ACTIVE_CHAIN_IDS.has(chain.chainId) ? 'active' : 'pending',
        };
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
                chainSdk
                  .searchAgents(filterParams, { sort: ['createdAt:desc'], pageSize: fetchLimit })
                  .then((result) => result.items.map(transformAgent))
              );
            }
          }

          const results = await Promise.allSettled(searchPromises);

          // Merge and deduplicate by agentId (only from successful chain queries)
          const agentMap = new Map<string, AgentSummary>();
          for (const result of results) {
            if (result.status === 'fulfilled') {
              for (const agent of result.value) {
                if (!agentMap.has(agent.id)) {
                  agentMap.set(agent.id, agent);
                }
              }
            } else {
              console.warn('Chain search failed in OR mode:', result.reason);
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
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-chain search requires pagination and result aggregation
            const chainSearchPromises = chainsToQuery.map(async (chainConfig) => {
              const chainItems: AgentSummary[] = [];
              const chainSdk = getSDK(chainConfig.chainId);
              const chainParams = { ...baseSearchParams, chains: [chainConfig.chainId] };

              let cursor: string | undefined;
              let pagesChecked = 0;

              while (pagesChecked < maxPagesPerChain) {
                const result = await chainSdk.searchAgents(chainParams, {
                  sort: ['createdAt:desc'],
                  pageSize,
                  cursor,
                });

                for (const agent of result.items) {
                  const nameMatch = agent.name?.toLowerCase().includes(queryLower);
                  const descMatch = agent.description?.toLowerCase().includes(queryLower);
                  if (!nameMatch && !descMatch) continue;

                  chainItems.push(transformAgent(agent));
                }

                cursor = result.nextCursor;
                pagesChecked++;

                if (!cursor) break;
              }

              return chainItems;
            });

            const chainResults = await Promise.allSettled(chainSearchPromises);

            // Merge results from all chains (only from successful queries)
            for (const result of chainResults) {
              if (result.status === 'fulfilled') {
                allItems.push(...result.value);
              } else {
                console.warn('Chain search failed with query:', result.reason);
              }
            }
          } else {
            // No query - query each chain separately and merge results
            // SDK doesn't support multi-chain queries, so we must query each chain
            const perChainFetchLimit = Math.ceil(fetchLimit / chainsToQuery.length);

            const chainSearchPromises = chainsToQuery.map(async (chainConfig) => {
              const chainSdk = getSDK(chainConfig.chainId);
              const chainParams = { ...baseSearchParams, chains: [chainConfig.chainId] };
              const result = await chainSdk.searchAgents(chainParams, {
                sort: ['createdAt:desc'],
                pageSize: perChainFetchLimit,
              });
              return result.items;
            });

            const chainResults = await Promise.allSettled(chainSearchPromises);

            for (const result of chainResults) {
              if (result.status === 'fulfilled') {
                allItems.push(...result.value.map(transformAgent));
              } else {
                console.warn('Chain search failed without query:', result.reason);
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
          { minAverageScore: minRep },
          {
            pageSize: fetchLimit,
            cursor,
            chains: chainsToQuery.map((c) => c.chainId),
          }
        );

        // Transform SDK results to our format
        let items: AgentSummary[] = result.items.map(transformAgent);

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
