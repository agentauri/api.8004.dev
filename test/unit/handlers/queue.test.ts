/**
 * Queue and scheduled handler tests
 * @module test/unit/handlers/queue
 */

import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueClassification } from '@/db/queries';
import type { ClassificationJob, Env } from '@/types';
import {
  createMockClassifierService,
  createMockQueueMessage,
  createMockSDKService,
} from '../../mocks/services';
import { createMockAgent, createMockEnv } from '../../setup';

// Helper to create test environment with D1
const testEnv = (): Env => ({ ...createMockEnv(), DB: env.DB });

describe('App exports', () => {
  it('exports fetch, queue, and scheduled handlers', async () => {
    const appModule = await import('@/index');
    expect(typeof appModule.default.fetch).toBe('function');
    expect(typeof appModule.default.queue).toBe('function');
    expect(typeof appModule.default.scheduled).toBe('function');
  });
});

describe('Queue handler', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acknowledges message when no queue entry exists', { timeout: 15000 }, async () => {
    vi.doMock('@/services/sdk', () => ({
      createSDKService: () => createMockSDKService(),
      SUPPORTED_CHAINS: [],
      getChainConfig: vi.fn(),
    }));

    const appModule = await import('@/index');
    const msg = createMockQueueMessage<ClassificationJob>({
      agentId: '11155111:999',
      force: false,
    });

    await appModule.default.queue(
      { messages: [msg] } as unknown as MessageBatch<ClassificationJob>,
      testEnv()
    );

    expect(msg.ack).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No queue entry found'));
  });

  it('processes classification job and acks on success', { timeout: 15000 }, async () => {
    await enqueueClassification(env.DB, '11155111:1');

    vi.doMock('@/services/sdk', () => ({
      createSDKService: () =>
        createMockSDKService({
          getAgent: vi
            .fn()
            .mockResolvedValue(createMockAgent({ mcpTools: ['tool1'], a2aSkills: [] })),
        }),
      SUPPORTED_CHAINS: [],
      getChainConfig: vi.fn(),
    }));

    vi.doMock('@/services/classifier', () => ({
      createClassifierService: () => createMockClassifierService(),
    }));

    const appModule = await import('@/index');
    const msg = createMockQueueMessage<ClassificationJob>({ agentId: '11155111:1', force: false });

    await appModule.default.queue(
      { messages: [msg] } as unknown as MessageBatch<ClassificationJob>,
      testEnv()
    );

    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('retries message when agent not found', async () => {
    await enqueueClassification(env.DB, '11155111:404');

    vi.doMock('@/services/sdk', () => ({
      createSDKService: () => createMockSDKService({ getAgent: vi.fn().mockResolvedValue(null) }),
      SUPPORTED_CHAINS: [],
      getChainConfig: vi.fn(),
    }));

    const appModule = await import('@/index');
    const msg = createMockQueueMessage<ClassificationJob>({
      agentId: '11155111:404',
      force: false,
    });

    await appModule.default.queue(
      { messages: [msg] } as unknown as MessageBatch<ClassificationJob>,
      testEnv()
    );

    expect(msg.retry).toHaveBeenCalled();
    expect(msg.ack).not.toHaveBeenCalled();
    // Structured logging outputs JSON - error is logged via globalLogger.logError
  });

  it('retries message when classifier throws error', async () => {
    await enqueueClassification(env.DB, '11155111:500');

    vi.doMock('@/services/sdk', () => ({
      createSDKService: () =>
        createMockSDKService({
          getAgent: vi
            .fn()
            .mockResolvedValue(createMockAgent({ id: '11155111:500', tokenId: '500' })),
        }),
      SUPPORTED_CHAINS: [],
      getChainConfig: vi.fn(),
    }));

    vi.doMock('@/services/classifier', () => ({
      createClassifierService: () =>
        createMockClassifierService({
          classify: vi.fn().mockRejectedValue(new Error('Classification API error')),
        }),
    }));

    const appModule = await import('@/index');
    const msg = createMockQueueMessage<ClassificationJob>({
      agentId: '11155111:500',
      force: false,
    });

    await appModule.default.queue(
      { messages: [msg] } as unknown as MessageBatch<ClassificationJob>,
      testEnv()
    );

    expect(msg.retry).toHaveBeenCalled();
    expect(msg.ack).not.toHaveBeenCalled();
    // Structured logging outputs JSON - error is logged via globalLogger.logError
  });
});

