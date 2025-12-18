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
  assertHasSkill,
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

    it('mcp=true filter returns filtered total (not global total)', async () => {
      // Get unfiltered total first
      const { json: unfilteredJson } = await get('/agents', { limit: 5 });
      assertSuccess(unfilteredJson);
      const unfilteredTotal = unfilteredJson.meta?.total ?? 0;

      // Get filtered total with mcp=true
      const { json: filteredJson } = await get('/agents', { mcp: true, limit: 5 });
      assertSuccess(filteredJson);
      const filteredTotal = filteredJson.meta?.total ?? 0;

      // Filtered total should be significantly less than unfiltered total
      // (MCP agents are a small subset of all agents)
      if (filteredTotal >= unfilteredTotal && unfilteredTotal > 0) {
        throw new Error(
          `Filtered total (${filteredTotal}) should be < unfiltered total (${unfilteredTotal})`
        );
      }

      // Verify all returned agents have mcp=true
      if (filteredJson.data?.length > 0) {
        assertBooleanFlag(filteredJson.data!, 'hasMcp', true);
      }
    });

    it('limit parameter is respected', async () => {
      const { json } = await get('/agents', { limit: 3 });
      assertSuccess(json);
      expect(json.data?.length).toBeLessThan(4);
    });

    it('active=false returns ONLY inactive agents', async () => {
      const { json } = await get('/agents', { active: false, limit: 10 });
      assertSuccess(json);
      // Should return ONLY agents with active=false
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', false);
      }
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

  // ========== hasRegistrationFile Combinations ==========
  describe('hasRegistrationFile Combinations', () => {
    it('hasRegistrationFile=true + mcp=true returns MCP agents with metadata', async () => {
      const { json } = await get('/agents', {
        hasRegistrationFile: true,
        mcp: true,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        // All agents should have name (from registration file)
        const hasMetadata = json.data?.every((a) => a.name !== undefined && a.name !== null);
        expect(hasMetadata).toBe(true);
      }
    });

    it('hasRegistrationFile=true + skills filter returns skilled agents with metadata', async () => {
      const { json } = await get('/agents', {
        hasRegistrationFile: true,
        skills: 'tool_interaction',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, 'tool_interaction');
        const hasMetadata = json.data?.every((a) => a.name !== undefined && a.name !== null);
        expect(hasMetadata).toBe(true);
      }
    });

    it('hasRegistrationFile=true + chainId filter works', async () => {
      const { json } = await get('/agents', {
        hasRegistrationFile: true,
        chainId: 11155111,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainId(json.data!, 11155111);
        const hasMetadata = json.data?.every((a) => a.name !== undefined && a.name !== null);
        expect(hasMetadata).toBe(true);
      }
    });

    it('hasRegistrationFile=true + active=true returns active agents with metadata', async () => {
      const { json } = await get('/agents', {
        hasRegistrationFile: true,
        active: true,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        const hasMetadata = json.data?.every((a) => a.name !== undefined && a.name !== null);
        expect(hasMetadata).toBe(true);
      }
    });
  });
}
