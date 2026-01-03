/**
 * Streaming Search endpoint (SSE)
 * @module routes/search-stream
 *
 * Provides real-time streaming search results via Server-Sent Events (SSE).
 * Results are streamed progressively as they're processed:
 * 1. Initial vector search results
 * 2. Enriched agent data
 * 3. Reranked results (if enabled)
 * 4. Final completion event
 */

import { getClassificationsBatch } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { applyFilters } from '@/lib/utils/filters';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  type SearchRequestBody,
  parseAgentId,
  parseClassificationRow,
  searchRequestSchema,
} from '@/lib/utils/validation';
import { CACHE_TTL, createCacheService } from '@/services/cache';
import { createSDKService } from '@/services/sdk';
import { createSearchService } from '@/services/search';
import type { AgentDetail, AgentSummary, Env, OASFSource, TrustMethod, Variables } from '@/types';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

const searchStream = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
searchStream.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * SSE event types for streaming search
 */
type StreamSearchEventType =
  | 'search_started'
  | 'vector_results'
  | 'enrichment_progress'
  | 'agent_enriched'
  | 'rerank_started'
  | 'rerank_progress'
  | 'search_complete'
  | 'error';

/**
 * Stream search event data
 */
interface StreamSearchEvent {
  type: StreamSearchEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Create a stream event
 */
function createEvent(
  type: StreamSearchEventType,
  data: Record<string, unknown>
): StreamSearchEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

/**
 * POST /api/v1/search/stream
 * Stream search results via SSE
 */
searchStream.post('/', async (c) => {
  // Parse and validate request body
  let body: SearchRequestBody;
  try {
    const rawBody = await c.req.json();
    body = searchRequestSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errors.validationError(c, error.errors[0]?.message ?? 'Invalid request body');
    }
    return errors.badRequest(c, 'Invalid JSON body');
  }

  // Create SDK service
  const sdk = createSDKService(c.env);

  return streamSSE(c, async (stream) => {
    try {
      // Emit search started event
      await stream.writeSSE({
        event: 'search_started',
        data: JSON.stringify(
          createEvent('search_started', {
            query: body.query,
            limit: body.limit,
            filters: body.filters,
          })
        ),
      });

      // Create search service
      const searchResultsCache = createCacheService(c.env.CACHE, CACHE_TTL.SEARCH_RESULTS);
      const searchService = createSearchService(
        c.env.SEARCH_SERVICE_URL,
        searchResultsCache,
        c.env
      );

      // Determine over-fetch amount based on filters
      const hasBooleanFilters =
        body.filters?.mcp !== undefined ||
        body.filters?.a2a !== undefined ||
        body.filters?.x402 !== undefined ||
        (body.filters?.chainIds && body.filters.chainIds.length > 0);

      const hasOASFFilters =
        (body.filters?.skills && body.filters.skills.length > 0) ||
        (body.filters?.domains && body.filters.domains.length > 0);

      let fetchLimit = body.limit;
      if (hasOASFFilters) {
        fetchLimit = Math.min(body.limit * 10, 100);
      } else if (hasBooleanFilters) {
        fetchLimit = Math.min(body.limit * 3, 100);
      }

      // Only pass filters that work upstream
      const upstreamFilters = body.filters ? { active: body.filters.active } : undefined;

      // Execute vector search
      const searchResults = await searchService.search({
        query: body.query,
        limit: fetchLimit,
        minScore: body.minScore,
        cursor: body.cursor,
        offset: body.offset,
        filters: upstreamFilters,
      });

      // Emit vector results event
      await stream.writeSSE({
        event: 'vector_results',
        data: JSON.stringify(
          createEvent('vector_results', {
            count: searchResults.results.length,
            total: searchResults.total,
            hasMore: searchResults.hasMore,
          })
        ),
      });

      // Batch fetch classifications
      const agentIds = searchResults.results.map((r) => r.agentId);
      const classificationsMap = await getClassificationsBatch(c.env.DB, agentIds);

      // Emit enrichment progress
      await stream.writeSSE({
        event: 'enrichment_progress',
        data: JSON.stringify(
          createEvent('enrichment_progress', {
            total: agentIds.length,
            phase: 'classifications_loaded',
          })
        ),
      });

      // Enrich with SDK data and stream individual agents
      const agentCache = createCacheService(c.env.CACHE, CACHE_TTL.AGENT_DETAIL);
      const enrichedAgents: AgentSummary[] = [];

      for (let i = 0; i < searchResults.results.length; i++) {
        const result = searchResults.results[i];
        if (!result) continue;

        const { chainId, tokenId } = parseAgentId(result.agentId);
        const meta = result.metadata || {};
        const classificationRow = classificationsMap.get(result.agentId);
        const oasf = parseClassificationRow(classificationRow);

        // Try cache first
        const cacheKey = `agent:${result.agentId}`;
        let sdkData: AgentDetail | null = await agentCache.get<AgentDetail>(cacheKey);

        if (!sdkData) {
          try {
            sdkData = await sdk.getAgent(chainId, tokenId);
            if (sdkData) {
              await agentCache.set(cacheKey, sdkData, CACHE_TTL.AGENT_DETAIL);
            }
          } catch {
            sdkData = null;
          }
        }

        // Build enriched agent
        let hasMcp: boolean;
        let hasA2a: boolean;
        let x402Support: boolean;
        let supportedTrust: TrustMethod[];
        let image: string | undefined;
        let operators: string[] | undefined;
        let ens: string | undefined;
        let did: string | undefined;
        let walletAddress: string | undefined;

        if (sdkData) {
          hasMcp = sdkData.hasMcp;
          hasA2a = sdkData.hasA2a;
          x402Support = sdkData.x402Support;
          supportedTrust = sdkData.supportedTrust;
          image = sdkData.image;
          operators = sdkData.operators;
          ens = sdkData.ens;
          did = sdkData.did;
          walletAddress = sdkData.walletAddress;
        } else {
          const mcpTools = Array.isArray(meta.mcpTools) ? meta.mcpTools : [];
          const mcpPrompts = Array.isArray(meta.mcpPrompts) ? meta.mcpPrompts : [];
          const mcpResources = Array.isArray(meta.mcpResources) ? meta.mcpResources : [];
          const a2aSkills = Array.isArray(meta.a2aSkills) ? meta.a2aSkills : [];
          const supportedTrusts = Array.isArray(meta.supportedTrusts) ? meta.supportedTrusts : [];

          hasMcp = mcpTools.length > 0 || mcpPrompts.length > 0 || mcpResources.length > 0;
          hasA2a = a2aSkills.length > 0;
          x402Support = meta.x402support === true;
          supportedTrust = [];
          if (supportedTrusts.includes('x402') || meta.x402support === true)
            supportedTrust.push('x402');
          if (supportedTrusts.includes('eas')) supportedTrust.push('eas');
          image = typeof meta.image === 'string' ? meta.image : undefined;
          operators = Array.isArray(meta.operators) ? meta.operators : [];
          ens = typeof meta.ens === 'string' ? meta.ens : undefined;
          did = typeof meta.did === 'string' ? meta.did : undefined;
          walletAddress = typeof meta.agentWallet === 'string' ? meta.agentWallet : undefined;
        }

        const agent: AgentSummary = {
          id: result.agentId,
          chainId: result.chainId,
          tokenId,
          name: result.name,
          description: result.description,
          image,
          active: typeof meta.active === 'boolean' ? meta.active : true,
          hasMcp,
          hasA2a,
          x402Support,
          supportedTrust,
          operators: operators ?? [],
          ens,
          did,
          walletAddress,
          oasf,
          oasfSource: (oasf ? 'llm-classification' : 'none') as OASFSource,
          searchScore: result.score,
          matchReasons: result.matchReasons,
        };

        enrichedAgents.push(agent);

        // Stream each enriched agent
        await stream.writeSSE({
          event: 'agent_enriched',
          data: JSON.stringify(
            createEvent('agent_enriched', {
              index: i + 1,
              total: searchResults.results.length,
              agent,
            })
          ),
        });
      }

      // Apply filters
      const filteredAgents = applyFilters(enrichedAgents, body.filters);
      const finalAgents = filteredAgents.slice(0, body.limit);

      // Emit completion event
      await stream.writeSSE({
        event: 'search_complete',
        data: JSON.stringify(
          createEvent('search_complete', {
            query: body.query,
            total: filteredAgents.length,
            returned: finalAgents.length,
            hasMore: filteredAgents.length > body.limit,
            nextCursor: searchResults.nextCursor,
            byChain: searchResults.byChain,
            agents: finalAgents,
          })
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const requestId = c.get('requestId');
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify(
          createEvent('error', {
            message,
            requestId,
          })
        ),
      });
    }
  });
});

/**
 * GET /api/v1/search/stream/info
 * Information about the streaming search endpoint
 */
searchStream.get('/info', async (c) => {
  return c.json({
    success: true,
    data: {
      description: 'Streaming search results via Server-Sent Events (SSE)',
      endpoint: 'POST /api/v1/search/stream',
      eventTypes: [
        {
          type: 'search_started',
          description: 'Search initiated with query and filters',
        },
        {
          type: 'vector_results',
          description: 'Initial vector search results count',
        },
        {
          type: 'enrichment_progress',
          description: 'Progress updates during agent enrichment',
        },
        {
          type: 'agent_enriched',
          description: 'Individual enriched agent data (streamed one by one)',
        },
        {
          type: 'rerank_started',
          description: 'Reranking phase started (if enabled)',
        },
        {
          type: 'rerank_progress',
          description: 'Reranking progress updates',
        },
        {
          type: 'search_complete',
          description: 'Final results with all agents and metadata',
        },
        {
          type: 'error',
          description: 'Error occurred during search',
        },
      ],
      requestBody: {
        query: 'Natural language search query (required)',
        limit: 'Maximum results (default: 20)',
        minScore: 'Minimum similarity score 0-1 (default: 0.3)',
        filters: 'Optional filter object',
      },
      example: {
        curl: `curl -X POST "https://api.8004.dev/api/v1/search/stream" \\
  -H "Content-Type: application/json" \\
  -H "Accept: text/event-stream" \\
  -d '{"query": "AI coding assistant", "limit": 5}'`,
      },
      notes: [
        'Use EventSource API or SSE client library',
        'Each event contains timestamp and typed data',
        "agent_enriched events stream individual results as they're processed",
        'search_complete contains the final aggregated results',
      ],
    },
  });
});

export { searchStream };
