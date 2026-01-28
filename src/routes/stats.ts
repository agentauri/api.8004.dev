/**
 * Platform statistics endpoint
 * @module routes/stats
 */

import { Hono } from 'hono';
import { getFeedbackStats, getTotalClassificationCount } from '@/db/queries';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import {
  ACTIVE_CHAIN_IDS,
  buildSubgraphUrls,
  createSDKService,
  fetchProtocolStatsFromSubgraph,
  getChainConfig,
  SUPPORTED_CHAINS,
} from '@/services/sdk';
import type {
  ChainProtocolStatsResponse,
  Env,
  GlobalStatsResponse,
  PlatformStatsResponse,
  Variables,
} from '@/types';

const stats = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
stats.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/stats
 * Get platform-wide statistics
 *
 * Enhanced with Protocol stats from subgraph (totalValidations, unique tags)
 */
stats.get('/', async (c) => {
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.PLATFORM_STATS);
  const cacheKey = CACHE_KEYS.platformStats();

  // Check cache
  const cached = await cache.get<PlatformStatsResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Fetch chain stats and D1 counts in parallel
  const sdk = createSDKService(c.env);
  const [chainStats, feedbackStats, classificationCount] = await Promise.all([
    sdk.getChainStats(),
    getFeedbackStats(c.env.DB),
    getTotalClassificationCount(c.env.DB),
  ]);

  // Check if any chain has errors - don't cache stale data
  const hasErrors = chainStats.some((chain) => chain.status === 'error');

  // Fetch Protocol stats from subgraph for enhanced data
  const subgraphUrls = c.env.GRAPH_API_KEY ? buildSubgraphUrls(c.env.GRAPH_API_KEY) : {};
  const protocolStatsPromises = chainStats.map((chain) =>
    fetchProtocolStatsFromSubgraph(chain.chainId, subgraphUrls).catch((error) => {
      console.warn(
        `Stats: Failed to fetch protocol stats for chain ${chain.chainId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    })
  );
  const protocolStats = await Promise.all(protocolStatsPromises);

  // Aggregate totals
  const totalAgents = chainStats.reduce((sum, chain) => sum + chain.totalCount, 0);
  const withRegistrationFile = chainStats.reduce(
    (sum, chain) => sum + chain.withRegistrationFileCount,
    0
  );
  const activeAgents = chainStats.reduce((sum, chain) => sum + chain.activeCount, 0);

  // Aggregate Protocol stats (validations, tags)
  let totalValidations = 0;
  const allTags = new Set<string>();
  for (const protocol of protocolStats) {
    if (protocol) {
      totalValidations += protocol.totalValidations ?? 0;
      for (const tag of protocol.tags ?? []) {
        allTags.add(tag);
      }
    }
  }

  const response: PlatformStatsResponse = {
    success: true,
    data: {
      totalAgents,
      withRegistrationFile,
      activeAgents,
      totalFeedback: feedbackStats.total,
      totalClassifications: classificationCount,
      chainBreakdown: chainStats,
      // Enhanced stats from Protocol entity
      totalValidations,
      uniqueTags: Array.from(allTags).sort(),
    },
  };

  // Only cache if all chains succeeded
  if (!hasErrors) {
    await cache.set(cacheKey, response, CACHE_TTL.PLATFORM_STATS);
  }
  return c.json(response);
});

/**
 * GET /api/v1/stats/global
 * Get global cross-chain aggregate statistics
 */
stats.get('/global', async (c) => {
  const cache = createCacheService(c.env.CACHE, CACHE_TTL.PLATFORM_STATS);
  const cacheKey = CACHE_KEYS.platformStats() + ':global';

  // Check cache
  const cached = await cache.get<GlobalStatsResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Fetch chain stats and D1 feedback stats
  const sdk = createSDKService(c.env);
  const [chainStats, feedbackStats] = await Promise.all([
    sdk.getChainStats(),
    getFeedbackStats(c.env.DB),
  ]);

  // Fetch Protocol stats from subgraph for each chain
  const subgraphUrls = c.env.GRAPH_API_KEY ? buildSubgraphUrls(c.env.GRAPH_API_KEY) : {};
  const protocolStatsPromises = chainStats.map((chain) =>
    fetchProtocolStatsFromSubgraph(chain.chainId, subgraphUrls).catch((error) => {
      console.warn(
        `Stats global: Failed to fetch protocol stats for chain ${chain.chainId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    })
  );
  const protocolStats = await Promise.all(protocolStatsPromises);

  // Aggregate totals
  let totalAgents = 0;
  let totalValidations = 0;
  const protocolsByChain: GlobalStatsResponse['data']['protocolsByChain'] = [];

  for (let i = 0; i < chainStats.length; i++) {
    const chain = chainStats[i];
    const protocol = protocolStats[i];
    if (!chain) continue;

    totalAgents += chain.totalCount;
    const chainValidations = protocol?.totalValidations ?? 0;
    totalValidations += chainValidations;

    protocolsByChain.push({
      chainId: chain.chainId,
      chainName: chain.name,
      agents: chain.totalCount,
      feedback: protocol?.totalFeedback ?? 0,
      validations: chainValidations,
    });
  }

  const response: GlobalStatsResponse = {
    success: true,
    data: {
      totalAgents,
      totalFeedback: feedbackStats.total,
      totalValidations,
      protocolsByChain,
      lastUpdated: new Date().toISOString(),
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.PLATFORM_STATS);
  return c.json(response);
});

/**
 * GET /api/v1/stats/chains/:chainId
 * Get protocol statistics for a specific chain
 */
stats.get('/chains/:chainId', async (c) => {
  const chainIdStr = c.req.param('chainId');
  const chainId = Number.parseInt(chainIdStr, 10);

  if (Number.isNaN(chainId)) {
    return errors.validationError(c, 'Invalid chain ID');
  }

  const chainConfig = getChainConfig(chainId);
  if (!chainConfig) {
    return errors.notFound(c, `Chain ${chainId} not supported`);
  }

  const cache = createCacheService(c.env.CACHE, CACHE_TTL.PLATFORM_STATS);
  const cacheKey = CACHE_KEYS.platformStats() + `:chain:${chainId}`;

  // Check cache
  const cached = await cache.get<ChainProtocolStatsResponse>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  // Fetch stats for this specific chain
  const sdk = createSDKService(c.env);
  const chainStats = await sdk.getChainStats();
  const chainStat = chainStats.find((s) => s.chainId === chainId);

  // Fetch Protocol stats from subgraph
  const subgraphUrls = c.env.GRAPH_API_KEY ? buildSubgraphUrls(c.env.GRAPH_API_KEY) : {};
  const protocolStats = await fetchProtocolStatsFromSubgraph(chainId, subgraphUrls).catch(
    (error) => {
      console.warn(
        `Stats chains: Failed to fetch protocol stats for chain ${chainId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  );

  const response: ChainProtocolStatsResponse = {
    success: true,
    data: {
      chainId,
      chainName: chainConfig.name,
      totalAgents: chainStat?.totalCount ?? 0,
      withRegistrationFile: chainStat?.withRegistrationFileCount ?? 0,
      activeAgents: chainStat?.activeCount ?? 0,
      totalFeedback: protocolStats?.totalFeedback ?? 0,
      totalValidations: protocolStats?.totalValidations ?? 0,
      tags: protocolStats?.tags ?? [],
      deploymentStatus: ACTIVE_CHAIN_IDS.has(chainId) ? 'active' : 'pending',
      lastUpdated: protocolStats?.updatedAt
        ? new Date(Number.parseInt(protocolStats.updatedAt, 10) * 1000).toISOString()
        : new Date().toISOString(),
    },
  };

  // Cache the response
  await cache.set(cacheKey, response, CACHE_TTL.PLATFORM_STATS);
  return c.json(response);
});

export { stats };
