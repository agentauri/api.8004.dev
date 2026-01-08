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
  /** Filter by MCP tools */
  mcpTools?: string[];
  /** Filter by A2A skills */
  a2aSkills?: string[];
  /** Minimum reputation score */
  minRep?: number;
  /** Maximum reputation score */
  maxRep?: number;
  /** Filter by owner wallet address */
  owner?: string;
  /** Filter by agent wallet address */
  walletAddress?: string;
  /** Filter by specific trust models */
  trustModels?: string[];
  /** Filter by agents with trust models */
  hasTrusts?: boolean;
  /** Filter by A2A reachability */
  reachableA2a?: boolean;
  /** Filter by MCP reachability */
  reachableMcp?: boolean;
  /** Filter by registration file presence */
  hasRegistrationFile?: boolean;
  /** Filter by exact ENS name */
  ens?: string;
  /** Filter by exact DID */
  did?: string;
  /** Exclude agents with these chain IDs */
  excludeChainIds?: number[];
  /** Exclude agents with these skills */
  excludeSkills?: string[];
  /** Exclude agents with these domains */
  excludeDomains?: string[];
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
  /** Owner wallet address */
  owner?: string;
  /** x402 support flag (alternate name) */
  x402support?: boolean;
  /** Supported trust methods */
  supportedTrusts?: string[];
  /** Agent wallet (alternate name) */
  agentWallet?: string;
  /** Input modes (from A2A AgentCard) */
  inputModes?: string[];
  /** Output modes (from A2A AgentCard) */
  outputModes?: string[];
  /** OASF skills with confidence scores (Phase 2) */
  skills_with_confidence?: Array<{ slug: string; confidence: number; reasoning?: string }>;
  /** OASF domains with confidence scores (Phase 2) */
  domains_with_confidence?: Array<{ slug: string; confidence: number; reasoning?: string }>;
  /** Overall classification confidence (Phase 2) */
  classification_confidence?: number;
  /** Classification timestamp (Phase 2) */
  classification_at?: string;
  /** Classification model version (Phase 2) */
  classification_model?: string;
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
 * Search mode indicator for response
 * - 'vector': Semantic/vector search using external service (primary)
 * - 'fallback': SDK-based substring search (when vector search is unavailable)
 * - 'name': Direct name substring search via SDK (user requested)
 */
export type SearchMode = 'vector' | 'fallback' | 'name';

/**
 * Search mode input parameter
 * - 'semantic': Use semantic/vector search (default)
 * - 'name': Use SDK name substring search
 * - 'auto': Try semantic first, fall back to name if no results
 */
export type SearchModeInput = 'semantic' | 'name' | 'auto';

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
    /** Search mode used (vector, fallback, or name) */
    searchMode?: SearchMode;
  };
}
