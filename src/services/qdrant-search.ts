/**
 * Qdrant-based search service
 * Replaces the external search-service with native Qdrant vector search
 * @module services/qdrant-search
 */

import { buildFilter } from '../lib/qdrant/filter-builder';
import type { AgentFilterParams, AgentPayload, OrderBy, QdrantFilter } from '../lib/qdrant/types';
import type {
  AgentSummary,
  Env,
  SearchFilters,
  SearchResultItem,
  SearchServiceResult,
} from '../types';
import type { OASFClassification } from '../types/classification';
import { createEmbeddingService, type EmbeddingService } from './embedding';
import { createHyDEService, type HyDEService } from './hyde';
import { createQdrantClient, decodeCursor, encodeCursor, type QdrantClient } from './qdrant';
import { createRerankerService, type RerankerService } from './reranker';

/**
 * Search parameters for Qdrant search
 */
export interface QdrantSearchParams {
  /** Natural language query */
  query?: string;
  /** Maximum results to return */
  limit?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Direct offset for pagination */
  offset?: number;
  /** Filters */
  filters?: AgentFilterParams;
  /** Sort field */
  sort?: 'relevance' | 'name' | 'createdAt' | 'reputation';
  /** Sort order */
  order?: 'asc' | 'desc';
  /** Enable HyDE for this query (default: use service config) */
  useHyDE?: boolean;
  /** Enable reranking for this query (default: use service config) */
  useReranker?: boolean;
}

/**
 * Extended search result with HyDE and reranker metadata
 */
export interface ExtendedSearchResult extends SearchServiceResult {
  /** HyDE metadata if used */
  hydeMetadata?: {
    /** Whether HyDE was used */
    used: boolean;
    /** Generated hypothetical description (if used) */
    hypotheticalDescription?: string;
    /** Generation time in ms */
    generationTimeMs?: number;
    /** Whether result was cached */
    cached?: boolean;
  };
  /** Reranker metadata if used */
  rerankerMetadata?: {
    /** Whether reranker was used */
    used: boolean;
    /** Number of items reranked */
    itemsReranked?: number;
    /** Reranking time in ms */
    rerankTimeMs?: number;
    /** Model used for reranking */
    modelUsed?: string;
  };
}

/**
 * Qdrant search service class
 */
export class QdrantSearchService {
  private readonly qdrant: QdrantClient;
  private readonly embedding: EmbeddingService;
  private readonly cache: KVNamespace;
  private readonly hyde: HyDEService | null;
  private readonly hydeEnabled: boolean;
  private readonly reranker: RerankerService | null;
  private readonly rerankerEnabled: boolean;

  constructor(config: {
    qdrant: QdrantClient;
    embedding: EmbeddingService;
    cache: KVNamespace;
    hyde?: HyDEService | null;
    hydeEnabled?: boolean;
    reranker?: RerankerService | null;
    rerankerEnabled?: boolean;
  }) {
    this.qdrant = config.qdrant;
    this.embedding = config.embedding;
    this.cache = config.cache;
    this.hyde = config.hyde ?? null;
    this.hydeEnabled = config.hydeEnabled ?? true;
    this.reranker = config.reranker ?? null;
    this.rerankerEnabled = config.rerankerEnabled ?? false;
  }

  /**
   * Perform semantic search
   */
  async search(params: QdrantSearchParams): Promise<ExtendedSearchResult> {
    const limit = params.limit ?? 20;
    const minScore = params.minScore ?? 0.3;

    // Determine offset from cursor or direct offset
    let offset = params.offset ?? 0;
    if (params.cursor && !params.offset) {
      const decoded = decodeCursor(params.cursor);
      if (decoded) {
        offset = Number.parseInt(decoded.lastValue as string, 10) || 0;
      }
    }

    // Build filter from params
    const filter = params.filters ? buildFilter(params.filters) : undefined;

    // Determine if HyDE and reranker should be used
    const useHyDE = params.useHyDE ?? this.hydeEnabled;
    const useReranker = params.useReranker ?? this.rerankerEnabled;

    // If we have a query, do vector search
    if (params.query && params.query.trim().length > 0) {
      return this.vectorSearch(params.query, {
        filter,
        limit,
        offset,
        minScore,
        sort: params.sort,
        order: params.order,
        useHyDE,
        useReranker,
      });
    }

    // No query - use scroll for filtered listing
    const result = await this.filteredListing({
      filter,
      limit,
      offset,
      sort: params.sort,
      order: params.order,
    });

    return {
      ...result,
      hydeMetadata: { used: false },
    };
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(
    query: string,
    options: {
      filter?: QdrantFilter;
      limit: number;
      offset: number;
      minScore: number;
      sort?: 'relevance' | 'name' | 'createdAt' | 'reputation';
      order?: 'asc' | 'desc';
      useHyDE?: boolean;
      useReranker?: boolean;
    }
  ): Promise<ExtendedSearchResult> {
    // Track HyDE and reranker metadata
    let hydeMetadata: ExtendedSearchResult['hydeMetadata'] = { used: false };
    let rerankerMetadata: ExtendedSearchResult['rerankerMetadata'] = { used: false };
    let textToEmbed = query;

    // Use HyDE if enabled and appropriate for this query
    if (options.useHyDE && this.hyde && this.hyde.shouldUseHyDE(query)) {
      try {
        const hydeResult = await this.hyde.generateHypotheticalAgent(query);
        textToEmbed = hydeResult.hypotheticalDescription;
        hydeMetadata = {
          used: true,
          hypotheticalDescription: hydeResult.hypotheticalDescription,
          generationTimeMs: hydeResult.generationTimeMs,
          cached: hydeResult.cached,
        };
      } catch (error) {
        // Log error but continue with original query
        console.error('HyDE generation failed, using original query:', error);
        hydeMetadata = { used: false };
      }
    }

    // Generate embedding for query (or HyDE-enhanced query)
    const queryVector = await this.embedding.embedSingle(textToEmbed);

    // If sorting by non-relevance, we need to fetch more and re-sort
    const isRelevanceSort = !options.sort || options.sort === 'relevance';

    if (isRelevanceSort) {
      // For reranking, fetch more results initially (reranker topK)
      const fetchLimit =
        options.useReranker && this.reranker
          ? Math.max(options.limit, this.reranker.getTopK())
          : options.limit;

      // Direct vector search with Qdrant's native sorting
      const result = await this.qdrant.search({
        vector: queryVector,
        qdrantFilter: options.filter,
        limit: fetchLimit,
        offset: options.offset,
        scoreThreshold: options.minScore,
      });

      let results = result.items.map((item) =>
        this.payloadToSearchResult(item.payload, item.score)
      );

      // Apply reranking if enabled
      if (options.useReranker && this.reranker && results.length > 0) {
        try {
          const rerankResult = await this.reranker.rerank(query, results);
          results = rerankResult.items.slice(0, options.limit);
          rerankerMetadata = {
            used: true,
            itemsReranked: rerankResult.itemsReranked,
            rerankTimeMs: rerankResult.rerankTimeMs,
            modelUsed: rerankResult.modelUsed,
          };
        } catch (error) {
          console.error('Reranking failed:', error);
          results = results.slice(0, options.limit);
          rerankerMetadata = { used: false };
        }
      } else {
        // No reranking, just limit results
        results = results.slice(0, options.limit);
      }

      // Reverse results for ascending order (Qdrant returns descending score by default)
      if (options.order === 'asc') {
        results = results.reverse();
      }

      const byChain = this.calculateByChain(results);
      // Use filtered count for total
      const total = await this.qdrant.countWithFilter(options.filter);

      return {
        results,
        total,
        hasMore: result.hasMore,
        nextCursor: result.hasMore
          ? this.encodeSearchCursor(options.offset + options.limit)
          : undefined,
        byChain,
        hydeMetadata,
        rerankerMetadata,
      };
    }

    // Non-relevance sort: fetch all matching, sort, then paginate
    // This is more expensive but necessary for non-score sorting
    const allResults = await this.fetchAllVectorMatches(
      queryVector,
      options.filter,
      options.minScore
    );

    // Sort results (only for non-relevance sorts)
    const sortField = options.sort as 'name' | 'createdAt' | 'reputation';
    const sorted = this.sortResults(allResults, sortField, options.order ?? 'desc');

    // Paginate
    const paginated = sorted.slice(options.offset, options.offset + options.limit);
    const hasMore = options.offset + options.limit < sorted.length;

    const results = paginated.map((item) => this.payloadToSearchResult(item.payload, item.score));
    const byChain = this.calculateByChain(results);

    return {
      results,
      total: sorted.length,
      hasMore,
      nextCursor: hasMore ? this.encodeSearchCursor(options.offset + options.limit) : undefined,
      byChain,
      hydeMetadata,
      rerankerMetadata,
    };
  }

  /**
   * Filtered listing without vector search
   * Note: Qdrant order_by only works with numeric/datetime fields.
   * For name sorting, we fetch all and sort in-memory.
   */
  private async filteredListing(options: {
    filter?: QdrantFilter;
    limit: number;
    offset: number;
    sort?: 'relevance' | 'name' | 'createdAt' | 'reputation';
    order?: 'asc' | 'desc';
  }): Promise<SearchServiceResult> {
    // For name sorting, Qdrant doesn't support order_by on keyword fields
    // We need to fetch all matching results and sort in-memory
    if (options.sort === 'name') {
      return this.filteredListingWithInMemorySort(options);
    }

    // For numeric/datetime fields, use Qdrant's native order_by
    const orderBy = this.buildOrderBy(options.sort, options.order);

    // Qdrant scroll API uses point IDs for cursor, not numeric offsets.
    // For offset-based pagination, we need to fetch extra and skip.
    const fetchLimit = options.offset + options.limit + 1; // +1 to detect hasMore

    const result = await this.qdrant.scroll({
      qdrantFilter: options.filter,
      limit: fetchLimit,
      orderBy,
    });

    // Skip offset items and take limit items
    const allItems = result.items;
    const paginatedItems = allItems.slice(options.offset, options.offset + options.limit);
    const hasMore = allItems.length > options.offset + options.limit;

    const results = paginatedItems.map((item) =>
      this.payloadToSearchResult(item.payload, undefined)
    );
    const byChain = this.calculateByChain(results);
    // Use filtered count, not global count
    const total = await this.qdrant.countWithFilter(options.filter);

    return {
      results,
      total,
      hasMore,
      nextCursor: hasMore ? this.encodeSearchCursor(options.offset + options.limit) : undefined,
      byChain,
    };
  }

  /**
   * Filtered listing with in-memory sorting (for fields Qdrant can't sort)
   */
  private async filteredListingWithInMemorySort(options: {
    filter?: QdrantFilter;
    limit: number;
    offset: number;
    sort?: 'relevance' | 'name' | 'createdAt' | 'reputation';
    order?: 'asc' | 'desc';
  }): Promise<SearchServiceResult> {
    // Fetch all matching results (up to a reasonable limit)
    const allResults: Array<{ payload: AgentPayload }> = [];
    let cursor: string | undefined;
    const batchSize = 100;
    const maxResults = 1000;

    while (allResults.length < maxResults) {
      const batch = await this.qdrant.scroll({
        qdrantFilter: options.filter,
        limit: batchSize,
        cursor,
      });

      for (const item of batch.items) {
        allResults.push({ payload: item.payload });
      }

      if (!batch.hasMore || !batch.nextCursor) break;
      cursor = batch.nextCursor;
    }

    // Sort in-memory
    const sortField = options.sort as 'name' | 'createdAt' | 'reputation';
    const sorted = this.sortPayloads(allResults, sortField, options.order ?? 'desc');

    // Paginate
    const paginated = sorted.slice(options.offset, options.offset + options.limit);
    const hasMore = options.offset + options.limit < sorted.length;

    const results = paginated.map((item) => this.payloadToSearchResult(item.payload, undefined));
    const byChain = this.calculateByChain(results);

    return {
      results,
      total: sorted.length,
      hasMore,
      nextCursor: hasMore ? this.encodeSearchCursor(options.offset + options.limit) : undefined,
      byChain,
    };
  }

  /**
   * Sort payloads by field (for in-memory sorting)
   */
  private sortPayloads(
    results: Array<{ payload: AgentPayload }>,
    sort: 'name' | 'createdAt' | 'reputation',
    order: 'asc' | 'desc'
  ): Array<{ payload: AgentPayload }> {
    const multiplier = order === 'desc' ? -1 : 1;

    return [...results].sort((a, b) => {
      let comparison = 0;

      switch (sort) {
        case 'name':
          comparison = a.payload.name.localeCompare(b.payload.name);
          break;
        case 'createdAt':
          comparison =
            new Date(a.payload.created_at).getTime() - new Date(b.payload.created_at).getTime();
          break;
        case 'reputation':
          comparison = a.payload.reputation - b.payload.reputation;
          break;
      }

      // Use agent_id as tie-breaker for stable pagination
      if (comparison === 0) {
        comparison = a.payload.agent_id.localeCompare(b.payload.agent_id);
      }

      return comparison * multiplier;
    });
  }

  /**
   * Fetch all vector matches (for non-relevance sorting)
   */
  private async fetchAllVectorMatches(
    queryVector: number[],
    filter: QdrantFilter | undefined,
    minScore: number
  ): Promise<Array<{ payload: AgentPayload; score: number }>> {
    const results: Array<{ payload: AgentPayload; score: number }> = [];
    let offset = 0;
    const batchSize = 100;
    let hasMore = true;

    // Limit to reasonable max to avoid memory issues
    const maxResults = 1000;

    while (hasMore && results.length < maxResults) {
      const batch = await this.qdrant.search({
        vector: queryVector,
        qdrantFilter: filter,
        limit: batchSize,
        offset,
        scoreThreshold: minScore,
      });

      for (const item of batch.items) {
        results.push({ payload: item.payload, score: item.score ?? 0 });
      }

      hasMore = batch.hasMore;
      offset += batchSize;
    }

    return results;
  }

  /**
   * Sort results by field
   */
  private sortResults(
    results: Array<{ payload: AgentPayload; score: number }>,
    sort: 'name' | 'createdAt' | 'reputation',
    order: 'asc' | 'desc'
  ): Array<{ payload: AgentPayload; score: number }> {
    const multiplier = order === 'desc' ? -1 : 1;

    return [...results].sort((a, b) => {
      let comparison = 0;

      switch (sort) {
        case 'name':
          comparison = a.payload.name.localeCompare(b.payload.name);
          break;
        case 'createdAt':
          comparison =
            new Date(a.payload.created_at).getTime() - new Date(b.payload.created_at).getTime();
          break;
        case 'reputation':
          comparison = a.payload.reputation - b.payload.reputation;
          break;
      }

      // Use agent_id as tie-breaker for stable pagination
      if (comparison === 0) {
        comparison = a.payload.agent_id.localeCompare(b.payload.agent_id);
      }

      return comparison * multiplier;
    });
  }

  /**
   * Convert Qdrant payload to search result item
   */
  private payloadToSearchResult(payload: AgentPayload, score?: number): SearchResultItem {
    return {
      agentId: payload.agent_id,
      chainId: payload.chain_id,
      name: payload.name,
      description: payload.description,
      score: score ?? 0,
      metadata: {
        active: payload.active,
        hasMcp: payload.has_mcp,
        hasA2a: payload.has_a2a,
        x402Support: payload.x402_support,
        skills: payload.skills,
        domains: payload.domains,
        reputation: payload.reputation,
        image: payload.image,
        ens: payload.ens,
        did: payload.did,
        inputModes: payload.input_modes,
        outputModes: payload.output_modes,
      },
      matchReasons: this.generateMatchReasons(payload, score),
    };
  }

  /**
   * Generate match reasons based on payload and score
   */
  private generateMatchReasons(payload: AgentPayload, score?: number): string[] {
    const reasons: string[] = [];

    if (score && score > 0.8) {
      reasons.push('high_relevance');
    } else if (score && score > 0.5) {
      reasons.push('moderate_relevance');
    }

    if (payload.has_mcp) reasons.push('has_mcp');
    if (payload.has_a2a) reasons.push('has_a2a');
    if (payload.x402_support) reasons.push('has_x402');
    if (payload.skills.length > 0) reasons.push('has_skills');
    if (payload.domains.length > 0) reasons.push('has_domains');

    return reasons.length > 0 ? reasons : ['filter_match'];
  }

  /**
   * Calculate result count by chain
   */
  private calculateByChain(results: SearchResultItem[]): Record<number, number> {
    const byChain: Record<number, number> = {};
    for (const result of results) {
      byChain[result.chainId] = (byChain[result.chainId] ?? 0) + 1;
    }
    return byChain;
  }

  /**
   * Build order_by clause
   */
  private buildOrderBy(
    sort?: 'relevance' | 'name' | 'createdAt' | 'reputation',
    order?: 'asc' | 'desc'
  ): OrderBy | undefined {
    if (!sort || sort === 'relevance') {
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

  /**
   * Encode search cursor
   */
  private encodeSearchCursor(offset: number): string {
    return encodeCursor({
      sortField: 'offset',
      lastValue: offset,
      lastId: '',
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const info = await this.qdrant.getCollectionInfo();
      return info.status === 'ok' || info.result.status === 'green';
    } catch {
      return false;
    }
  }

  /**
   * Get total count with optional filters
   */
  async count(filters?: AgentFilterParams): Promise<number> {
    return this.qdrant.count(filters);
  }
}

/**
 * Convert SearchFilters to AgentFilterParams
 */
export function searchFiltersToAgentFilters(filters: SearchFilters): AgentFilterParams {
  return {
    chainIds: filters.chainIds,
    active: filters.active,
    mcp: filters.mcp,
    a2a: filters.a2a,
    x402: filters.x402,
    skills: filters.skills,
    domains: filters.domains,
    filterMode: filters.filterMode,
    // Extended filters
    mcpTools: filters.mcpTools,
    a2aSkills: filters.a2aSkills,
    minRep: filters.minRep,
    maxRep: filters.maxRep,
    // Wallet filters
    owner: filters.owner,
    walletAddress: filters.walletAddress,
    // Trust model filters
    trustModels: filters.trustModels,
    hasTrusts: filters.hasTrusts,
    // Reachability filters
    reachableA2a: filters.reachableA2a,
    reachableMcp: filters.reachableMcp,
    // Registration file filter
    hasRegistrationFile: filters.hasRegistrationFile,
  };
}

/**
 * Convert AgentPayload to AgentSummary
 */
export function payloadToAgentSummary(payload: AgentPayload, score?: number): AgentSummary {
  // Build OASF classification if skills/domains exist
  let oasf: OASFClassification | undefined;
  if (payload.skills.length > 0 || payload.domains.length > 0) {
    oasf = {
      skills: payload.skills.map((slug) => ({ slug, confidence: 1 })),
      domains: payload.domains.map((slug) => ({ slug, confidence: 1 })),
      confidence: 1,
      classifiedAt: payload.created_at,
      modelVersion: 'qdrant-indexed',
    };
  }

  return {
    id: payload.agent_id,
    chainId: payload.chain_id,
    tokenId: payload.token_id,
    name: payload.name,
    description: payload.description,
    image: payload.image || undefined,
    active: payload.active,
    hasMcp: payload.has_mcp,
    hasA2a: payload.has_a2a,
    x402Support: payload.x402_support,
    supportedTrust: payload.x402_support ? ['x402'] : [],
    oasf,
    oasfSource: oasf ? 'llm-classification' : 'none',
    searchScore: score,
    reputationScore: payload.reputation > 0 ? payload.reputation : undefined,
    operators: payload.operators.length > 0 ? payload.operators : undefined,
    ens: payload.ens || undefined,
    did: payload.did || undefined,
    walletAddress: payload.wallet_address || undefined,
    inputModes: payload.input_modes.length > 0 ? payload.input_modes : undefined,
    outputModes: payload.output_modes.length > 0 ? payload.output_modes : undefined,
  };
}

/**
 * Create Qdrant search service from environment
 * When MOCK_EXTERNAL_SERVICES=true, returns a mock implementation for E2E testing
 */
export function createQdrantSearchService(env: Env): QdrantSearchService {
  // Return mock for E2E testing
  // The mock is injected via the createMockQdrantSearchServiceInstance function
  // which is set by tests when MOCK_EXTERNAL_SERVICES=true
  if (env.MOCK_EXTERNAL_SERVICES === 'true' && _mockQdrantSearchServiceFactory !== null) {
    return _mockQdrantSearchServiceFactory() as unknown as QdrantSearchService;
  }

  const qdrant = createQdrantClient(
    env as unknown as {
      QDRANT_URL: string;
      QDRANT_API_KEY: string;
      QDRANT_COLLECTION?: string;
    }
  );

  const embedding = createEmbeddingService({
    VENICE_API_KEY: env.VENICE_API_KEY,
    EMBEDDING_MODEL: env.EMBEDDING_MODEL,
  });

  // Create HyDE service if enabled
  const hyde = createHyDEService(env);
  const hydeEnabled = env.HYDE_ENABLED !== 'false';

  // Create reranker service if enabled
  const reranker = createRerankerService(env);
  const rerankerEnabled = env.RERANKER_ENABLED === 'true';

  return new QdrantSearchService({
    qdrant,
    embedding,
    cache: env.CACHE,
    hyde,
    hydeEnabled,
    reranker,
    rerankerEnabled,
  });
}

/**
 * Factory function for creating mock Qdrant search service
 * Set by tests to inject the mock implementation
 */
let _mockQdrantSearchServiceFactory: (() => QdrantSearchService) | null = null;

/**
 * Set the mock factory for testing
 * @internal Only for testing
 */
export function setMockQdrantSearchServiceFactory(
  factory: (() => QdrantSearchService) | null
): void {
  _mockQdrantSearchServiceFactory = factory;
}
