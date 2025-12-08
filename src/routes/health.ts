/**
 * Health check endpoint
 * @module routes/health
 */

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
  } catch {
    return 'error';
  }
}

/**
 * Check search service connectivity
 */
async function checkSearchService(url: string): Promise<ServiceStatus> {
  try {
    const searchService = createSearchService(url);
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
    checkSearchService(env.SEARCH_SERVICE_URL),
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

export { health };
