/**
 * Boolean Filter Combination Tests
 * Tests for AND/OR filter modes
 */

import { describe, it } from '../test-runner';
import { get } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import { assertAllMatch, assertSuccess } from '../utils/assertions';

export function registerAgentsBooleanTests(): void {
  describe('Boolean AND/OR', () => {
    it('MCP AND A2A (default) requires both', async () => {
      const { json } = await get('/agents', { mcp: true, a2a: true, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true && a.hasA2a === true,
          'hasMcp AND hasA2a'
        );
      }
    });

    it('MCP AND x402 requires both', async () => {
      const { json } = await get('/agents', { mcp: true, x402: true, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true && a.x402Support === true,
          'hasMcp AND x402Support'
        );
      }
    });

    it('All three AND requires all', async () => {
      const { json } = await get('/agents', { mcp: true, a2a: true, x402: true, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true && a.hasA2a === true && a.x402Support === true,
          'hasMcp AND hasA2a AND x402Support'
        );
      }
    });

    it('MCP OR A2A with filterMode=OR', async () => {
      const { json } = await get('/agents', { mcp: true, a2a: true, filterMode: 'OR', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'hasMcp OR hasA2a'
        );
      }
    });

    it('MCP OR x402 with filterMode=OR', async () => {
      const { json } = await get('/agents', { mcp: true, x402: true, filterMode: 'OR', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.x402Support === true,
          'hasMcp OR x402Support'
        );
      }
    });

    it('All three OR requires at least one', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        x402: true,
        filterMode: 'OR',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true || a.x402Support === true,
          'hasMcp OR hasA2a OR x402Support'
        );
      }
    });
  });
}
