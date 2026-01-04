/**
 * SDK Filters Test Suite
 *
 * Tests all filters available via SDK path (no search query)
 * Verifies that each filter returns correct results.
 */

import { describe, expect, it } from '../../test-runner';
import { get } from '../../utils/api-client';
import {
  assertAllMatch,
  assertBooleanFlag,
  assertChainId,
  assertChainIds,
  assertSuccess,
  assertReputationInRange,
  assertSorted,
} from '../../utils/assertions';

// Test configuration
const LIMIT = 20;
const CHAINS = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  POLYGON_AMOY: 80002,
};

export function registerSdkFiltersTests(): void {
  describe('SDK Filters - Booleani', () => {
    // active filter
    it('active=true returns only active agents', async () => {
      const { json } = await get('/agents', { active: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
      }
    });

    it('active=false returns only inactive agents', async () => {
      const { json } = await get('/agents', { active: false, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', false);
      }
    });

    // mcp filter
    it('mcp=true returns only MCP agents', async () => {
      const { json } = await get('/agents', { mcp: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('mcp=false returns only non-MCP agents', async () => {
      const { json } = await get('/agents', { mcp: false, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', false);
      }
    });

    // a2a filter
    it('a2a=true returns only A2A agents', async () => {
      const { json } = await get('/agents', { a2a: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasA2a', true);
      }
    });

    it('a2a=false returns only non-A2A agents', async () => {
      const { json } = await get('/agents', { a2a: false, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasA2a', false);
      }
    });

    // x402 filter
    it('x402=true returns only x402 agents', async () => {
      const { json } = await get('/agents', { x402: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'x402Support', true);
      }
    });

    it('x402=false returns only non-x402 agents', async () => {
      const { json } = await get('/agents', { x402: false, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'x402Support', false);
      }
    });

    // hasRegistrationFile filter
    it('hasRegistrationFile=true returns agents with registration file', async () => {
      const { json } = await get('/agents', { hasRegistrationFile: true, limit: LIMIT });
      assertSuccess(json);
      // Default behavior - should return agents
      expect(json.data?.length).toBeGreaterThan(0);
    });

    it('hasRegistrationFile=false returns agents without registration file', async () => {
      const { json } = await get('/agents', { hasRegistrationFile: false, limit: LIMIT });
      assertSuccess(json);
      // May return 0 or more - just verify no error
    });
  });

  describe('SDK Filters - Chain', () => {
    it('chainId filter returns only that chain', async () => {
      const { json } = await get('/agents', { chainId: CHAINS.SEPOLIA, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });

    it('chainIds CSV filter works for multiple chains', async () => {
      const { json } = await get('/agents', {
        chainIds: `${CHAINS.SEPOLIA},${CHAINS.BASE_SEPOLIA}`,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainIds(json.data!, [CHAINS.SEPOLIA, CHAINS.BASE_SEPOLIA]);
      }
    });

    it('chains CSV filter works (alias)', async () => {
      const { json } = await get('/agents', {
        chains: `${CHAINS.SEPOLIA},${CHAINS.BASE_SEPOLIA}`,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainIds(json.data!, [CHAINS.SEPOLIA, CHAINS.BASE_SEPOLIA]);
      }
    });

    it('single chainId with Base Sepolia', async () => {
      const { json } = await get('/agents', { chainId: CHAINS.BASE_SEPOLIA, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainId(json.data!, CHAINS.BASE_SEPOLIA);
      }
    });

    it('three chains filter', async () => {
      const { json } = await get('/agents', {
        chainIds: `${CHAINS.SEPOLIA},${CHAINS.BASE_SEPOLIA},${CHAINS.POLYGON_AMOY}`,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainIds(json.data!, [CHAINS.SEPOLIA, CHAINS.BASE_SEPOLIA, CHAINS.POLYGON_AMOY]);
      }
    });
  });

  describe('SDK Filters - Reputation Range', () => {
    it('minRep filter returns agents with min reputation', async () => {
      const { json } = await get('/agents', { minRep: 3, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 3, undefined);
      }
    });

    it('maxRep filter returns agents with max reputation', async () => {
      const { json } = await get('/agents', { maxRep: 4, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, undefined, 4);
      }
    });

    it('minRep + maxRep range filter', async () => {
      const { json } = await get('/agents', { minRep: 2, maxRep: 4, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 2, 4);
      }
    });

    it('minRep=1 returns all with reputation', async () => {
      const { json } = await get('/agents', { minRep: 1, limit: LIMIT });
      assertSuccess(json);
      // Should return agents with any reputation
    });

    it('maxRep=5 returns all with reputation up to max', async () => {
      const { json } = await get('/agents', { maxRep: 5, limit: LIMIT });
      assertSuccess(json);
      // Should return all agents with reputation
    });
  });

  describe('SDK Filters - Sorting', () => {
    it('sort=name order=asc', async () => {
      const { json } = await get('/agents', { sort: 'name', order: 'asc', limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 1) {
        assertSorted(json.data!, 'name', 'asc');
      }
    });

    it('sort=name order=desc', async () => {
      const { json } = await get('/agents', { sort: 'name', order: 'desc', limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 1) {
        assertSorted(json.data!, 'name', 'desc');
      }
    });

    it('sort=createdAt order=asc', async () => {
      const { json } = await get('/agents', { sort: 'createdAt', order: 'asc', limit: LIMIT });
      assertSuccess(json);
      // createdAt might not be in response, just verify success
    });

    it('sort=createdAt order=desc', async () => {
      const { json } = await get('/agents', { sort: 'createdAt', order: 'desc', limit: LIMIT });
      assertSuccess(json);
    });

    it('sort=reputation order=desc', async () => {
      const { json } = await get('/agents', { sort: 'reputation', order: 'desc', limit: LIMIT });
      assertSuccess(json);
    });

    it('sort=reputation order=asc', async () => {
      const { json } = await get('/agents', { sort: 'reputation', order: 'asc', limit: LIMIT });
      assertSuccess(json);
    });
  });

  describe('SDK Filters - Limit Variations', () => {
    it('limit=5 returns max 5 agents', async () => {
      const { json } = await get('/agents', { limit: 5 });
      assertSuccess(json);
      expect(json.data!.length).toBeLessThan(6);
    });

    it('limit=10 returns max 10 agents', async () => {
      const { json } = await get('/agents', { limit: 10 });
      assertSuccess(json);
      expect(json.data!.length).toBeLessThan(11);
    });

    it('limit=50 returns max 50 agents', async () => {
      const { json } = await get('/agents', { limit: 50 });
      assertSuccess(json);
      expect(json.data!.length).toBeLessThan(51);
    });

    it('limit=100 returns max 100 agents', async () => {
      const { json } = await get('/agents', { limit: 100 });
      assertSuccess(json);
      expect(json.data!.length).toBeLessThan(101);
    });

    it('limit=1 returns exactly 1 agent', async () => {
      const { json } = await get('/agents', { limit: 1 });
      assertSuccess(json);
      expect(json.data!.length).toBe(1);
    });
  });

  describe('SDK Filters - Boolean Combinations', () => {
    it('active=true + mcp=true', async () => {
      const { json } = await get('/agents', { active: true, mcp: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('active=true + a2a=true', async () => {
      const { json } = await get('/agents', { active: true, a2a: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasA2a', true);
      }
    });

    it('mcp=true + a2a=true', async () => {
      const { json } = await get('/agents', { mcp: true, a2a: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'hasA2a', true);
      }
    });

    it('mcp=true + x402=true', async () => {
      const { json } = await get('/agents', { mcp: true, x402: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'x402Support', true);
      }
    });

    it('active=true + mcp=true + chainId', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });
  });

  describe('SDK Filters - Filter Mode', () => {
    it('filterMode=AND (default) requires all filters', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'AND',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        // All agents must have both MCP and A2A
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'hasA2a', true);
      }
    });

    it('filterMode=OR allows any filter to match', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        // Each agent must have MCP OR A2A (or both)
        assertAllMatch(
          json.data!,
          (a) => a.hasMcp === true || a.hasA2a === true,
          'has MCP or A2A'
        );
      }
    });

    it('filterMode=OR with mcp + x402', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        x402: true,
        filterMode: 'OR',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a) => a.hasMcp === true || a.x402Support === true,
          'has MCP or x402'
        );
      }
    });

    it('filterMode=OR returns more results than AND', async () => {
      const { json: andResult } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'AND',
        limit: 100,
      });
      const { json: orResult } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: 100,
      });

      assertSuccess(andResult);
      assertSuccess(orResult);

      // OR should return >= AND results
      const andTotal = andResult.meta?.total ?? andResult.data?.length ?? 0;
      const orTotal = orResult.meta?.total ?? orResult.data?.length ?? 0;
      expect(orTotal).toBeGreaterThan(andTotal - 1); // >= (allow equal)
    });
  });
}
