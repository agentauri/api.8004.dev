/**
 * Agent metadata endpoints
 * @module routes/metadata
 *
 * Provides access to on-chain key-value metadata stored via setMetadata()
 * Data is fetched from the subgraph AgentMetadata entity
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { validateAndParseAgentId } from '@/lib/utils/validation';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import {
  buildSubgraphUrls,
  fetchAgentMetadataFromSubgraph,
  type SubgraphAgentMetadata,
} from '@/services/sdk';
import type { Env, Variables } from '@/types';

const metadata = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
metadata.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Metadata entry in API response format
 */
interface MetadataEntry {
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * Response type for metadata endpoint
 */
interface MetadataResponse {
  success: true;
  data: {
    agentId: string;
    metadata: MetadataEntry[];
    count: number;
  };
}

/**
 * Transform subgraph metadata to API format
 */
function transformMetadata(entry: SubgraphAgentMetadata): MetadataEntry {
  return {
    key: entry.key,
    value: entry.value,
    updatedAt: new Date(Number.parseInt(entry.updatedAt, 10) * 1000).toISOString(),
  };
}

/**
 * GET /api/v1/agents/:agentId/metadata
 * Get all on-chain metadata for an agent
 *
 * Returns key-value pairs stored on-chain via the setMetadata() function
 * in the IdentityRegistry contract.
 */
metadata.get('/', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const parsed = validateAndParseAgentId(agentId);
  if (!parsed) {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const { chainId } = parsed;

  // Check cache
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.AGENT_DETAIL);
  const cacheKey = CACHE_KEYS.agentDetail(`${agentId}:metadata`);
  const cached = await cache.get<MetadataResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Fetch metadata from subgraph
  const subgraphUrls = buildSubgraphUrls(c.env.GRAPH_API_KEY);
  const subgraphMetadata = await fetchAgentMetadataFromSubgraph(chainId, agentId, subgraphUrls);

  const metadataEntries = subgraphMetadata.map(transformMetadata);

  const response: MetadataResponse = {
    success: true,
    data: {
      agentId,
      metadata: metadataEntries,
      count: metadataEntries.length,
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.AGENT_DETAIL);

  return c.json(response);
});

/**
 * GET /api/v1/agents/:agentId/metadata/:key
 * Get a specific metadata entry by key
 */
metadata.get('/:key', async (c) => {
  const agentId = c.req.param('agentId');
  const key = c.req.param('key');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  if (!key) {
    return errors.validationError(c, 'Metadata key is required');
  }

  const parsed = validateAndParseAgentId(agentId);
  if (!parsed) {
    return errors.validationError(c, 'Invalid agent ID format. Expected chainId:tokenId');
  }

  const { chainId } = parsed;

  // Fetch metadata from subgraph
  const subgraphUrls = buildSubgraphUrls(c.env.GRAPH_API_KEY);
  const subgraphMetadata = await fetchAgentMetadataFromSubgraph(chainId, agentId, subgraphUrls);

  // Find the specific key
  const entry = subgraphMetadata.find((m) => m.key === key);

  if (!entry) {
    return errors.notFound(c, `Metadata key '${key}' not found for agent ${agentId}`);
  }

  return c.json({
    success: true,
    data: {
      agentId,
      ...transformMetadata(entry),
    },
  });
});

export { metadata };
