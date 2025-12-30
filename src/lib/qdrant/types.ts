/**
 * Qdrant vector database types
 * @module lib/qdrant/types
 */

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
  /** OASF skill slugs */
  skills: string[];
  /** OASF domain slugs */
  domains: string[];
  /** MCP tool names */
  mcp_tools: string[];
  /** A2A skill names */
  a2a_skills: string[];
  /** MCP prompt names */
  mcp_prompts: string[];
  /** MCP resource names */
  mcp_resources: string[];
  /** Reputation score (0-100) */
  reputation: number;
  /** Creation timestamp (ISO string) */
  created_at: string;
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

  // New filters
  createdAfter?: string;
  createdBefore?: string;
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
