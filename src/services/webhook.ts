/**
 * Webhook service for managing webhook subscriptions and deliveries
 * @module services/webhook
 */

import type { D1Database } from '@cloudflare/workers-types';

/**
 * Supported webhook event types
 */
export const WEBHOOK_EVENTS = [
  'agent.registered',
  'agent.updated',
  'feedback.received',
  'evaluation.completed',
  'reputation.changed',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

/**
 * Webhook configuration
 */
export interface Webhook {
  id: string;
  url: string;
  events: WebhookEventType[];
  filters: WebhookFilters;
  active: boolean;
  owner: string;
  description?: string;
  lastDeliveryAt?: string;
  lastDeliveryStatus?: string;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Webhook filters for event matching
 */
export interface WebhookFilters {
  chainIds?: number[];
  agentIds?: string[];
}

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'delivered' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  createdAt: string;
}

/**
 * Create webhook request
 */
export interface CreateWebhookRequest {
  url: string;
  events: WebhookEventType[];
  filters?: WebhookFilters;
  description?: string;
  owner: string;
}

/**
 * Database row types
 */
interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  events: string;
  filters: string;
  active: number;
  owner: string;
  description: string | null;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

interface WebhookDeliveryRow {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  response_status: number | null;
  response_body: string | null;
  error: string | null;
  created_at: string;
}

/**
 * Generate a secure random secret for webhook HMAC signing
 */
function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate HMAC signature for webhook payload
 */
export async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(payload);

  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);

  const signature = await crypto.subtle.sign('HMAC', key, msgData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert database row to Webhook object
 */
function rowToWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    url: row.url,
    events: JSON.parse(row.events) as WebhookEventType[],
    filters: JSON.parse(row.filters) as WebhookFilters,
    active: row.active === 1,
    owner: row.owner,
    description: row.description ?? undefined,
    lastDeliveryAt: row.last_delivery_at ?? undefined,
    lastDeliveryStatus: row.last_delivery_status ?? undefined,
    failureCount: row.failure_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert database row to WebhookDelivery object
 */
function rowToDelivery(row: WebhookDeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type as WebhookEventType,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: row.status as WebhookDelivery['status'],
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastAttemptAt: row.last_attempt_at ?? undefined,
    nextRetryAt: row.next_retry_at ?? undefined,
    responseStatus: row.response_status ?? undefined,
    responseBody: row.response_body ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Webhook service interface
 */
export interface WebhookService {
  /**
   * Create a new webhook subscription
   */
  createWebhook(request: CreateWebhookRequest): Promise<{ webhook: Webhook; secret: string }>;

  /**
   * Get all webhooks for an owner
   */
  getWebhooks(owner: string): Promise<Webhook[]>;

  /**
   * Get a webhook by ID
   */
  getWebhook(id: string): Promise<Webhook | null>;

  /**
   * Delete a webhook
   */
  deleteWebhook(id: string, owner: string): Promise<boolean>;

  /**
   * Get the secret for a webhook (for test endpoint)
   */
  getWebhookSecret(id: string, owner: string): Promise<string | null>;

  /**
   * Queue a delivery for all matching webhooks
   */
  queueEvent(
    eventType: WebhookEventType,
    payload: Record<string, unknown>,
    chainId?: number,
    agentId?: string
  ): Promise<number>;

  /**
   * Get pending deliveries for processing
   */
  getPendingDeliveries(limit?: number): Promise<WebhookDelivery[]>;

  /**
   * Mark a delivery as delivered
   */
  markDelivered(deliveryId: string, responseStatus: number): Promise<void>;

  /**
   * Mark a delivery as failed
   */
  markFailed(deliveryId: string, error: string, responseStatus?: number): Promise<void>;

  /**
   * Get recent deliveries for a webhook
   */
  getDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]>;
}

/**
 * Create webhook service
 */
export function createWebhookService(db: D1Database): WebhookService {
  return {
    async createWebhook(request: CreateWebhookRequest): Promise<{ webhook: Webhook; secret: string }> {
      const id = crypto.randomUUID().replace(/-/g, '');
      const secret = generateSecret();
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO webhooks (id, url, secret, events, filters, owner, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          request.url,
          secret,
          JSON.stringify(request.events),
          JSON.stringify(request.filters ?? {}),
          request.owner,
          request.description ?? null,
          now,
          now
        )
        .run();

      const webhook: Webhook = {
        id,
        url: request.url,
        events: request.events,
        filters: request.filters ?? {},
        active: true,
        owner: request.owner,
        description: request.description,
        failureCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      return { webhook, secret };
    },

    async getWebhooks(owner: string): Promise<Webhook[]> {
      const result = await db
        .prepare('SELECT * FROM webhooks WHERE owner = ? ORDER BY created_at DESC')
        .bind(owner)
        .all<WebhookRow>();

      return result.results.map(rowToWebhook);
    },

    async getWebhook(id: string): Promise<Webhook | null> {
      const row = await db.prepare('SELECT * FROM webhooks WHERE id = ?').bind(id).first<WebhookRow>();

      if (!row) return null;
      return rowToWebhook(row);
    },

    async deleteWebhook(id: string, owner: string): Promise<boolean> {
      const result = await db
        .prepare('DELETE FROM webhooks WHERE id = ? AND owner = ?')
        .bind(id, owner)
        .run();

      return (result.meta?.changes ?? 0) > 0;
    },

    async getWebhookSecret(id: string, owner: string): Promise<string | null> {
      const row = await db
        .prepare('SELECT secret FROM webhooks WHERE id = ? AND owner = ?')
        .bind(id, owner)
        .first<{ secret: string }>();

      return row?.secret ?? null;
    },

    async queueEvent(
      eventType: WebhookEventType,
      payload: Record<string, unknown>,
      chainId?: number,
      agentId?: string
    ): Promise<number> {
      // Find all active webhooks that should receive this event
      const result = await db
        .prepare('SELECT * FROM webhooks WHERE active = 1')
        .all<WebhookRow>();

      let queued = 0;
      const now = new Date().toISOString();

      for (const row of result.results) {
        const webhook = rowToWebhook(row);

        // Check if webhook is subscribed to this event
        if (!webhook.events.includes(eventType)) continue;

        // Check filters
        if (webhook.filters.chainIds?.length && chainId) {
          if (!webhook.filters.chainIds.includes(chainId)) continue;
        }
        if (webhook.filters.agentIds?.length && agentId) {
          if (!webhook.filters.agentIds.includes(agentId)) continue;
        }

        // Queue delivery
        const deliveryId = crypto.randomUUID().replace(/-/g, '');
        await db
          .prepare(
            `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, created_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(deliveryId, webhook.id, eventType, JSON.stringify(payload), now)
          .run();

        queued++;
      }

      return queued;
    },

    async getPendingDeliveries(limit = 100): Promise<WebhookDelivery[]> {
      const now = new Date().toISOString();
      const result = await db
        .prepare(
          `SELECT * FROM webhook_deliveries
           WHERE status IN ('pending', 'processing')
           AND (next_retry_at IS NULL OR next_retry_at <= ?)
           AND attempts < max_attempts
           ORDER BY created_at ASC
           LIMIT ?`
        )
        .bind(now, limit)
        .all<WebhookDeliveryRow>();

      return result.results.map(rowToDelivery);
    },

    async markDelivered(deliveryId: string, responseStatus: number): Promise<void> {
      const now = new Date().toISOString();

      // Update delivery status
      await db
        .prepare(
          `UPDATE webhook_deliveries
           SET status = 'delivered', last_attempt_at = ?, response_status = ?, attempts = attempts + 1
           WHERE id = ?`
        )
        .bind(now, responseStatus, deliveryId)
        .run();

      // Update webhook last delivery info
      const delivery = await db
        .prepare('SELECT webhook_id FROM webhook_deliveries WHERE id = ?')
        .bind(deliveryId)
        .first<{ webhook_id: string }>();

      if (delivery) {
        await db
          .prepare(
            `UPDATE webhooks
             SET last_delivery_at = ?, last_delivery_status = 'delivered', failure_count = 0, updated_at = ?
             WHERE id = ?`
          )
          .bind(now, now, delivery.webhook_id)
          .run();
      }
    },

    async markFailed(deliveryId: string, error: string, responseStatus?: number): Promise<void> {
      const now = new Date().toISOString();

      // Get current delivery to check attempts
      const delivery = await db
        .prepare('SELECT webhook_id, attempts, max_attempts FROM webhook_deliveries WHERE id = ?')
        .bind(deliveryId)
        .first<{ webhook_id: string; attempts: number; max_attempts: number }>();

      if (!delivery) return;

      const newAttempts = delivery.attempts + 1;
      const isFinalFailure = newAttempts >= delivery.max_attempts;

      // Calculate next retry with exponential backoff (1min, 5min, 15min)
      const retryDelays = [60, 300, 900]; // seconds
      const nextRetryAt = isFinalFailure
        ? null
        : new Date(Date.now() + (retryDelays[newAttempts - 1] ?? 900) * 1000).toISOString();

      // Update delivery
      await db
        .prepare(
          `UPDATE webhook_deliveries
           SET status = ?, last_attempt_at = ?, next_retry_at = ?, response_status = ?, error = ?, attempts = ?
           WHERE id = ?`
        )
        .bind(
          isFinalFailure ? 'failed' : 'pending',
          now,
          nextRetryAt,
          responseStatus ?? null,
          error,
          newAttempts,
          deliveryId
        )
        .run();

      // Update webhook last delivery info
      await db
        .prepare(
          `UPDATE webhooks
           SET last_delivery_at = ?, last_delivery_status = 'failed', failure_count = failure_count + 1, updated_at = ?
           WHERE id = ?`
        )
        .bind(now, now, delivery.webhook_id)
        .run();
    },

    async getDeliveries(webhookId: string, limit = 20): Promise<WebhookDelivery[]> {
      const result = await db
        .prepare(
          `SELECT * FROM webhook_deliveries
           WHERE webhook_id = ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .bind(webhookId, limit)
        .all<WebhookDeliveryRow>();

      return result.results.map(rowToDelivery);
    },
  };
}
