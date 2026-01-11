/**
 * Qdrant vector database client
 * Handles all interactions with Qdrant Cloud for agent search
 * @module services/qdrant
 */

import { buildFilter } from '../lib/qdrant/filter-builder';
import type {
  AgentFilterParams,
  AgentPayload,
  OrderBy,
  PaginationCursor,
  QdrantCollectionInfo,
  QdrantCountRequest,
  QdrantCountResponse,
  QdrantDeleteRequest,
  QdrantFilter,
  QdrantPoint,
  QdrantScrollRequest,
  QdrantScrollResponse,
  QdrantSearchRequest,
  QdrantSearchResponse,
  QdrantUpsertRequest,
} from '../lib/qdrant/types';
import { circuitBreakers } from '../lib/utils/circuit-breaker';

/**
 * Convert agent ID to a deterministic UUID v5-like format
 * Uses SHA-256 hash truncated to UUID format
 * @param agentId - Agent ID in format "chainId:tokenId"
 * @returns UUID string
 */
async function agentIdToUuid(agentId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(agentId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  // Format as UUID (8-4-4-4-12 hex characters)
  const hex = Array.from(hashArray.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Qdrant client configuration
 */
export interface QdrantConfig {
  /** Qdrant Cloud URL */
  url: string;
  /** Qdrant API key */
  apiKey: string;
  /** Collection name */
  collection: string;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Search options for Qdrant queries
 */
export interface SearchOptions {
  /** Query vector for similarity search */
  vector?: number[];
  /** Filter parameters */
  filters?: AgentFilterParams;
  /** Pre-built Qdrant filter */
  qdrantFilter?: QdrantFilter;
  /** Number of results to return */
  limit: number;
  /** Score threshold (0-1) for vector search */
  scoreThreshold?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Scroll options for cursor-based pagination
 */
export interface ScrollOptions {
  /** Filter parameters */
  filters?: AgentFilterParams;
  /** Pre-built Qdrant filter */
  qdrantFilter?: QdrantFilter;
  /** Number of results to return */
  limit: number;
  /** Cursor for pagination (point ID) */
  cursor?: string;
  /** Order by field */
  orderBy?: OrderBy;
}

/**
 * Search result from Qdrant
 */
export interface QdrantSearchResultItem {
  /** Point ID */
  id: string;
  /** Similarity score (only for vector search) */
  score?: number;
  /** Agent payload */
  payload: AgentPayload;
}

/**
 * Search response
 */
export interface SearchResult {
  /** Result items */
  items: QdrantSearchResultItem[];
  /** Whether more results exist */
  hasMore: boolean;
  /** Next cursor for pagination */
  nextCursor?: string;
  /** Total count (if available) */
  total?: number;
}

/**
 * Qdrant client for agent search
 */
export class QdrantClient {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly collection: string;
  private readonly timeout: number;

  constructor(config: QdrantConfig) {
    this.url = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.collection = config.collection;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Make an HTTP request to Qdrant API with circuit breaker protection
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return circuitBreakers.qdrant.execute(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(`${this.url}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Qdrant API error ${response.status}: ${errorText}`);
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * Check if Qdrant circuit is currently open
   */
  isCircuitOpen(): boolean {
    return !circuitBreakers.qdrant.isAllowed();
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(): Promise<QdrantCollectionInfo> {
    return this.request<QdrantCollectionInfo>('GET', `/collections/${this.collection}`);
  }

  /**
   * Check if collection exists
   */
  async collectionExists(): Promise<boolean> {
    try {
      await this.getCollectionInfo();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Upsert points (insert or update)
   * Note: Point IDs must be UUIDs (use agentIdToUuid for agent IDs)
   */
  async upsert(points: QdrantPoint[], wait = true): Promise<void> {
    const request: QdrantUpsertRequest = {
      points,
      wait,
    };

    await this.request<{ status: string }>(
      'PUT',
      `/collections/${this.collection}/points`,
      request
    );
  }

  /**
   * Upsert a single agent
   * @param agentId - Agent ID in format "chainId:tokenId"
   * @param vector - Embedding vector
   * @param payload - Agent payload (must include agent_id field)
   */
  async upsertAgent(agentId: string, vector: number[], payload: AgentPayload): Promise<void> {
    const uuid = await agentIdToUuid(agentId);
    await this.upsert([{ id: uuid, vector, payload }]);
  }

  /**
   * Batch upsert agents
   */
  async upsertAgents(
    agents: Array<{ id: string; vector: number[]; payload: AgentPayload }>
  ): Promise<void> {
    // Qdrant recommends batches of ~100 points
    const batchSize = 100;

    for (let i = 0; i < agents.length; i += batchSize) {
      const batch = agents.slice(i, i + batchSize);
      const pointsWithUuids = await Promise.all(
        batch.map(async (a) => ({
          id: await agentIdToUuid(a.id),
          vector: a.vector,
          payload: a.payload,
        }))
      );
      await this.upsert(pointsWithUuids);
    }
  }

  /**
   * Delete points by IDs
   */
  async delete(pointIds: string[], wait = true): Promise<void> {
    const request: QdrantDeleteRequest = {
      points: pointIds,
      wait,
    };

    await this.request<{ status: string }>(
      'POST',
      `/collections/${this.collection}/points/delete`,
      request
    );
  }

  /**
   * Delete points by filter
   */
  async deleteByFilter(filter: QdrantFilter, wait = true): Promise<void> {
    const request: QdrantDeleteRequest = {
      filter,
      wait,
    };

    await this.request<{ status: string }>(
      'POST',
      `/collections/${this.collection}/points/delete`,
      request
    );
  }

  /**
   * Set payload on points matching a filter (partial update, no re-embedding)
   */
  async setPayload(
    payload: Partial<AgentPayload>,
    filter: QdrantFilter,
    wait = true
  ): Promise<void> {
    await this.request<{ status: string }>(
      'POST',
      `/collections/${this.collection}/points/payload`,
      { payload, filter, wait }
    );
  }

  /**
   * Set payload on a single point by agent_id (partial update, no re-embedding)
   */
  async setPayloadByAgentId(
    agentId: string,
    payload: Partial<AgentPayload>,
    wait = true
  ): Promise<void> {
    const filter: QdrantFilter = {
      must: [{ key: 'agent_id', match: { value: agentId } }],
    };
    await this.setPayload(payload, filter, wait);
  }

  /**
   * Batch set payload on multiple agents (partial update, no re-embedding)
   * More efficient than individual updates
   */
  async batchSetPayload(
    updates: Array<{ agentId: string; payload: Partial<AgentPayload> }>,
    wait = true
  ): Promise<void> {
    // Group by payload to minimize API calls
    for (const update of updates) {
      const filter: QdrantFilter = {
        must: [{ key: 'agent_id', match: { value: update.agentId } }],
      };
      await this.setPayload(update.payload, filter, wait);
    }
  }

  /**
   * Get all agent IDs in the collection (for reconciliation)
   */
  async getAllAgentIds(): Promise<string[]> {
    const agentIds: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.scroll({
        limit: 1000,
        cursor,
      });

      for (const item of result.items) {
        agentIds.push(item.payload.agent_id);
      }

      cursor = result.nextCursor;
    } while (cursor);

    return agentIds;
  }

  /**
   * Delete points by agent IDs
   */
  async deleteByAgentIds(agentIds: string[], wait = true): Promise<void> {
    if (agentIds.length === 0) return;

    const filter: QdrantFilter = {
      must: [{ key: 'agent_id', match: { any: agentIds } }],
    };
    await this.deleteByFilter(filter, wait);
  }

  /**
   * Get points by IDs
   */
  async getByIds(ids: string[]): Promise<QdrantSearchResultItem[]> {
    const response = await this.request<{
      result: Array<{ id: string; payload: AgentPayload }>;
    }>('POST', `/collections/${this.collection}/points`, { ids, with_payload: true });

    return response.result.map((p) => ({
      id: p.id,
      payload: p.payload,
    }));
  }

  /**
   * Get a single point by ID
   */
  async getById(id: string): Promise<QdrantSearchResultItem | null> {
    const results = await this.getByIds([id]);
    return results[0] ?? null;
  }

  /**
   * Get a single agent by agent_id (chainId:tokenId format)
   * Uses scroll with filter since we don't have the point UUID
   */
  async getByAgentId(agentId: string): Promise<QdrantSearchResultItem | null> {
    const filter: QdrantFilter = {
      must: [{ key: 'agent_id', match: { value: agentId } }],
    };

    const result = await this.scroll({
      limit: 1,
      qdrantFilter: filter,
    });

    return result.items[0] ?? null;
  }

  /**
   * Create a payload index for a field
   * Required for filtering on fields that aren't indexed by default
   */
  async createPayloadIndex(
    fieldName: string,
    fieldType: 'keyword' | 'integer' | 'float' | 'bool' | 'geo' | 'datetime' | 'text',
    wait = true
  ): Promise<void> {
    await this.request<{ status: string }>('PUT', `/collections/${this.collection}/index`, {
      field_name: fieldName,
      field_schema: fieldType,
      wait,
    });
  }

  /**
   * Ensure all required payload indexes exist
   * Call this after creating a collection or when adding new filterable fields
   */
  async ensurePayloadIndexes(): Promise<void> {
    const requiredIndexes: Array<{
      field: string;
      type: 'keyword' | 'integer' | 'float' | 'bool' | 'geo' | 'datetime' | 'text';
    }> = [
      { field: 'has_registration_file', type: 'bool' },
      { field: 'active', type: 'bool' },
      { field: 'has_mcp', type: 'bool' },
      { field: 'has_a2a', type: 'bool' },
      { field: 'x402_support', type: 'bool' },
      { field: 'is_reachable_a2a', type: 'bool' },
      { field: 'is_reachable_mcp', type: 'bool' },
      { field: 'chain_id', type: 'integer' },
      { field: 'reputation', type: 'float' },
      { field: 'created_at', type: 'datetime' },
      { field: 'agent_id', type: 'keyword' },
      { field: 'name', type: 'keyword' },
      { field: 'ens', type: 'keyword' },
      { field: 'did', type: 'keyword' },
      { field: 'wallet_address', type: 'keyword' },
      { field: 'owner', type: 'keyword' },
      { field: 'skills', type: 'keyword' },
      { field: 'domains', type: 'keyword' },
      { field: 'mcp_tools', type: 'keyword' },
      { field: 'a2a_skills', type: 'keyword' },
      { field: 'mcp_prompts', type: 'keyword' },
      { field: 'mcp_resources', type: 'keyword' },
      { field: 'operators', type: 'keyword' },
      { field: 'input_modes', type: 'keyword' },
      { field: 'output_modes', type: 'keyword' },
      { field: 'supported_trusts', type: 'keyword' },
      { field: 'agent_uri', type: 'keyword' },
      { field: 'updated_at', type: 'datetime' },
      { field: 'trust_score', type: 'float' },
    ];

    for (const index of requiredIndexes) {
      try {
        await this.createPayloadIndex(index.field, index.type, false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const lowerMessage = errorMessage.toLowerCase();

        // Expected case: index already exists
        if (lowerMessage.includes('already exists')) {
          continue;
        }

        // Critical errors that should fail the whole operation
        const isCriticalError =
          lowerMessage.includes('401') ||
          lowerMessage.includes('403') ||
          lowerMessage.includes('unauthorized') ||
          lowerMessage.includes('forbidden') ||
          lowerMessage.includes('not found') ||
          lowerMessage.includes('collection') ||
          lowerMessage.includes('econnrefused');

        if (isCriticalError) {
          console.error(`[qdrant] Critical error creating index for ${index.field}:`, errorMessage);
          throw error;
        }

        // Non-critical errors: log and continue
        console.warn(`[qdrant] Failed to create index for ${index.field}:`, errorMessage);
      }
    }
  }

  /**
   * Count points matching a filter
   */
  async count(filters?: AgentFilterParams): Promise<number> {
    const filter = filters ? buildFilter(filters) : undefined;
    return this.countWithFilter(filter);
  }

  /**
   * Count points matching a pre-built Qdrant filter
   */
  async countWithFilter(filter?: QdrantFilter): Promise<number> {
    const request: QdrantCountRequest = {
      filter,
      exact: true,
    };

    const response = await this.request<QdrantCountResponse>(
      'POST',
      `/collections/${this.collection}/points/count`,
      request
    );

    return response.result.count;
  }

  /**
   * Vector similarity search
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    if (!options.vector) {
      throw new Error('Vector is required for search');
    }

    const filter =
      options.qdrantFilter ?? (options.filters ? buildFilter(options.filters) : undefined);

    const request: QdrantSearchRequest = {
      vector: options.vector,
      filter,
      limit: options.limit + 1, // Fetch one extra to detect hasMore
      offset: options.offset,
      with_payload: true,
      score_threshold: options.scoreThreshold,
    };

    const response = await this.request<QdrantSearchResponse>(
      'POST',
      `/collections/${this.collection}/points/search`,
      request
    );

    const hasMore = response.result.length > options.limit;
    const items = response.result.slice(0, options.limit).map((p) => ({
      id: p.id,
      score: p.score,
      payload: p.payload,
    }));

    return {
      items,
      hasMore,
      nextCursor: hasMore ? String((options.offset ?? 0) + options.limit) : undefined,
    };
  }

  /**
   * Scroll through points with cursor-based pagination
   * Use this for non-vector queries or when you need stable pagination
   */
  async scroll(options: ScrollOptions): Promise<SearchResult> {
    const filter =
      options.qdrantFilter ?? (options.filters ? buildFilter(options.filters) : undefined);

    const request: QdrantScrollRequest = {
      filter,
      limit: options.limit + 1, // Fetch one extra to detect hasMore
      offset: options.cursor,
      with_payload: true,
      order_by: options.orderBy,
    };

    const response = await this.request<QdrantScrollResponse>(
      'POST',
      `/collections/${this.collection}/points/scroll`,
      request
    );

    const points = response.result.points;
    const hasMore = points.length > options.limit;
    const items = points.slice(0, options.limit).map((p) => ({
      id: p.id,
      payload: p.payload,
    }));

    return {
      items,
      hasMore,
      nextCursor: hasMore ? response.result.next_page_offset : undefined,
    };
  }

  /**
   * Search with automatic method selection
   * Uses vector search if vector provided, scroll otherwise
   */
  async query(options: {
    vector?: number[];
    filters?: AgentFilterParams;
    limit: number;
    cursor?: string;
    offset?: number;
    sort?: 'relevance' | 'name' | 'createdAt' | 'reputation';
    order?: 'asc' | 'desc';
    scoreThreshold?: number;
  }): Promise<SearchResult> {
    // If we have a vector and want relevance sorting, use vector search
    if (options.vector && (!options.sort || options.sort === 'relevance')) {
      return this.search({
        vector: options.vector,
        filters: options.filters,
        limit: options.limit,
        scoreThreshold: options.scoreThreshold,
        offset:
          options.offset ?? (options.cursor ? Number.parseInt(options.cursor, 10) : undefined),
      });
    }

    // Otherwise use scroll with ordering
    const orderBy = this.buildOrderBy(options.sort, options.order);

    const result = await this.scroll({
      filters: options.filters,
      limit: options.limit,
      cursor: options.cursor,
      orderBy,
    });

    // If we have a vector but not sorting by relevance, we need to
    // compute scores manually and attach them
    if (options.vector) {
      for (const item of result.items) {
        // Score computation would require the vector, which we don't store
        // For non-relevance sorted results, we don't include score
        item.score = undefined;
      }
    }

    return result;
  }

  /**
   * Build order_by clause from sort parameters
   */
  private buildOrderBy(
    sort?: 'relevance' | 'name' | 'createdAt' | 'reputation',
    order?: 'asc' | 'desc'
  ): OrderBy | undefined {
    if (!sort || sort === 'relevance') {
      // Vector search handles relevance sorting
      return undefined;
    }

    const keyMap: Record<string, string> = {
      name: 'name',
      createdAt: 'created_at',
      reputation: 'reputation',
    };

    return {
      key: keyMap[sort] ?? sort,
      direction: order ?? 'desc',
    };
  }
}

/**
 * Encode pagination cursor
 */
export function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Decode pagination cursor
 */
export function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
    return JSON.parse(decoded) as PaginationCursor;
  } catch {
    return null;
  }
}

/**
 * Create Qdrant client from environment
 */
export function createQdrantClient(env: {
  QDRANT_URL: string;
  QDRANT_API_KEY: string;
  QDRANT_COLLECTION?: string;
}): QdrantClient {
  return new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
    collection: env.QDRANT_COLLECTION ?? 'agents',
  });
}
