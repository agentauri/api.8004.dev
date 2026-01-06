/**
 * Analytics endpoints
 * @module routes/analytics
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  getAnalyticsSummary,
  getChainActivity,
  getHistoricalMetrics,
  getPlatformStats,
  getPopularFilters,
  getSearchVolume,
  getTopEndpoints,
  type MetricType,
  type Period,
} from '@/services/analytics';
import type { Env, Variables } from '@/types';
import { z } from 'zod';

const analytics = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
analytics.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Query parameter validation
 */
const periodSchema = z.enum(['hour', 'day', 'week', 'month']).optional().default('day');
const limitSchema = z.coerce.number().int().min(1).max(100).optional().default(20);
const metricTypeSchema = z.enum(['agents', 'search', 'classification', 'feedback', 'api_usage']);

/**
 * GET /api/v1/analytics
 * Get analytics summary for a period
 */
analytics.get('/', async (c) => {
  const periodParam = c.req.query('period');

  const periodResult = periodSchema.safeParse(periodParam);
  if (!periodResult.success) {
    return errors.validationError(c, 'Invalid period. Must be one of: hour, day, week, month');
  }

  const summary = await getAnalyticsSummary(c.env.DB, periodResult.data as Period);

  return c.json({
    success: true,
    data: summary,
  });
});

/**
 * GET /api/v1/analytics/stats
 * Get current platform statistics
 */
analytics.get('/stats', async (c) => {
  const stats = await getPlatformStats(c.env.DB);

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/v1/analytics/filters
 * Get popular filter usage
 */
analytics.get('/filters', async (c) => {
  const periodParam = c.req.query('period');
  const limitParam = c.req.query('limit');

  const periodResult = periodSchema.safeParse(periodParam);
  const limitResult = limitSchema.safeParse(limitParam);

  if (!periodResult.success) {
    return errors.validationError(c, 'Invalid period');
  }
  if (!limitResult.success) {
    return errors.validationError(c, 'Invalid limit');
  }

  const filters = await getPopularFilters(c.env.DB, periodResult.data as Period, limitResult.data);

  return c.json({
    success: true,
    data: filters,
    meta: {
      period: periodResult.data,
      limit: limitResult.data,
    },
  });
});

/**
 * GET /api/v1/analytics/endpoints
 * Get top API endpoint usage
 */
analytics.get('/endpoints', async (c) => {
  const periodParam = c.req.query('period');
  const limitParam = c.req.query('limit');

  const periodResult = periodSchema.safeParse(periodParam);
  const limitResult = limitSchema.safeParse(limitParam);

  if (!periodResult.success) {
    return errors.validationError(c, 'Invalid period');
  }
  if (!limitResult.success) {
    return errors.validationError(c, 'Invalid limit');
  }

  const endpoints = await getTopEndpoints(c.env.DB, periodResult.data as Period, limitResult.data);

  return c.json({
    success: true,
    data: endpoints,
    meta: {
      period: periodResult.data,
      limit: limitResult.data,
    },
  });
});

/**
 * GET /api/v1/analytics/search
 * Get search volume statistics
 */
analytics.get('/search', async (c) => {
  const periodParam = c.req.query('period');

  const periodResult = periodSchema.safeParse(periodParam);
  if (!periodResult.success) {
    return errors.validationError(c, 'Invalid period');
  }

  const searchVolume = await getSearchVolume(c.env.DB, periodResult.data as Period);

  return c.json({
    success: true,
    data: searchVolume,
    meta: {
      period: periodResult.data,
    },
  });
});

/**
 * GET /api/v1/analytics/chains
 * Get activity breakdown by chain
 */
analytics.get('/chains', async (c) => {
  const periodParam = c.req.query('period');

  const periodResult = periodSchema.safeParse(periodParam);
  if (!periodResult.success) {
    return errors.validationError(c, 'Invalid period');
  }

  const chainActivity = await getChainActivity(c.env.DB, periodResult.data as Period);

  return c.json({
    success: true,
    data: chainActivity,
    meta: {
      period: periodResult.data,
    },
  });
});

/**
 * GET /api/v1/analytics/history/:metricType
 * Get historical metrics data
 */
analytics.get('/history/:metricType', async (c) => {
  const metricTypeParam = c.req.param('metricType');
  const periodParam = c.req.query('period');
  const chainIdParam = c.req.query('chainId');
  const startDateParam = c.req.query('startDate');
  const endDateParam = c.req.query('endDate');
  const limitParam = c.req.query('limit');

  const metricTypeResult = metricTypeSchema.safeParse(metricTypeParam);
  if (!metricTypeResult.success) {
    return errors.validationError(c, 'Invalid metric type. Must be one of: agents, search, classification, feedback, api_usage');
  }

  const periodResult = periodSchema.safeParse(periodParam);
  if (!periodResult.success) {
    return errors.validationError(c, 'Invalid period');
  }

  const limitResult = z.coerce.number().int().min(1).max(1000).optional().default(168).safeParse(limitParam);
  if (!limitResult.success) {
    return errors.validationError(c, 'Invalid limit');
  }

  const chainId = chainIdParam ? Number.parseInt(chainIdParam, 10) : undefined;
  if (chainIdParam && Number.isNaN(chainId)) {
    return errors.validationError(c, 'Invalid chainId');
  }

  const metrics = await getHistoricalMetrics(c.env.DB, metricTypeResult.data as MetricType, {
    period: periodResult.data as Period,
    chainId,
    startDate: startDateParam,
    endDate: endDateParam,
    limit: limitResult.data,
  });

  return c.json({
    success: true,
    data: metrics,
    meta: {
      metricType: metricTypeResult.data,
      period: periodResult.data,
      count: metrics.length,
    },
  });
});

export { analytics };
