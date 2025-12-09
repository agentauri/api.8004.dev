/**
 * Queue and scheduled handler tests
 * @module test/unit/handlers/queue
 *
 * Note: Full integration testing of queue consumer and scheduler
 * is covered in the integration tests. This file verifies exports.
 */

import { describe, expect, it } from 'vitest';

describe('App exports', () => {
  it('exports fetch handler', async () => {
    const appModule = await import('@/index');
    expect(typeof appModule.default.fetch).toBe('function');
  });

  it('exports queue handler', async () => {
    const appModule = await import('@/index');
    expect(typeof appModule.default.queue).toBe('function');
  });

  it('exports scheduled handler', async () => {
    const appModule = await import('@/index');
    expect(typeof appModule.default.scheduled).toBe('function');
  });
});
