/**
 * Health check endpoint
 * @module routes/health
 */

import { createEASIndexerService } from '@/services/eas-indexer';
import { createSearchService } from '@/services/search';
import type { Env, HealthResponse, ServiceStatus, Variables } from '@/types';
import { Hono } from 'hono';

const health = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Check database connectivity
 */
async function checkDatabase(db: D1Database): Promise<ServiceStatus> {
  try {
    await db.prepare('SELECT 1').first();
    return 'ok';
  } catch (error) {
    console.error('Database health check failed:', error instanceof Error ? error.message : error);
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
  } catch (error) {
    console.error(
      'Search service health check failed:',
      error instanceof Error ? error.message : error
    );
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

export { health };
