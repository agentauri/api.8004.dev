/**
 * Webhook management endpoints
 * @module routes/webhooks
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import {
  createWebhookService,
  generateSignature,
  WEBHOOK_EVENTS,
  type WebhookEventType,
  type WebhookFilters,
} from '@/services/webhook';
import type { Env, Variables } from '@/types';
import { z } from 'zod';

const webhooks = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
webhooks.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Validation schemas
 */
const createWebhookSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  events: z
    .array(z.enum(WEBHOOK_EVENTS as unknown as [string, ...string[]]))
    .min(1, 'At least one event type is required'),
  filters: z
    .object({
      chainIds: z.array(z.number()).optional(),
      agentIds: z.array(z.string()).optional(),
    })
    .optional(),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/v1/webhooks
 * List all webhooks for the authenticated user
 */
webhooks.get('/', async (c) => {
  // Get owner from API key context (simplified - in production would use proper auth)
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) {
    return errors.unauthorized(c, 'API key required');
  }

  const webhookService = createWebhookService(c.env.DB);
  const userWebhooks = await webhookService.getWebhooks(apiKey);

  return c.json({
    success: true,
    data: userWebhooks.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      filters: w.filters,
      active: w.active,
      description: w.description,
      lastDeliveryAt: w.lastDeliveryAt,
      lastDeliveryStatus: w.lastDeliveryStatus,
      failureCount: w.failureCount,
      createdAt: w.createdAt,
    })),
    meta: {
      total: userWebhooks.length,
    },
  });
});

/**
 * POST /api/v1/webhooks
 * Create a new webhook subscription
 */
webhooks.post('/', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) {
    return errors.unauthorized(c, 'API key required');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errors.validationError(c, 'Invalid JSON body');
  }

  const parseResult = createWebhookSchema.safeParse(body);
  if (!parseResult.success) {
    return errors.validationError(c, parseResult.error.issues[0]?.message ?? 'Invalid request');
  }

  const { url, events, filters, description } = parseResult.data;

  const webhookService = createWebhookService(c.env.DB);
  const { webhook, secret } = await webhookService.createWebhook({
    url,
    events: events as WebhookEventType[],
    filters: filters as WebhookFilters | undefined,
    description,
    owner: apiKey,
  });

  return c.json(
    {
      success: true,
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        filters: webhook.filters,
        active: webhook.active,
        description: webhook.description,
        createdAt: webhook.createdAt,
        // Only return secret on creation - user must save it
        secret,
      },
      message: 'Webhook created successfully. Save the secret - it will not be shown again.',
    },
    201
  );
});

/**
 * GET /api/v1/webhooks/:id
 * Get webhook details
 */
webhooks.get('/:id', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) {
    return errors.unauthorized(c, 'API key required');
  }

  const id = c.req.param('id');
  const webhookService = createWebhookService(c.env.DB);
  const webhook = await webhookService.getWebhook(id);

  if (!webhook) {
    return errors.notFound(c, 'Webhook not found');
  }

  // Verify ownership
  if (webhook.owner !== apiKey) {
    return errors.notFound(c, 'Webhook not found');
  }

  // Get recent deliveries
  const deliveries = await webhookService.getDeliveries(id, 10);

  return c.json({
    success: true,
    data: {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      filters: webhook.filters,
      active: webhook.active,
      description: webhook.description,
      lastDeliveryAt: webhook.lastDeliveryAt,
      lastDeliveryStatus: webhook.lastDeliveryStatus,
      failureCount: webhook.failureCount,
      createdAt: webhook.createdAt,
      recentDeliveries: deliveries.map((d) => ({
        id: d.id,
        eventType: d.eventType,
        status: d.status,
        attempts: d.attempts,
        responseStatus: d.responseStatus,
        error: d.error,
        createdAt: d.createdAt,
      })),
    },
  });
});

/**
 * DELETE /api/v1/webhooks/:id
 * Delete a webhook subscription
 */
webhooks.delete('/:id', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) {
    return errors.unauthorized(c, 'API key required');
  }

  const id = c.req.param('id');
  const webhookService = createWebhookService(c.env.DB);
  const deleted = await webhookService.deleteWebhook(id, apiKey);

  if (!deleted) {
    return errors.notFound(c, 'Webhook not found');
  }

  return c.json({
    success: true,
    message: 'Webhook deleted successfully',
  });
});

/**
 * POST /api/v1/webhooks/:id/test
 * Send a test event to the webhook
 */
webhooks.post('/:id/test', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) {
    return errors.unauthorized(c, 'API key required');
  }

  const id = c.req.param('id');
  const webhookService = createWebhookService(c.env.DB);

  // Get webhook and verify ownership
  const webhook = await webhookService.getWebhook(id);
  if (!webhook || webhook.owner !== apiKey) {
    return errors.notFound(c, 'Webhook not found');
  }

  // Get secret for signing
  const secret = await webhookService.getWebhookSecret(id, apiKey);
  if (!secret) {
    return errors.internal(c, 'Failed to retrieve webhook secret');
  }

  // Create test payload
  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test webhook delivery from 8004.dev',
      webhookId: id,
    },
  };

  const payloadString = JSON.stringify(testPayload);
  const signature = await generateSignature(payloadString, secret);

  // Send test request
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'test',
        'X-Webhook-Id': id,
        'User-Agent': '8004-Webhook/1.0',
      },
      body: payloadString,
    });

    return c.json({
      success: true,
      data: {
        delivered: response.ok,
        responseStatus: response.status,
        responseBody: await response.text().catch(() => null),
      },
      message: response.ok ? 'Test webhook delivered successfully' : 'Test webhook delivery failed',
    });
  } catch (error) {
    return c.json({
      success: true,
      data: {
        delivered: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      message: 'Test webhook delivery failed',
    });
  }
});

export { webhooks };
