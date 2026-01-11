/**
 * Worker Logger
 *
 * Provides structured logging for Cloudflare Workers background jobs.
 * Wraps the base logger with worker-specific context.
 *
 * @example
 * ```typescript
 * const logger = createWorkerLogger('graph-sync');
 * logger.info('Starting sync', { chainId: 11155111 });
 * logger.error('Sync failed', { error: message });
 * ```
 *
 * @module lib/logger/worker-logger
 */

import { Logger } from './logger';

/**
 * Worker names for consistent tagging
 */
export type WorkerName =
  | 'graph-sync'
  | 'graph-feedback'
  | 'reconciliation'
  | 'd1-sync'
  | 'mcp-crawl'
  | 'reembed'
  | 'classification'
  | 'eas-indexer'
  | 'trust-graph';

/**
 * Worker logger instance
 */
export class WorkerLogger extends Logger {
  constructor(workerName: WorkerName) {
    super({ worker: workerName });
  }

  /**
   * Log start of worker execution
   */
  start(message?: string, data?: Record<string, unknown>): void {
    this.info(message ?? 'Worker started', { phase: 'start', ...data });
  }

  /**
   * Log completion of worker execution
   */
  complete(stats: Record<string, unknown>): void {
    this.info('Worker completed', { phase: 'complete', ...stats });
  }

  /**
   * Log a progress update during worker execution
   */
  progress(message: string, stats: Record<string, unknown>): void {
    this.info(message, { phase: 'progress', ...stats });
  }

  /**
   * Log a skip event (no work needed)
   */
  skip(reason: string, data?: Record<string, unknown>): void {
    this.info('Worker skipped', { phase: 'skip', reason, ...data });
  }

  /**
   * Log worker failure
   */
  fail(message: string, error: unknown, data?: Record<string, unknown>): void {
    this.logError(message, error, { phase: 'error', ...data });
  }
}

/**
 * Create a logger for a worker
 * @param workerName - Name of the worker for context
 */
export function createWorkerLogger(workerName: WorkerName): WorkerLogger {
  return new WorkerLogger(workerName);
}
