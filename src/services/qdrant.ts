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
   * Make an HTTP request to Qdrant API
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
   */
  async upsertAgent(id: string, vector: number[], payload: AgentPayload): Promise<void> {
    await this.upsert([{ id, vector, payload }]);
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
      await this.upsert(batch.map((a) => ({ id: a.id, vector: a.vector, payload: a.payload })));
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
   * Count points matching a filter
   */
  async count(filters?: AgentFilterParams): Promise<number> {
    const filter = filters ? buildFilter(filters) : undefined;

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
