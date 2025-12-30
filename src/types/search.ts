/**
 * Search-related type definitions
 * @module types/search
 */

import type { AgentSummary } from './agent';

/**
 * Search filters for agents
 */
export interface SearchFilters {
  /** Filter by chain IDs */
  chainIds?: number[];
  /** Filter by active status */
  active?: boolean;
  /** Filter by MCP support */
  mcp?: boolean;
  /** Filter by A2A support */
  a2a?: boolean;
  /** Filter by x402 support */
  x402?: boolean;
  /** Filter by OASF skills */
  skills?: string[];
  /** Filter by OASF domains */
  domains?: string[];
  /** Filter mode: AND (all filters must match) or OR (any filter matches) */
  filterMode?: 'AND' | 'OR';
}

/**
 * Search request body
 */
export interface SearchRequest {
  /** Natural language search query */
  query: string;
  /** Search filters */
  filters?: SearchFilters;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Maximum results to return */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
}

/**
 * Typed metadata for search results
 */
export interface SearchResultMetadata {
  /** Agent active status */
  active?: boolean;
  /** Has MCP support */
  hasMcp?: boolean;
  /** Has A2A support */
  hasA2a?: boolean;
  /** Has x402 support */
  x402Support?: boolean;
  /** OASF skills */
  skills?: string[];
  /** OASF domains */
  domains?: string[];
  /** Reputation score */
  reputation?: number;
  /** Agent image URL */
  image?: string;
  /** ENS name */
  ens?: string;
  /** DID identifier */
  did?: string;
  /** Wallet address */
  walletAddress?: string;
  /** MCP tools */
  mcpTools?: string[];
  /** MCP prompts */
  mcpPrompts?: string[];
  /** MCP resources */
  mcpResources?: string[];
  /** A2A skills */
  a2aSkills?: string[];
  /** Operators */
  operators?: string[];
  /** x402 support flag (alternate name) */
  x402support?: boolean;
  /** Supported trust methods */
  supportedTrusts?: string[];
  /** Agent wallet (alternate name) */
  agentWallet?: string;
}

/**
 * Individual search result from search-service
 */
export interface SearchResultItem {
  /** Agent ID in format chainId:tokenId */
  agentId: string;
  /** Blockchain chain ID */
  chainId: number;
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Similarity score (0-1) */
  score: number;
  /** Additional metadata */
  metadata?: SearchResultMetadata;
  /** Reasons why this agent matched the query */
  matchReasons?: string[];
}

/**
 * Search result from search-service
 */
export interface SearchServiceResult {
  /** List of matching agents */
  results: SearchResultItem[];
  /** Total number of matches */
  total: number;
  /** Whether more results exist */
  hasMore: boolean;
  /** Next pagination cursor */
  nextCursor?: string;
  /** Result count breakdown by chain ID */
  byChain?: Record<number, number>;
}

/**
 * Chain stats breakdown for search results
 */
export interface SearchChainStats {
  chainId: number;
  name: string;
  totalCount: number;
  withRegistrationFileCount: number;
  activeCount: number;
}

/**
 * Platform-wide stats included in search results
 */
export interface SearchStats {
  /** Total agents across all chains */
  total: number;
  /** Agents with registration file across all chains */
  withRegistrationFile: number;
  /** Active agents across all chains */
  active: number;
  /** Breakdown by chain */
  byChain: SearchChainStats[];
}

/**
 * Search mode indicator
 * - 'vector': Semantic/vector search using external service (primary)
 * - 'fallback': SDK-based substring search (when vector search is unavailable)
 */
export type SearchMode = 'vector' | 'fallback';

/**
 * Search API response
 */
export interface SearchResponse {
  success: true;
  data: AgentSummary[];
  meta: {
    /** Original query */
    query: string;
    /** Total number of matches */
    total: number;
    /** Whether more results exist */
    hasMore: boolean;
    /** Next pagination cursor */
    nextCursor?: string;
    /** Result count breakdown by chain ID */
    byChain?: Record<number, number>;
    /** Platform-wide agent statistics */
    stats?: SearchStats;
    /** Search mode used (vector or fallback) */
    searchMode?: SearchMode;
  };
}
