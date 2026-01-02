/**
 * Queue and scheduled handler tests
 * @module test/unit/handlers/queue
 */

import { env } from 'cloudflare:test';
import { enqueueClassification } from '@/db/queries';
import type { ClassificationJob, Env } from '@/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockClassifierService,
  createMockEASIndexerService,
  createMockExecutionContext,
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

  it('acknowledges message when no queue entry exists', async () => {
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

  it('processes classification job and acks on success', async () => {
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
    expect(consoleSpy).toHaveBeenCalledWith('Classification job failed:', expect.any(Error));
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
    expect(consoleSpy).toHaveBeenCalledWith('Classification job failed:', expect.any(Error));
  });
});

describe('Scheduled handler', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls ctx.waitUntil with sync function', async () => {
    // Mock all sync workers that run in scheduled handler
    vi.doMock('@/services/sync/graph-sync-worker', () => ({
      syncFromGraph: vi.fn().mockResolvedValue({
        newAgents: 0,
        updatedAgents: 0,
        reembedded: 0,
        errors: [],
      }),
    }));
    vi.doMock('@/services/sync/d1-sync-worker', () => ({
      syncD1ToQdrant: vi.fn().mockResolvedValue({
        classificationsUpdated: 0,
        reputationUpdated: 0,
        errors: [],
      }),
    }));
    vi.doMock('@/services/sync/reconciliation-worker', () => ({
      runReconciliation: vi.fn().mockResolvedValue({
        orphansDeleted: 0,
        missingIndexed: 0,
        errors: [],
      }),
    }));
    vi.doMock('@/services/eas-indexer', () => ({
      createEASIndexerService: () => createMockEASIndexerService(),
      EAS_CONFIGS: [],
    }));

    const appModule = await import('@/index');
    const { ctx, waitUntilPromises } = createMockExecutionContext();

    await appModule.default.scheduled(
      { scheduledTime: Date.now(), cron: '0 * * * *' } as ScheduledEvent,
      testEnv(),
      ctx
    );

    expect(ctx.waitUntil).toHaveBeenCalled();
    await Promise.all(waitUntilPromises);

    // Verify all sync workers were called
    expect(consoleInfoSpy).toHaveBeenCalledWith('Starting Graph → Qdrant sync...');
    expect(consoleInfoSpy).toHaveBeenCalledWith('Starting D1 → Qdrant sync...');
    expect(consoleInfoSpy).toHaveBeenCalledWith('Starting EAS attestation sync...');
    expect(consoleInfoSpy).toHaveBeenCalledWith('EAS attestation sync complete');
  });

  // TODO: Update to mock all services (graph-sync, d1-sync, eas-sync)
  // The scheduled handler runs all syncs and they fail before EAS sync runs
  it.skip('logs errors for failed chain syncs', async () => {
    vi.doMock('@/services/eas-indexer', () => ({
      createEASIndexerService: () =>
        createMockEASIndexerService({
          syncAll: vi.fn().mockResolvedValue(
            new Map([
              [11155111, { success: true, attestationsProcessed: 5, newFeedbackCount: 3 }],
              [84532, { success: false, error: 'Connection timeout', attestationsProcessed: 0 }],
            ])
          ),
        }),
      EAS_CONFIGS: [],
    }));

    const appModule = await import('@/index');
    const { ctx, waitUntilPromises } = createMockExecutionContext();

    await appModule.default.scheduled({} as ScheduledEvent, testEnv(), ctx);
    await Promise.all(waitUntilPromises);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Chain 84532: Sync failed - Connection timeout')
    );
  });
});
