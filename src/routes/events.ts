/**
 * Real-time Events (SSE) Route
 * @module routes/events
 *
 * Provides Server-Sent Events (SSE) endpoint for real-time updates:
 * - /api/v1/events - Main SSE stream endpoint
 */

import { Hono } from 'hono';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { createSSEResponse, parseSSEFilters, type SSESubscriptionConfig } from '@/services/sse';
import type { Env, Variables } from '@/types';

const events = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting (more lenient for SSE)
events.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * GET /api/v1/events
 * Subscribe to real-time events via Server-Sent Events (SSE)
 *
 * Query parameters:
 * - agentIds: Comma-separated list of agent IDs to filter by
 * - chainIds: Comma-separated list of chain IDs to filter by
 * - eventTypes: Comma-separated list of event types to filter by
 * - reputation: Filter reputation change events (true/false)
 * - reachability: Filter reachability update events (true/false)
 * - attestations: Filter attestation events (true/false)
 * - registrations: Filter agent registration events (true/false)
 * - classifications: Filter classification events (true/false)
 *
 * Example:
 * GET /api/v1/events?chainIds=11155111&reputation=true&reachability=true
 *
 * Event types:
 * - connected: Initial connection confirmation
 * - heartbeat: Periodic heartbeat (every 30s)
 * - reputation_change: Agent reputation score changed
 * - reachability_update: Agent reachability status changed
 * - new_attestation: New EAS attestation received
 * - agent_registered: New agent registered
 * - agent_updated: Agent data updated
 * - classification_complete: Agent OASF classification completed
 */
events.get('/', async (c) => {
  // Parse filter parameters
  const queryParams = c.req.query();
  const filters = parseSSEFilters(queryParams);

  // Get heartbeat interval from query (default 30s)
  const heartbeatParam = queryParams.heartbeat;
  const heartbeatInterval = heartbeatParam
    ? Math.max(5, Math.min(60, Number.parseInt(heartbeatParam, 10)))
    : 30;

  // Create SSE subscription config
  const config: SSESubscriptionConfig = {
    filters,
    heartbeatInterval,
    maxDuration: 3600, // 1 hour max
  };

  // Create SSE response
  const { response, writer } = createSSEResponse(config, c.env);

  // Store writer in execution context for cleanup
  c.executionCtx.waitUntil(
    (async () => {
      // Wait for connection to close or timeout
      const maxDuration = (config.maxDuration ?? 3600) * 1000;
      await new Promise((resolve) => setTimeout(resolve, maxDuration));

      // Close the writer after max duration
      await writer.close();
    })()
  );

  return response;
});

/**
 * GET /api/v1/events/info
 * Get information about available SSE event types and filters
 */
events.get('/info', async (c) => {
  return c.json({
    success: true,
    data: {
      description: 'Real-time events via Server-Sent Events (SSE)',
      endpoint: '/api/v1/events',
      eventTypes: [
        {
          type: 'connected',
          description: 'Initial connection confirmation with subscription details',
        },
        {
          type: 'heartbeat',
          description: 'Periodic heartbeat to keep connection alive',
        },
        {
          type: 'reputation_change',
          description: 'Agent reputation score changed due to feedback',
        },
        {
          type: 'reachability_update',
          description: 'Agent MCP/A2A endpoint reachability changed',
        },
        {
          type: 'new_attestation',
          description: 'New EAS attestation received for an agent',
        },
        {
          type: 'agent_registered',
          description: 'New agent registered on the blockchain',
        },
        {
          type: 'agent_updated',
          description: 'Agent data updated on the blockchain',
        },
        {
          type: 'classification_complete',
          description: 'Agent OASF classification completed by LLM',
        },
      ],
      filters: {
        agentIds: 'Comma-separated list of agent IDs (e.g., "11155111:1,11155111:2")',
        chainIds: 'Comma-separated list of chain IDs (e.g., "11155111,84532")',
        eventTypes: 'Comma-separated list of event types to subscribe to',
        reputation: 'Enable/disable reputation events (true/false)',
        reachability: 'Enable/disable reachability events (true/false)',
        attestations: 'Enable/disable attestation events (true/false)',
        registrations: 'Enable/disable registration events (true/false)',
        classifications: 'Enable/disable classification events (true/false)',
        heartbeat: 'Heartbeat interval in seconds (5-60, default: 30)',
      },
      example: {
        url: '/api/v1/events?chainIds=11155111&reputation=true&reachability=true',
        description: 'Subscribe to reputation and reachability events on Sepolia chain',
      },
      notes: [
        'Connections automatically close after 1 hour (max duration)',
        'Heartbeat events are sent every 30 seconds by default',
        'All event data is JSON-formatted in the SSE data field',
        'Use EventSource API in browsers or SSE client libraries',
      ],
    },
  });
});

export { events };
