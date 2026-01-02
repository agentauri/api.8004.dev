/**
 * Server-Sent Events (SSE) Service
 * @module services/sse
 *
 * Provides real-time event streaming for:
 * - Agent reputation changes
 * - Reachability status updates
 * - New attestations
 * - Agent registration events
 */

import type { Env } from '../types';

/**
 * SSE event types
 */
export type SSEEventType =
  | 'connected'
  | 'heartbeat'
  | 'reputation_change'
  | 'reachability_update'
  | 'new_attestation'
  | 'agent_registered'
  | 'agent_updated'
  | 'classification_complete';

/**
 * SSE event data structures
 */
export interface SSEConnectedEvent {
  type: 'connected';
  subscriptionId: string;
  timestamp: string;
  filters: SSESubscriptionFilters;
}

export interface SSEHeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
  sequence: number;
}

export interface SSEReputationChangeEvent {
  type: 'reputation_change';
  agentId: string;
  chainId: number;
  previousScore: number;
  newScore: number;
  feedbackCount: number;
  timestamp: string;
}

export interface SSEReachabilityUpdateEvent {
  type: 'reachability_update';
  agentId: string;
  chainId: number;
  mcpReachable: boolean;
  a2aReachable: boolean;
  timestamp: string;
}

export interface SSENewAttestationEvent {
  type: 'new_attestation';
  agentId: string;
  chainId: number;
  attestationUid: string;
  attester: string;
  score: number;
  tags: string[];
  timestamp: string;
}

export interface SSEAgentRegisteredEvent {
  type: 'agent_registered';
  agentId: string;
  chainId: number;
  name: string;
  owner: string;
  hasMcp: boolean;
  hasA2a: boolean;
  timestamp: string;
}

export interface SSEAgentUpdatedEvent {
  type: 'agent_updated';
  agentId: string;
  chainId: number;
  changes: string[];
  timestamp: string;
}

export interface SSEClassificationCompleteEvent {
  type: 'classification_complete';
  agentId: string;
  chainId: number;
  skills: string[];
  domains: string[];
  confidence: number;
  timestamp: string;
}

export type SSEEvent =
  | SSEConnectedEvent
  | SSEHeartbeatEvent
  | SSEReputationChangeEvent
  | SSEReachabilityUpdateEvent
  | SSENewAttestationEvent
  | SSEAgentRegisteredEvent
  | SSEAgentUpdatedEvent
  | SSEClassificationCompleteEvent;

/**
 * SSE subscription filters
 */
export interface SSESubscriptionFilters {
  /** Filter by specific agent IDs */
  agentIds?: string[];
  /** Filter by chain IDs */
  chainIds?: number[];
  /** Filter by event types */
  eventTypes?: SSEEventType[];
  /** Include reputation events */
  reputationEvents?: boolean;
  /** Include reachability events */
  reachabilityEvents?: boolean;
  /** Include attestation events */
  attestationEvents?: boolean;
  /** Include registration events */
  registrationEvents?: boolean;
  /** Include classification events */
  classificationEvents?: boolean;
}

/**
 * SSE subscription configuration
 */
export interface SSESubscriptionConfig {
  filters: SSESubscriptionFilters;
  /** Heartbeat interval in seconds (default: 30) */
  heartbeatInterval?: number;
  /** Maximum connection duration in seconds (default: 3600 = 1 hour) */
  maxDuration?: number;
}

/**
 * SSE message formatter
 */
export function formatSSEMessage(event: SSEEvent, id?: string): string {
  const lines: string[] = [];

  if (id) {
    lines.push(`id: ${id}`);
  }

  lines.push(`event: ${event.type}`);
  lines.push(`data: ${JSON.stringify(event)}`);
  lines.push(''); // Empty line to end message

  return `${lines.join('\n')}\n`;
}

/**
 * Generate unique subscription ID
 */
export function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * SSE Stream Writer
 * Manages writing events to an SSE stream
 */
export class SSEStreamWriter {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly encoder: TextEncoder;
  private sequence: number;
  private closed: boolean;

  constructor(writable: WritableStream<Uint8Array>) {
    this.writer = writable.getWriter();
    this.encoder = new TextEncoder();
    this.sequence = 0;
    this.closed = false;
  }

  /**
   * Send an event to the stream
   */
  async send(event: SSEEvent): Promise<void> {
    if (this.closed) return;

    try {
      const id = (++this.sequence).toString();
      const message = formatSSEMessage(event, id);
      await this.writer.write(this.encoder.encode(message));
    } catch (error) {
      console.error('SSE write error:', error);
      this.closed = true;
    }
  }

  /**
   * Send a heartbeat event
   */
  async sendHeartbeat(): Promise<void> {
    await this.send({
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
      sequence: this.sequence,
    });
  }

  /**
   * Close the stream
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    try {
      await this.writer.close();
    } catch {
      // Already closed
    }
  }

  /**
   * Check if stream is closed
   */
  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Create an SSE response
 */
export function createSSEResponse(
  config: SSESubscriptionConfig,
  env: Env
): { response: Response; writer: SSEStreamWriter } {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

  const writer = new SSEStreamWriter(writable);
  const subscriptionId = generateSubscriptionId();
  const heartbeatInterval = (config.heartbeatInterval ?? 30) * 1000;

  // Send initial connected event
  const connectedEvent: SSEConnectedEvent = {
    type: 'connected',
    subscriptionId,
    timestamp: new Date().toISOString(),
    filters: config.filters,
  };

  // Start heartbeat loop
  const heartbeatLoop = async (): Promise<void> => {
    // Wait a tick before starting heartbeat
    await new Promise((resolve) => setTimeout(resolve, 100));

    while (!writer.isClosed()) {
      await new Promise((resolve) => setTimeout(resolve, heartbeatInterval));
      if (!writer.isClosed()) {
        await writer.sendHeartbeat();
      }
    }
  };

  // Send connected event and start heartbeat
  writer.send(connectedEvent).then(() => {
    heartbeatLoop().catch((err) => {
      console.error('Heartbeat loop error:', err);
    });
  });

  const response = new Response(readable as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    },
  });

  return { response, writer };
}

/**
 * Parse SSE subscription query parameters
 */
export function parseSSEFilters(params: Record<string, string | undefined>): SSESubscriptionFilters {
  const filters: SSESubscriptionFilters = {};

  if (params.agentIds) {
    filters.agentIds = params.agentIds.split(',').map((s) => s.trim());
  }

  if (params.chainIds) {
    filters.chainIds = params.chainIds
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
  }

  if (params.eventTypes) {
    filters.eventTypes = params.eventTypes.split(',').map((s) => s.trim()) as SSEEventType[];
  }

  if (params.reputation !== undefined) {
    filters.reputationEvents = params.reputation === 'true';
  }

  if (params.reachability !== undefined) {
    filters.reachabilityEvents = params.reachability === 'true';
  }

  if (params.attestations !== undefined) {
    filters.attestationEvents = params.attestations === 'true';
  }

  if (params.registrations !== undefined) {
    filters.registrationEvents = params.registrations === 'true';
  }

  if (params.classifications !== undefined) {
    filters.classificationEvents = params.classifications === 'true';
  }

  return filters;
}

/**
 * Check if an event matches the subscription filters
 */
export function eventMatchesFilters(event: SSEEvent, filters: SSESubscriptionFilters): boolean {
  // Always allow connected and heartbeat events
  if (event.type === 'connected' || event.type === 'heartbeat') {
    return true;
  }

  // Check event type filter
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    if (!filters.eventTypes.includes(event.type)) {
      return false;
    }
  }

  // Check event category filters
  if (event.type === 'reputation_change' && filters.reputationEvents === false) {
    return false;
  }
  if (event.type === 'reachability_update' && filters.reachabilityEvents === false) {
    return false;
  }
  if (event.type === 'new_attestation' && filters.attestationEvents === false) {
    return false;
  }
  if (
    (event.type === 'agent_registered' || event.type === 'agent_updated') &&
    filters.registrationEvents === false
  ) {
    return false;
  }
  if (event.type === 'classification_complete' && filters.classificationEvents === false) {
    return false;
  }

  // Check agent ID filter for events that have agentId
  if ('agentId' in event && filters.agentIds && filters.agentIds.length > 0) {
    if (!filters.agentIds.includes(event.agentId)) {
      return false;
    }
  }

  // Check chain ID filter for events that have chainId
  if ('chainId' in event && filters.chainIds && filters.chainIds.length > 0) {
    if (!filters.chainIds.includes(event.chainId)) {
      return false;
    }
  }

  return true;
}
