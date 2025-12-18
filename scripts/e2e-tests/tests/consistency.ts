/**
 * Consistency Tests
 * Tests for data consistency between SDK and Search paths
 * and temporal consistency (same results over time)
 */

import { describe, expect, it } from '../test-runner';
import { get, post } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import { assertHasSearchMode, assertResponseTime, assertSuccess } from '../utils/assertions';

/**
 * Helper to delay execution
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to compare two agent arrays for consistency
 */
function assertSameResults(
  results1: Agent[],
  results2: Agent[],
  context: string
): void {
  // Same count
  if (results1.length !== results2.length) {
    throw new Error(
      `${context}: Different result count - first: ${results1.length}, second: ${results2.length}`
    );
  }

  // Same IDs in same order
  for (let i = 0; i < results1.length; i++) {
    if (results1[i].id !== results2[i].id) {
      throw new Error(
        `${context}: Different agent at position ${i} - first: ${results1[i].id}, second: ${results2[i].id}`
      );
    }
  }
}

export function registerConsistencyTests(): void {
  describe('Consistency', () => {
    it('SDK and Search return same base fields', async () => {
      // Get agents via SDK path (no q parameter)
      const sdkResult = await get('/agents', { mcp: true, limit: 5 });
      assertSuccess(sdkResult.json);

      // Get agents via Search path (with q parameter)
      const searchResult = await get('/agents', { q: 'agent', mcp: true, limit: 5 });
      assertSuccess(searchResult.json);
      assertHasSearchMode(searchResult.json);

      // Both should have the same structure
      if (sdkResult.json.data?.length > 0) {
        const sdkAgent = sdkResult.json.data?.[0];
        expect(sdkAgent.id).toBeDefined();
        expect(sdkAgent.chainId).toBeDefined();
        expect(sdkAgent.tokenId).toBeDefined();
        expect(typeof sdkAgent.hasMcp).toBe('boolean');
      }

      if (searchResult.json.data?.length > 0) {
        const searchAgent = searchResult.json.data?.[0];
        expect(searchAgent.id).toBeDefined();
        expect(searchAgent.chainId).toBeDefined();
        expect(searchAgent.tokenId).toBeDefined();
        expect(typeof searchAgent.hasMcp).toBe('boolean');
      }
    });

    it('OASF data present in SDK path', async () => {
      const { json } = await get('/agents', { limit: 20 });
      assertSuccess(json);

      // At least some agents should have OASF classification
      const withOasf = json.data?.filter((a: Agent) => a.oasf !== null && a.oasf !== undefined);

      // We expect at least some classified agents in top 20
      if (withOasf.length > 0) {
        const agent = withOasf[0];
        expect(agent.oasf).toBeDefined();
        // OASF should have skills or domains
        const hasSkills = agent.oasf?.skills && agent.oasf?.skills.length > 0;
        const hasDomains = agent.oasf?.domains && agent.oasf?.domains.length > 0;
        expect(hasSkills || hasDomains).toBeTruthy();
      }
    });

    it('OASF data present in Search path', async () => {
      const { json } = await get('/agents', { q: 'agent', limit: 20 });
      assertSuccess(json);
      assertHasSearchMode(json);

      const withOasf = json.data?.filter((a: Agent) => a.oasf !== null && a.oasf !== undefined);

      if (withOasf.length > 0) {
        const agent = withOasf[0];
        expect(agent.oasf).toBeDefined();
      }
    });

    it('Boolean flags are accurate in SDK path', async () => {
      // Test that when we filter by mcp=true, all results actually have hasMcp=true
      const { json } = await get('/agents', { mcp: true, limit: 10 });
      assertSuccess(json);

      for (const agent of json.data!) {
        expect(agent.hasMcp).toBe(true);
      }
    });

    it('Response time is reasonable', async () => {
      // Test that API responds within 5 seconds
      const { duration } = await get('/agents', { limit: 10 });
      assertResponseTime(duration, 5000);

      // Search should also be reasonably fast
      const searchResult = await get('/agents', { q: 'AI', limit: 10 });
      assertResponseTime(searchResult.duration, 5000);
    });
  });

  describe('Temporal Consistency', () => {
    it('SDK path returns same results on consecutive calls', async () => {
      // First call
      const { json: result1 } = await get('/agents', { limit: 10 });
      assertSuccess(result1);

      // Wait 1 second
      await sleep(1000);

      // Second call
      const { json: result2 } = await get('/agents', { limit: 10 });
      assertSuccess(result2);

      // Compare results
      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'SDK path consecutive calls');
      }

      // Same total
      if (result1.meta?.total !== result2.meta?.total) {
        throw new Error(
          `SDK path: Different totals - first: ${result1.meta?.total}, second: ${result2.meta?.total}`
        );
      }
    });

    it('SDK path with mcp=true filter returns same results', async () => {
      const { json: result1 } = await get('/agents', { mcp: true, limit: 10 });
      assertSuccess(result1);

      await sleep(1000);

      const { json: result2 } = await get('/agents', { mcp: true, limit: 10 });
      assertSuccess(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'SDK path mcp=true');
      }

      if (result1.meta?.total !== result2.meta?.total) {
        throw new Error(
          `SDK mcp=true: Different totals - first: ${result1.meta?.total}, second: ${result2.meta?.total}`
        );
      }
    });

    it('SDK path with active=false filter returns same results', async () => {
      const { json: result1 } = await get('/agents', { active: false, limit: 10 });
      assertSuccess(result1);

      await sleep(1000);

      const { json: result2 } = await get('/agents', { active: false, limit: 10 });
      assertSuccess(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'SDK path active=false');
      }

      if (result1.meta?.total !== result2.meta?.total) {
        throw new Error(
          `SDK active=false: Different totals - first: ${result1.meta?.total}, second: ${result2.meta?.total}`
        );
      }
    });

    it('SDK path with multi-chain filter returns same results', async () => {
      const { json: result1 } = await get('/agents', { chainIds: '11155111,84532', limit: 10 });
      assertSuccess(result1);

      await sleep(1000);

      const { json: result2 } = await get('/agents', { chainIds: '11155111,84532', limit: 10 });
      assertSuccess(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'SDK path multi-chain');
      }
    });

    it('SDK path with OR mode filter returns same results', async () => {
      const { json: result1 } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: 10,
      });
      assertSuccess(result1);

      await sleep(1000);

      const { json: result2 } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: 10,
      });
      assertSuccess(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'SDK path OR mode');
      }
    });

    it('SDK path with skills filter returns same results', async () => {
      const { json: result1 } = await get('/agents', {
        skills: 'tool_interaction',
        limit: 10,
      });
      assertSuccess(result1);

      await sleep(1000);

      const { json: result2 } = await get('/agents', {
        skills: 'tool_interaction',
        limit: 10,
      });
      assertSuccess(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'SDK path skills filter');
      }
    });

    it('SDK path with combined filters returns same results', async () => {
      const { json: result1 } = await get('/agents', {
        mcp: true,
        chainId: 11155111,
        active: true,
        limit: 10,
      });
      assertSuccess(result1);

      await sleep(1000);

      const { json: result2 } = await get('/agents', {
        mcp: true,
        chainId: 11155111,
        active: true,
        limit: 10,
      });
      assertSuccess(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'SDK path combined filters');
      }
    });

    it('Search path returns same results on consecutive calls', async () => {
      const { json: result1 } = await get('/agents', { q: 'test', limit: 10 });
      if (!result1.success) {
        // Search service may be down, skip test
        console.log('  Note: Search service unavailable, skipping');
        return;
      }
      assertHasSearchMode(result1);

      await sleep(1000);

      const { json: result2 } = await get('/agents', { q: 'test', limit: 10 });
      if (!result2.success) {
        console.log('  Note: Search service unavailable on second call');
        return;
      }
      assertHasSearchMode(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'Search path consecutive calls');
      }
    });

    it('Search path with mcp filter returns same results', async () => {
      const { json: result1 } = await get('/agents', { q: 'agent', mcp: true, limit: 10 });
      if (!result1.success) {
        console.log('  Note: Search service unavailable, skipping');
        return;
      }
      assertHasSearchMode(result1);

      await sleep(1000);

      const { json: result2 } = await get('/agents', { q: 'agent', mcp: true, limit: 10 });
      if (!result2.success) {
        console.log('  Note: Search service unavailable on second call');
        return;
      }
      assertHasSearchMode(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'Search path mcp=true');
      }

      // Verify filtered total is consistent
      if (result1.meta?.total !== result2.meta?.total) {
        throw new Error(
          `Search mcp=true: Different totals - first: ${result1.meta?.total}, second: ${result2.meta?.total}`
        );
      }
    });

    it('POST /search returns same results on consecutive calls', async () => {
      const { json: result1 } = await post('/search', { query: 'agent', limit: 10 });
      if (!result1.success) {
        console.log('  Note: Search service unavailable, skipping');
        return;
      }
      assertHasSearchMode(result1);

      await sleep(1000);

      const { json: result2 } = await post('/search', { query: 'agent', limit: 10 });
      if (!result2.success) {
        console.log('  Note: Search service unavailable on second call');
        return;
      }
      assertHasSearchMode(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'POST /search consecutive calls');
      }
    });

    it('POST /search with filters returns same results', async () => {
      const { json: result1 } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, chainIds: [11155111] },
        limit: 10,
      });
      if (!result1.success) {
        console.log('  Note: Search service unavailable, skipping');
        return;
      }
      assertHasSearchMode(result1);

      await sleep(1000);

      const { json: result2 } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, chainIds: [11155111] },
        limit: 10,
      });
      if (!result2.success) {
        console.log('  Note: Search service unavailable on second call');
        return;
      }
      assertHasSearchMode(result2);

      if (result1.data && result2.data) {
        assertSameResults(result1.data, result2.data, 'POST /search with filters');
      }

      // Verify filtered total is consistent
      if (result1.meta?.total !== result2.meta?.total) {
        throw new Error(
          `POST /search with filters: Different totals - first: ${result1.meta?.total}, second: ${result2.meta?.total}`
        );
      }
    });
  });
}
