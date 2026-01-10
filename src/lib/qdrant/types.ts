/**
 * Qdrant vector database types
 * @module lib/qdrant/types
 */

/**
 * MCP Tool with full details stored in Qdrant
 */
export interface McpToolPayload {
  /** Tool name (identifier) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP Prompt argument stored in Qdrant
 */
export interface McpPromptArgumentPayload {
  /** Argument name */
  name: string;
  /** Argument description */
  description?: string;
  /** Whether this argument is required */
  required?: boolean;
}

/**
 * MCP Prompt with full details stored in Qdrant
 */
export interface McpPromptPayload {
  /** Prompt name (identifier) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Prompt arguments */
  arguments?: McpPromptArgumentPayload[];
}

/**
 * MCP Resource with full details stored in Qdrant
 */
export interface McpResourcePayload {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** MIME type of the resource content */
  mimeType?: string;
}

/**
 * Agent payload stored in Qdrant
 * Contains all filterable and sortable fields
 */
export interface AgentPayload {
  /** Agent ID in format chainId:tokenId */
  agent_id: string;
  /** Blockchain chain ID */
  chain_id: number;
  /** Agent display name */
  name: string;
  /** Agent description */
  description: string;
  /** Whether the agent is currently active */
  active: boolean;
  /** Whether the agent has MCP endpoint */
  has_mcp: boolean;
  /** Whether the agent has A2A endpoint */
  has_a2a: boolean;
  /** Whether the agent supports x402 payments */
  x402_support: boolean;
  /** Whether the agent has a registration file */
  has_registration_file: boolean;
  /** OASF skill slugs (for filtering) */
  skills: string[];
  /** OASF domain slugs (for filtering) */
  domains: string[];
  /** OASF skills with confidence scores (Phase 2) */
  skills_with_confidence?: Array<{ slug: string; confidence: number; reasoning?: string }>;
  /** OASF domains with confidence scores (Phase 2) */
  domains_with_confidence?: Array<{ slug: string; confidence: number; reasoning?: string }>;
  /** Overall classification confidence (Phase 2) */
  classification_confidence?: number;
  /** Classification timestamp ISO string (Phase 2) */
  classification_at?: string;
  /** Classification model version (Phase 2) */
  classification_model?: string;
  /** MCP tool names */
  mcp_tools: string[];
  /** A2A skill names */
  a2a_skills: string[];
  /** MCP prompt names */
  mcp_prompts: string[];
  /** MCP resource names */
  mcp_resources: string[];
  /** MCP tools with full details (descriptions, input schemas) */
  mcp_tools_detailed?: McpToolPayload[];
  /** MCP prompts with full details (descriptions, arguments) */
  mcp_prompts_detailed?: McpPromptPayload[];
  /** MCP resources with full details (descriptions, MIME types) */
  mcp_resources_detailed?: McpResourcePayload[];
  /** When MCP capabilities were last fetched (ISO timestamp) */
  mcp_capabilities_fetched_at?: string;
  /** Error message if MCP capability fetch failed */
  mcp_capabilities_error?: string;
  /** Reputation score (0-100) */
  reputation: number;
  /** Creation timestamp (ISO string) */
  created_at: string;
  /** Owner wallet address (single address, lowercase) */
  owner: string;
  /** Operator wallet addresses */
  operators: string[];
  /** ENS name (empty string if none) */
  ens: string;
  /** DID identifier (empty string if none) */
  did: string;
  /** Agent image URL (empty string if none) */
  image: string;
  /** Agent's own wallet address */
  wallet_address: string;
  /** Supported input modes */
  input_modes: string[];
  /** Supported output modes */
  output_modes: string[];
  /** Token ID on the chain */
  token_id: string;
  /** Whether A2A endpoint was recently verified as reachable */
  is_reachable_a2a: boolean;
  /** Whether MCP endpoint was recently verified as reachable */
  is_reachable_mcp: boolean;
  /** MCP protocol version (empty string if not set) */
  mcp_version: string;
  /** A2A protocol version (empty string if not set) */
  a2a_version: string;
  /** MCP endpoint URL for crawling capabilities (empty string if not set) */
  mcp_endpoint: string;
  /** A2A endpoint URL (empty string if not set) */
  a2a_endpoint: string;
  /** Chain ID of agent's wallet (0 if not set) */
  agent_wallet_chain_id: number;
  /** Supported trust models (empty array if not set) */
  supported_trusts: string[];
  /** Agent metadata URI (IPFS or HTTP, empty string if not set) */
  agent_uri: string;
  /** Last update timestamp (ISO string, empty string if not set) */
  updated_at: string;
  /** Trust score from PageRank algorithm (0-100, 0 if not computed) */
  trust_score: number;
  /** ERC-8004 spec version ('v0.4' for pre-v1.0, 'v1.0' for current) */
  erc_8004_version: string;
  /** Wallet addresses of curators who gave STAR feedback to this agent */
  curated_by: string[];
  /** Whether this agent is curated by at least one known curator */
  is_curated: boolean;
}

/**
 * Qdrant point structure
 */
export interface QdrantPoint {
  /** Point UUID */
  id: string;
  /** Embedding vector */
  vector: number[];
  /** Agent payload */
  payload: AgentPayload;
}

/**
 * Qdrant match condition types
 */
export interface MatchValue {
  value: string | number | boolean;
}

export interface MatchAny {
  any: (string | number)[];
}

export interface MatchExcept {
  except: (string | number)[];
}

export type MatchCondition = MatchValue | MatchAny | MatchExcept;

/**
 * Qdrant range condition
 */
export interface RangeCondition {
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
}

/**
 * Qdrant is_empty condition
 */
export interface IsEmptyCondition {
  is_empty: {
    key: string;
  };
}

/**
 * Qdrant is_null condition
 */
export interface IsNullCondition {
  is_null: {
    key: string;
  };
}

/**
 * Qdrant values_count condition for array length filtering
 */
export interface ValuesCountCondition {
  values_count: {
    lt?: number;
    lte?: number;
    gt?: number;
    gte?: number;
  };
}

/**
 * Qdrant datetime range condition
 */
export interface DatetimeRangeCondition {
  lt?: string;
  lte?: string;
  gt?: string;
  gte?: string;
}

/**
 * Qdrant field condition
 */
export interface FieldCondition {
  key: string;
  match?: MatchCondition;
  range?: RangeCondition | DatetimeRangeCondition;
  values_count?: ValuesCountCondition['values_count'];
}

/**
 * Qdrant filter with boolean logic
 */
export interface QdrantFilter {
  must?: (FieldCondition | QdrantFilter)[];
  should?: (FieldCondition | QdrantFilter)[];
  must_not?: (FieldCondition | QdrantFilter)[];
  min_should?: {
    conditions: (FieldCondition | QdrantFilter)[];
    min_count: number;
  };
}

/**
 * Qdrant order by direction
 */
export type OrderDirection = 'asc' | 'desc';

/**
 * Qdrant order by clause
 */
export interface OrderBy {
  key: string;
  direction?: OrderDirection;
}

/**
 * Qdrant search request
 */
export interface QdrantSearchRequest {
  /** Query vector */
  vector: number[];
  /** Filter conditions */
  filter?: QdrantFilter;
  /** Number of results to return */
  limit: number;
  /** Offset for pagination (use scroll for cursor-based) */
  offset?: number;
  /** Whether to return vector */
  with_vector?: boolean;
  /** Whether to return payload */
  with_payload?: boolean | string[];
  /** Score threshold (0-1) */
  score_threshold?: number;
}

/**
 * Qdrant scroll request (cursor-based pagination)
 */
export interface QdrantScrollRequest {
  /** Filter conditions */
  filter?: QdrantFilter;
  /** Number of results to return */
  limit: number;
  /** Cursor for pagination (point ID) */
  offset?: string;
  /** Whether to return vector */
  with_vector?: boolean;
  /** Whether to return payload */
  with_payload?: boolean | string[];
  /** Order by clause */
  order_by?: OrderBy;
}

/**
 * Qdrant search result point
 */
export interface QdrantSearchResult {
  /** Point UUID */
  id: string;
  /** Similarity score */
  score: number;
  /** Agent payload */
  payload: AgentPayload;
  /** Vector (if requested) */
  vector?: number[];
}

/**
 * Qdrant scroll result point
 */
export interface QdrantScrollResult {
  /** Point UUID */
  id: string;
  /** Agent payload */
  payload: AgentPayload;
  /** Vector (if requested) */
  vector?: number[];
}

/**
 * Qdrant search response
 */
export interface QdrantSearchResponse {
  result: QdrantSearchResult[];
  status: string;
  time: number;
}

/**
 * Qdrant scroll response
 */
export interface QdrantScrollResponse {
  result: {
    points: QdrantScrollResult[];
    next_page_offset?: string;
  };
  status: string;
  time: number;
}

/**
 * Qdrant upsert request
 */
export interface QdrantUpsertRequest {
  points: QdrantPoint[];
  wait?: boolean;
}

/**
 * Qdrant delete request
 */
export interface QdrantDeleteRequest {
  points?: string[];
  filter?: QdrantFilter;
  wait?: boolean;
}

/**
 * Qdrant count request
 */
export interface QdrantCountRequest {
  filter?: QdrantFilter;
  exact?: boolean;
}

/**
 * Qdrant count response
 */
export interface QdrantCountResponse {
  result: {
    count: number;
  };
  status: string;
  time: number;
}

/**
 * Qdrant collection info
 */
export interface QdrantCollectionInfo {
  result: {
    status: string;
    vectors_count: number;
    points_count: number;
    segments_count: number;
    config: {
      params: {
        vectors: {
          size: number;
          distance: string;
        };
      };
    };
  };
  status: string;
  time: number;
}

/**
 * API filter parameters (from query string or request body)
 */
export interface AgentFilterParams {
  // Search
  q?: string;

  // Existing filters
  chainIds?: number[];
  active?: boolean;
  mcp?: boolean;
  a2a?: boolean;
  x402?: boolean;
  hasRegistrationFile?: boolean;
  skills?: string[];
  domains?: string[];
  mcpTools?: string[];
  a2aSkills?: string[];
  minRep?: number;
  maxRep?: number;
  filterMode?: 'AND' | 'OR';

  // Date filters
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  hasImage?: boolean;
  hasENS?: boolean;
  hasDID?: boolean;
  operator?: string;
  minSkillsCount?: number;
  minDomainsCount?: number;
  hasPrompts?: boolean;
  hasResources?: boolean;
  inputMode?: string;
  outputMode?: string;

  // Reachability filters
  /** Filter by A2A reachability */
  reachableA2a?: boolean;
  /** Filter by MCP reachability */
  reachableMcp?: boolean;

  // Trust model filter
  /** Filter by agents with trust models */
  hasTrusts?: boolean;
  /** Filter by specific trust models */
  trustModels?: string[];

  // Wallet filters
  /** Filter by owner wallet address (exact match) */
  owner?: string;
  /** Filter by agent wallet address */
  walletAddress?: string;

  // Exact match filters
  /** Filter by exact ENS name */
  ens?: string;
  /** Filter by exact DID */
  did?: string;

  // Substring filters
  /** Filter by description substring (case-insensitive) */
  descriptionContains?: string;

  // Trust score filters (Gap 1)
  /** Minimum trust score (0-100) */
  trustScoreMin?: number;
  /** Maximum trust score (0-100) */
  trustScoreMax?: number;

  // Version filters (Gap 1)
  /** Filter by ERC-8004 spec version ('v0.4' or 'v1.0') */
  erc8004Version?: string;
  /** Filter by MCP protocol version */
  mcpVersion?: string;
  /** Filter by A2A protocol version */
  a2aVersion?: string;

  // Curation filters (Gap 3)
  /** Filter by curator wallet address */
  curatedBy?: string;
  /** Filter by curated status */
  isCurated?: boolean;

  // Exclusion filters (notIn)
  /** Exclude agents with these chain IDs */
  excludeChainIds?: number[];
  /** Exclude agents with these skills */
  excludeSkills?: string[];
  /** Exclude agents with these domains */
  excludeDomains?: string[];

  // Pagination
  limit?: number;
  cursor?: string;
  page?: number;

  // Sorting
  sort?: 'relevance' | 'name' | 'createdAt' | 'reputation';
  order?: 'asc' | 'desc';
}

/**
 * Cursor for pagination
 */
export interface PaginationCursor {
  /** Sort field used */
  sortField: string;
  /** Last value of the sort field */
  lastValue: string | number;
  /** Last agent ID for tie-breaking */
  lastId: string;
  /** Qdrant point offset (for scroll API) */
  pointOffset?: string;
}

/**
 * Qdrant service search options
 */
export interface QdrantSearchOptions {
  /** Search query for vector similarity */
  query?: string;
  /** Pre-computed query vector */
  queryVector?: number[];
  /** Filter parameters */
  filters: AgentFilterParams;
  /** Number of results */
  limit: number;
  /** Pagination cursor */
  cursor?: PaginationCursor;
  /** Sort field */
  sort?: 'relevance' | 'name' | 'createdAt' | 'reputation';
  /** Sort order */
  order?: 'asc' | 'desc';
  /** Minimum score threshold (0-1) */
  minScore?: number;
}

/**
 * Qdrant service search result
 */
export interface QdrantSearchResult {
  /** Agent payloads */
  agents: AgentPayload[];
  /** Total count matching filters */
  total: number;
  /** Whether more results exist */
  hasMore: boolean;
  /** Cursor for next page */
  nextCursor?: PaginationCursor;
  /** Search scores (only for vector search) */
  scores?: Map<string, number>;
}
