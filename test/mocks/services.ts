/**
 * Mock service factories for testing
 * @module test/mocks/services
 */

import { vi } from 'vitest';
import { createMockAgent, createMockClassification } from '../setup';

/**
 * Mock SDK service with configurable behavior
 */
export function createMockSDKService(overrides: Partial<MockSDKService> = {}): MockSDKService {
  return {
    getAgent: vi.fn().mockResolvedValue(createMockAgent()),
    getAgents: vi.fn().mockResolvedValue({ items: [createMockAgent()], nextCursor: undefined }),
    getChainStats: vi.fn().mockResolvedValue([
      { chainId: 11155111, name: 'Ethereum Sepolia', agentCount: 10, activeCount: 8, status: 'ok' },
      { chainId: 84532, name: 'Base Sepolia', agentCount: 5, activeCount: 3, status: 'ok' },
      { chainId: 80002, name: 'Polygon Amoy', agentCount: 3, activeCount: 2, status: 'ok' },
    ]),
    ...overrides,
  };
}

export interface MockSDKService {
  getAgent: ReturnType<typeof vi.fn>;
  getAgents: ReturnType<typeof vi.fn>;
  getChainStats: ReturnType<typeof vi.fn>;
}

/**
 * Mock Classifier service with configurable behavior
 */
export function createMockClassifierService(
  overrides: Partial<MockClassifierService> = {}
): MockClassifierService {
  return {
    classify: vi.fn().mockResolvedValue(createMockClassification()),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

export interface MockClassifierService {
  classify: ReturnType<typeof vi.fn>;
  healthCheck: ReturnType<typeof vi.fn>;
}

/**
 * Mock EAS Indexer service with configurable behavior
 */
export function createMockEASIndexerService(
  overrides: Partial<MockEASIndexerService> = {}
): MockEASIndexerService {
  return {
    syncAll: vi.fn().mockResolvedValue(
      new Map([
        [11155111, { success: true, attestationsProcessed: 5, newFeedbackCount: 3 }],
        [84532, { success: true, attestationsProcessed: 0, newFeedbackCount: 0 }],
        [80002, { success: true, attestationsProcessed: 2, newFeedbackCount: 1 }],
      ])
    ),
    syncChain: vi.fn().mockResolvedValue({ success: true, attestationsProcessed: 0 }),
    ...overrides,
  };
}

export interface MockEASIndexerService {
  syncAll: ReturnType<typeof vi.fn>;
  syncChain: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock queue message for testing
 */
export function createMockQueueMessage<T>(body: T, overrides: Partial<MockQueueMessage<T>> = {}) {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

export interface MockQueueMessage<T> {
  body: T;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock execution context for testing
 */
export function createMockExecutionContext() {
  const waitUntilPromises: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil: vi.fn((promise: Promise<unknown>) => {
        waitUntilPromises.push(promise);
      }),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext,
    waitUntilPromises,
  };
}
