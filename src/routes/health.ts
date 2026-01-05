/**
 * Health check endpoint
 * @module routes/health
 */

import { Hono } from 'hono';
import { getAllCircuitStatus } from '@/lib/utils/circuit-breaker';
import { getCacheMetrics } from '@/services/cache-metrics';
import { createEASIndexerService } from '@/services/eas-indexer';
import { createSearchService } from '@/services/search';
import { syncD1ToQdrant, syncFromGraph, syncFromSDK } from '@/services/sync';
import type { Env, HealthResponse, ServiceStatus, Variables } from '@/types';

const health = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Check database connectivity
 */
async function checkDatabase(db: D1Database): Promise<ServiceStatus> {
  try {
    await db.prepare('SELECT 1').first();
    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * Check search service connectivity
 */
async function checkSearchService(url: string, env?: Env): Promise<ServiceStatus> {
  try {
    const searchService = createSearchService(url, undefined, env);
    const healthy = await searchService.healthCheck();
    return healthy ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/**
 * Check Anthropic API connectivity
 */
async function checkClassifier(apiKey: string): Promise<ServiceStatus> {
  // For health checks, we just verify the API key format
  // Full health check would be expensive (API call)
  if (apiKey?.startsWith('sk-ant-')) {
    return 'ok';
  }
  return 'error';
}

/**
 * GET /api/v1/health
 * Returns service health status
 */
health.get('/', async (c) => {
  const env = c.env;

  // Run health checks in parallel
  const [dbStatus, searchStatus, classifierStatus] = await Promise.all([
    checkDatabase(env.DB),
    checkSearchService(env.SEARCH_SERVICE_URL, env),
    checkClassifier(env.ANTHROPIC_API_KEY),
  ]);

  // SDK is always ok since it's local
  const sdkStatus: ServiceStatus = 'ok';

  // Collect all statuses
  const allStatuses: ServiceStatus[] = [dbStatus, sdkStatus, searchStatus, classifierStatus];

  // Determine overall status
  const allOk = allStatuses.every((s) => s === 'ok');
  const anyError = allStatuses.some((s) => s === 'error');

  // Get circuit breaker status
  const circuitStatus = getAllCircuitStatus();

  const response: HealthResponse = {
    status: allOk ? 'ok' : anyError ? 'degraded' : 'down',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      sdk: sdkStatus,
      searchService: searchStatus,
      classifier: classifierStatus,
      database: dbStatus,
    },
    // Add circuit breaker status (optional - not in HealthResponse type)
    // @ts-expect-error - extending response with circuit breaker info
    circuits: circuitStatus,
  };

  const httpStatus = response.status === 'ok' ? 200 : 503;
  return c.json(response, httpStatus);
});

/**
 * POST /api/v1/health/sync-eas
 * Manually trigger EAS attestation sync (admin only)
 */
health.post('/sync-eas', async (c) => {
  const indexer = createEASIndexerService(c.env.DB);
  const results = await indexer.syncAll();

  const summary: Record<string, unknown> = {};
  for (const [chainId, result] of results) {
    summary[chainId.toString()] = {
      success: result.success,
      attestationsProcessed: result.attestationsProcessed,
      newFeedbackCount: result.newFeedbackCount,
      error: result.error,
    };
  }

  return c.json({
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/health/sync-qdrant
 * Manually trigger Qdrant sync from Graph and D1 (admin only)
 * Query params:
 *   - limit: Max agents to sync (default: 5000)
 *   - batchSize: Agents per batch (default: 10)
 *   - skipD1: Skip D1 sync (default: false)
 *   - includeAll: Include agents without registration files (default: false)
 */
health.post('/sync-qdrant', async (c) => {
  const env = c.env;

  // Parse query parameters
  const limitParam = c.req.query('limit');
  const batchSizeParam = c.req.query('batchSize');
  const skipD1 = c.req.query('skipD1') === 'true';
  const includeAll = c.req.query('includeAll') === 'true';

  const limit = limitParam ? Number.parseInt(limitParam, 10) : 5000;
  const batchSize = batchSizeParam ? Number.parseInt(batchSizeParam, 10) : 10;

  // Check required env vars
  if (!env.QDRANT_URL || !env.QDRANT_API_KEY || !env.VENICE_API_KEY) {
    return c.json(
      {
        success: false,
        error:
          'Missing required environment variables: QDRANT_URL, QDRANT_API_KEY, or VENICE_API_KEY',
      },
      500
    );
  }

  const qdrantEnv = {
    QDRANT_URL: env.QDRANT_URL,
    QDRANT_API_KEY: env.QDRANT_API_KEY,
    QDRANT_COLLECTION: env.QDRANT_COLLECTION,
    VENICE_API_KEY: env.VENICE_API_KEY,
    GRAPH_API_KEY: env.GRAPH_API_KEY,
  };

  try {
    // Use SDK sync if no Graph API key, otherwise use Graph sync
    const useSDK = !env.GRAPH_API_KEY;
    const logger = c.get('logger');

    let agentSyncResult: {
      newAgents: number;
      updatedAgents: number;
      errors: string[];
      reembedded?: number;
    };

    if (useSDK) {
      logger.info('Starting SDK sync', { limit, batchSize, includeAll });
      agentSyncResult = await syncFromSDK(env, qdrantEnv, { limit, batchSize, includeAll });
    } else {
      logger.info('Starting Graph sync');
      agentSyncResult = await syncFromGraph(env.DB, qdrantEnv);
    }

    // Run D1 sync (optional)
    let d1Result = { classificationsUpdated: 0, reputationUpdated: 0, errors: [] as string[] };
    if (!skipD1) {
      d1Result = await syncD1ToQdrant(env.DB, qdrantEnv);
    }

    return c.json({
      success: true,
      data: {
        source: useSDK ? 'sdk' : 'graph',
        options: { limit, batchSize, skipD1, includeAll },
        agents: {
          newAgents: agentSyncResult.newAgents,
          updatedAgents: agentSyncResult.updatedAgents,
          reembedded: agentSyncResult.reembedded ?? 0,
          errors: agentSyncResult.errors.slice(0, 10),
        },
        d1: skipD1
          ? { skipped: true }
          : {
              classificationsUpdated: d1Result.classificationsUpdated,
              reputationUpdated: d1Result.reputationUpdated,
              errors: d1Result.errors.slice(0, 10),
            },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    c.get('logger').logError('Qdrant sync failed', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/v1/health/qdrant/indexes
 * Create required payload indexes in Qdrant (admin only)
 */
health.post('/qdrant/indexes', async (c) => {
  const env = c.env;

  if (!env.QDRANT_URL || !env.QDRANT_API_KEY) {
    return c.json(
      {
        success: false,
        error: 'QDRANT_URL or QDRANT_API_KEY not set',
      },
      500
    );
  }

  try {
    const { createQdrantClient } = await import('@/services/qdrant');
    const qdrant = createQdrantClient({
      QDRANT_URL: env.QDRANT_URL,
      QDRANT_API_KEY: env.QDRANT_API_KEY,
      QDRANT_COLLECTION: env.QDRANT_COLLECTION,
    });

    await qdrant.ensurePayloadIndexes();

    return c.json({
      success: true,
      message: 'Payload indexes created/verified successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    c.get('logger').logError('Failed to create indexes', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/v1/health/qdrant
 * Check Qdrant connection and collection status
 */
health.get('/qdrant', async (c) => {
  const env = c.env;

  if (!env.QDRANT_URL || !env.QDRANT_API_KEY) {
    return c.json({
      success: true,
      data: {
        configured: false,
        error: 'QDRANT_URL or QDRANT_API_KEY not set',
      },
    });
  }

  const collection = env.QDRANT_COLLECTION ?? 'agents';

  try {
    // Check collection info
    const response = await fetch(`${env.QDRANT_URL}/collections/${collection}`, {
      headers: {
        'api-key': env.QDRANT_API_KEY,
      },
    });

    if (!response.ok) {
      return c.json({
        success: true,
        data: {
          configured: true,
          collection,
          status: 'error',
          error: `HTTP ${response.status}: ${await response.text()}`,
        },
      });
    }

    const data = (await response.json()) as {
      result?: {
        status?: string;
        points_count?: number;
        vectors_count?: number;
      };
    };

    return c.json({
      success: true,
      data: {
        configured: true,
        collection,
        status: data.result?.status ?? 'unknown',
        pointsCount: data.result?.points_count ?? 0,
        vectorsCount: data.result?.vectors_count ?? 0,
      },
    });
  } catch (error) {
    return c.json({
      success: true,
      data: {
        configured: true,
        collection,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * GET /api/v1/health/cache
 * Returns cache hit/miss metrics
 */
health.get('/cache', (c) => {
  const metrics = getCacheMetrics();

  return c.json({
    success: true,
    data: {
      hitRate: `${metrics.hitRate}%`,
      totalHits: metrics.totalHits,
      totalMisses: metrics.totalMisses,
      totalErrors: metrics.totalErrors,
      windowSeconds: metrics.windowSeconds,
      byPrefix: metrics.byPrefix,
    },
    timestamp: new Date().toISOString(),
  });
});

export { health };
