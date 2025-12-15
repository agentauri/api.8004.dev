/**
 * Basic Filter Tests
 * Tests for individual filter parameters
 */

import { describe, expect, it } from '../test-runner';
import { get } from '../utils/api-client';
import {
  assertAllMatch,
  assertBooleanFlag,
  assertChainId,
  assertSuccess,
} from '../utils/assertions';

export function registerAgentsBasicTests(): void {
  describe('Filtri Base', () => {
    it('chainId filter returns only that chain', async () => {
      const { json } = await get('/agents', { chainId: 11155111, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainId(json.data!, 11155111);
      }
    });

    it('chainIds (CSV) filter works', async () => {
      const { json } = await get('/agents', { chainIds: '11155111,84532', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a) => a.chainId === 11155111 || a.chainId === 84532,
          'chainId is 11155111 or 84532'
        );
      }
    });

    it('active=true returns only active agents', async () => {
      const { json } = await get('/agents', { active: true, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
      }
    });

    it('mcp=true returns only MCP agents', async () => {
      const { json } = await get('/agents', { mcp: true, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('a2a=true returns only A2A agents', async () => {
      const { json } = await get('/agents', { a2a: true, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasA2a', true);
      }
    });

    it('x402=true returns only x402 agents', async () => {
      const { json } = await get('/agents', { x402: true, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'x402Support', true);
      }
    });

    it('chain + capability filter works', async () => {
      const { json } = await get('/agents', { chainId: 11155111, mcp: true, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainId(json.data!, 11155111);
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('limit parameter is respected', async () => {
      const { json } = await get('/agents', { limit: 3 });
      assertSuccess(json);
      expect(json.data?.length).toBeLessThan(4);
    });

    it('active=false returns all agents (no active filter)', async () => {
      // active=false means "no filter" (showAll=true in frontend)
      // This matches vector search behavior where active=false doesn't filter
      const { json } = await get('/agents', { active: false, limit: 10 });
      assertSuccess(json);
      // Should return agents (no filter applied, may include both active and inactive)
      expect(json.data).toBeDefined();
    });

    it('Default returns agents WITH registration file', async () => {
      const { json } = await get('/agents', { limit: 10 });
      assertSuccess(json);
      // Default behavior: all returned agents should have metadata (name is populated)
      if (json.data?.length > 0) {
        // Agents with registration files have name populated
        const hasMetadata = json.data?.every((a) => a.name !== undefined);
        expect(hasMetadata).toBe(true);
      }
    });

    it('hasRegistrationFile=false includes agents without metadata', async () => {
      const { json } = await get('/agents', { hasRegistrationFile: false, limit: 20 });
      assertSuccess(json);
      // When false, should include agents that might not have full metadata
      expect(Array.isArray(json.data)).toBe(true);
    });
  });
}
