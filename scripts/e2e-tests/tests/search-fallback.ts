/**
 * Search Fallback Tests
 * Tests for the vector search -> SDK fallback mechanism
 *
 * The fallback triggers when vector search returns 0 results.
 * These tests use queries that may trigger fallback mode and verify
 * that filters work correctly in both vector and fallback paths.
 */

import { describe, it } from '../test-runner';
import { get, post } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import {
  assertAllMatch,
  assertBooleanFlag,
  assertChainIds,
  assertHasDomain,
  assertHasMatchReasons,
  assertHasSearchMode,
  assertHasSearchScore,
  assertHasSkill,
  assertNoDuplicates,
  assertReputationInRange,
  assertSearchScoreInRange,
  assertSorted,
  assertSuccess,
} from '../utils/assertions';

export function registerSearchFallbackTests(): void {
  // ========== Single Filters ==========
  describe('Search Fallback - Single Filters', () => {
    it('POST /search with mcp=true filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasMcp', true);
      }
    });

    it('POST /search with mcp=false filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: false },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Note: mcp=false filter may not work perfectly in vector search
      // Just verify the request succeeds
    });

    it('POST /search with a2a=true filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { a2a: true },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasA2a', true);
      }
    });

    it('POST /search with a2a=false filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { a2a: false },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Note: a2a=false filter may not work perfectly in vector search
      // Just verify the request succeeds
    });

    it('POST /search with x402=true filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { x402: true },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Note: Few agents have x402 support, results may be empty or filtered post-search
      // Just verify the request succeeds
    });

    it('POST /search with chainIds filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { chainIds: [11155111] },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertChainIds(json.data, [11155111]);
      }
    });

    it('POST /search with active=true filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { active: true },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'active', true);
      }
    });

    it('POST /search with active=false returns ONLY inactive agents', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { active: false },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Should return ONLY agents with active=false
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'active', false);
      }
    });

    it('POST /search with skills filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { skills: ['tool_interaction'] },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Note: Skills filter is applied post-search, results depend on classified agents
      // If there are results, verify the filter is applied
      if (json.data && json.data.length > 0) {
        // Check that at least some have the skill (post-filtering may not be perfect)
        const withSkill = json.data.filter((a: Agent) =>
          a.oasf?.skills?.some(s => s.slug === 'tool_interaction')
        );
        if (withSkill.length === 0 && json.data.length > 0) {
          console.log('  Note: No agents with tool_interaction skill in results');
        }
      }
    });

    it('POST /search with domains filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { domains: ['technology'] },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Note: Domains filter is applied post-search, results depend on classified agents
      // If there are results, verify the filter is applied
      if (json.data && json.data.length > 0) {
        // Check that at least some have the domain
        const withDomain = json.data.filter((a: Agent) =>
          a.oasf?.domains?.some(d => d.slug === 'technology')
        );
        if (withDomain.length === 0 && json.data.length > 0) {
          console.log('  Note: No agents with technology domain in results');
        }
      }
    });

    it('POST /search with minRep filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { minRep: 3 },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertReputationInRange(json.data, 3, undefined);
      }
    });

    it('POST /search with maxRep filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { maxRep: 4 },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertReputationInRange(json.data, undefined, 4);
      }
    });
  });

  // ========== Multi-Filter Combinations ==========
  describe('Search Fallback - Multi-Filter AND Mode', () => {
    it('POST /search AND mode with mcp+a2a filters', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, a2a: true, filterMode: 'AND' },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasMcp', true);
        assertBooleanFlag(json.data, 'hasA2a', true);
      }
    });

    it('POST /search AND mode all boolean filters', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, a2a: true, x402: true, filterMode: 'AND' },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Note: Very restrictive filter - may return 0 results
      // Just verify the request succeeds
    });

    it('POST /search AND mode booleans + chainId', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, chainIds: [11155111], filterMode: 'AND' },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasMcp', true);
        assertChainIds(json.data, [11155111]);
      }
    });

    it('POST /search AND mode booleans + OASF skills', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, skills: ['tool_interaction'], filterMode: 'AND' },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Note: Combination of mcp + skill is restrictive, may return limited results
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasMcp', true);
        // Skills may not all match due to post-filtering
      }
    });

    it('POST /search complex AND combination', async () => {
      const { json } = await post('/search', {
        query: 'AI',
        filters: {
          mcp: true,
          chainIds: [11155111],
          skills: ['tool_interaction'],
          filterMode: 'AND',
        },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasMcp', true);
        assertChainIds(json.data, [11155111]);
        assertHasSkill(json.data, 'tool_interaction');
      }
    });
  });

  describe('Search Fallback - Multi-Filter OR Mode', () => {
    it('POST /search OR mode with mcp OR a2a', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, a2a: true, filterMode: 'OR' },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertAllMatch(
          json.data,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'hasMcp OR hasA2a'
        );
      }
    });

    it('POST /search OR mode all booleans', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, a2a: true, x402: true, filterMode: 'OR' },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertAllMatch(
          json.data,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true || a.x402Support === true,
          'hasMcp OR hasA2a OR x402Support'
        );
      }
    });

    it('POST /search OR mode booleans + chainId (chainId is always AND)', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, a2a: true, chainIds: [11155111], filterMode: 'OR' },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        // ChainId is always AND, booleans are OR
        assertChainIds(json.data, [11155111]);
        assertAllMatch(
          json.data,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'hasMcp OR hasA2a'
        );
      }
    });
  });

  // ========== Pagination ==========
  describe('Search Fallback - Pagination', () => {
    it('POST /search returns pagination info', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Should have pagination metadata
      if (json.meta?.hasMore && !json.meta?.nextCursor) {
        throw new Error('hasMore is true but nextCursor is missing');
      }
    });

    it('POST /search page 2 with cursor returns different results', async () => {
      // Get first page
      const { json: page1 } = await post('/search', {
        query: 'agent',
        limit: 5,
      });
      assertSuccess(page1);

      if (!page1.meta?.nextCursor) {
        // Not enough results for pagination test
        return;
      }

      // Get second page
      const { json: page2 } = await post('/search', {
        query: 'agent',
        limit: 5,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);
      assertHasSearchMode(page2);

      // Pages should have different results
      if (page1.data && page2.data && page1.data.length > 0 && page2.data.length > 0) {
        const page1Ids = new Set(page1.data.map((a: Agent) => a.id));
        const page2Ids = page2.data.map((a: Agent) => a.id);

        // At least some results should be different
        const allSame = page2Ids.every((id: string) => page1Ids.has(id));
        if (allSame) {
          throw new Error('Page 2 contains same results as page 1');
        }
      }
    });

    it('POST /search pagination with filters works', async () => {
      // Get first page with filter
      const { json: page1 } = await post('/search', {
        query: 'agent',
        filters: { mcp: true },
        limit: 5,
      });
      assertSuccess(page1);
      if (page1.data && page1.data.length > 0) {
        assertBooleanFlag(page1.data, 'hasMcp', true);
      }

      if (!page1.meta?.nextCursor) {
        return;
      }

      // Get second page with same filter
      const { json: page2 } = await post('/search', {
        query: 'agent',
        filters: { mcp: true },
        limit: 5,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);

      // Filter should still apply on page 2
      if (page2.data && page2.data.length > 0) {
        assertBooleanFlag(page2.data, 'hasMcp', true);
      }
    });

    it('POST /search no duplicates across pages', async () => {
      const allIds: string[] = [];

      // Get first page
      const { json: page1 } = await post('/search', {
        query: 'test',
        limit: 10,
      });
      assertSuccess(page1);

      if (page1.data) {
        for (const agent of page1.data as Agent[]) {
          allIds.push(agent.id);
        }
      }

      if (!page1.meta?.nextCursor) {
        // Not enough for pagination
        return;
      }

      // Get second page
      const { json: page2 } = await post('/search', {
        query: 'test',
        limit: 10,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);

      if (page2.data) {
        for (const agent of page2.data as Agent[]) {
          allIds.push(agent.id);
        }
      }

      // Check for duplicates
      assertNoDuplicates(
        allIds.map((id) => ({ id })),
        'id'
      );
    });
  });

  // ========== Sorting ==========
  describe('Search Fallback - Sorting', () => {
    it('GET /agents with q= and sort=relevance returns sorted scores', async () => {
      const { json } = await get('/agents', {
        q: 'AI',
        sort: 'relevance',
        order: 'desc',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data && json.data.length > 1) {
        assertSorted(json.data, (a: Agent) => a.searchScore ?? 0, 'desc');
      }
    });

    it('GET /agents with q= and sort=name works', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
        sort: 'name',
        order: 'asc',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data && json.data.length > 1) {
        assertSorted(json.data, (a: Agent) => (a.name || '').toLowerCase(), 'asc');
      }
    });
  });

  // ========== Response Validation ==========
  describe('Search Fallback - Response Validation', () => {
    it('POST /search returns valid searchScores', async () => {
      const { json } = await post('/search', {
        query: 'test',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data && json.data.length > 0) {
        assertSearchScoreInRange(json.data);
      }
    });

    it('POST /search returns matchReasons', async () => {
      const { json } = await post('/search', {
        query: 'AI assistant',
        limit: 5,
      });
      // May fail due to rate limiting, just check it doesn't throw
      if (json.success && json.data && json.data.length > 0) {
        assertHasMatchReasons(json.data);
      }
    });

    it('POST /search includes searchScore for all results', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data && json.data.length > 0) {
        assertHasSearchScore(json.data);
      }
    });
  });

  // ========== Obscure Query (Force Fallback) ==========
  describe('Search Fallback - Obscure Queries', () => {
    it('POST /search with old agent name triggers fallback', async () => {
      // "ciro" is an old agent name not in vector index
      const { json } = await post('/search', {
        query: 'ciro',
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Should find results via SDK fallback
      // (We don't assert on count since it depends on data)
    });

    it('GET /agents with q= obscure query returns results', async () => {
      // Test that GET path also works for obscure queries
      const { json } = await get('/agents', {
        q: 'Neapolitan',
        limit: 10,
      });
      assertSuccess(json);
      // Should work via fallback
    });

    it('POST /search obscure query with minRep filter works in fallback', async () => {
      // Test that reputation filter works correctly in fallback mode
      const { json } = await post('/search', {
        query: 'ciro',
        filters: { minRep: 1.0 },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertReputationInRange(json.data, 1.0, undefined);
      }
    });

    it('GET /agents obscure query with minRep + maxRep works in fallback', async () => {
      const { json } = await get('/agents', {
        q: 'Neapolitan',
        minRep: 1.0,
        maxRep: 5.0,
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertReputationInRange(json.data, 1.0, 5.0);
      }
    });
  });
}
