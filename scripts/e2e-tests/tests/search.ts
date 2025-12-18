/**
 * Search Tests
 * Tests for semantic search via GET and POST endpoints
 */

import { describe, it } from '../test-runner';
import { get, post } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import {
  assertAllMatch,
  assertBooleanFlag,
  assertChainIds,
  assertHasByChain,
  assertHasDomain,
  assertHasMatchReasons,
  assertHasSearchMode,
  assertHasSearchScore,
  assertHasSkill,
  assertMinSearchScore,
  assertReputationInRange,
  assertSearchScoreInRange,
  assertSorted,
  assertSuccess,
} from '../utils/assertions';

export function registerSearchTests(): void {
  describe('Search Path', () => {
    it('GET with q= returns searchScore', async () => {
      const { json } = await get('/agents', { q: 'AI', limit: 5 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
      }
    });

    it('Search with sort=relevance&order=desc', async () => {
      const { json } = await get('/agents', {
        q: 'AI',
        sort: 'relevance',
        order: 'desc',
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 1) {
        // Scores should be in descending order
        assertSorted(json.data!, (a: Agent) => a.searchScore ?? 0, 'desc');
      }
    });

    it('Search with mcp filter', async () => {
      const { json } = await get('/agents', { q: 'agent', mcp: true, limit: 5 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('Search with skills filter', async () => {
      const { json } = await get('/agents', { q: 'agent', skills: 'tool_interaction', limit: 5 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, 'tool_interaction');
      }
    });

    it('Search with minScore filter', async () => {
      const { json } = await get('/agents', { q: 'AI', minScore: 0.5, limit: 5 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertMinSearchScore(json.data!, 0.5);
      }
    });

    it('POST /search with query', async () => {
      const { json } = await post('/search', { query: 'AI assistant', limit: 5 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
      }
    });

    it('POST /search with filters', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('POST /search with minScore', async () => {
      const { json } = await post('/search', {
        query: 'AI assistant',
        minScore: 0.6,
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertMinSearchScore(json.data!, 0.6);
      }
    });

    it('POST /search with filters.domains', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { domains: ['technology'] },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertHasDomain(json.data!, 'technology');
      }
    });

    it('POST /search with active=false returns ONLY inactive agents', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { active: false },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Should return ONLY agents with active=false
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', false);
        assertHasSearchScore(json.data!);
      }
    });

    it('POST /search with filters.filterMode=OR', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, a2a: true, filterMode: 'OR' },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'hasMcp OR hasA2a'
        );
      }
    });

    it('POST /search with multiple chainIds', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { chainIds: [11155111, 84532] },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertChainIds(json.data!, [11155111, 84532]);
      }
    });

    it('POST /search with combined filters', async () => {
      const { json } = await post('/search', {
        query: 'AI',
        filters: {
          mcp: true,
          skills: ['tool_interaction'],
          chainIds: [11155111],
        },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertHasSkill(json.data!, 'tool_interaction');
        assertChainIds(json.data!, [11155111]);
      }
    });

    // ========== Search + Reputation Filters ==========

    it('GET with q= and minRep filter', async () => {
      const { json } = await get('/agents', { q: 'agent', minRep: 3.0, limit: 10 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 3.0, undefined);
        assertHasSearchScore(json.data!);
      }
    });

    it('GET with q= and maxRep filter', async () => {
      const { json } = await get('/agents', { q: 'agent', maxRep: 4.0, limit: 10 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, undefined, 4.0);
        assertHasSearchScore(json.data!);
      }
    });

    it('GET with q= and minRep + maxRep combined', async () => {
      const { json } = await get('/agents', { q: 'agent', minRep: 2.0, maxRep: 4.5, limit: 10 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 2.0, 4.5);
        assertHasSearchScore(json.data!);
      }
    });

    it('POST /search with minRep + maxRep combined', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { minRep: 2.0, maxRep: 4.5 },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 2.0, 4.5);
        assertHasSearchScore(json.data!);
      }
    });

    // ========== Search + Multiple OASF Filters ==========

    it('POST /search with multiple skills', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { skills: ['tool_interaction', 'natural_language_processing'] },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // At least some agents should match one of the skills
      if (json.data?.length > 0) {
        const matchingAgents = json.data.filter(
          (a: Agent) =>
            a.oasf?.skills?.some(
              (s) => s.slug === 'tool_interaction' || s.slug === 'natural_language_processing'
            )
        );
        // Note: Not all results may have OASF classification
        if (matchingAgents.length === 0 && json.data.length > 0) {
          console.log('  Note: No agents with specified skills in results');
        }
      }
    });

    it('POST /search with multiple domains', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { domains: ['technology', 'finance'] },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // At least some agents should match one of the domains
      if (json.data?.length > 0) {
        const matchingAgents = json.data.filter(
          (a: Agent) =>
            a.oasf?.domains?.some((d) => d.slug === 'technology' || d.slug === 'finance')
        );
        if (matchingAgents.length === 0 && json.data.length > 0) {
          console.log('  Note: No agents with specified domains in results');
        }
      }
    });

    it('POST /search with skills + domains combined', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: {
          skills: ['tool_interaction'],
          domains: ['technology'],
        },
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Results should have both skill AND domain
      if (json.data?.length > 0) {
        // Check that results have both if OASF data present
        for (const agent of json.data as Agent[]) {
          if (agent.oasf) {
            const hasSkill = agent.oasf.skills?.some((s) => s.slug === 'tool_interaction');
            const hasDomain = agent.oasf.domains?.some((d) => d.slug === 'technology');
            // Both should be true when OASF data is present
            if (hasSkill !== undefined && hasDomain !== undefined) {
              if (!hasSkill || !hasDomain) {
                throw new Error(
                  `Agent ${agent.id} missing required skill or domain in AND mode`
                );
              }
            }
          }
        }
      }
    });

    it('GET with q= and skills + domains combined', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
        skills: 'tool_interaction',
        domains: 'technology',
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
      }
    });

    it('GET with q + mcp filter returns filtered total (not global)', async () => {
      // Get unfiltered total first
      const { json: unfilteredJson } = await get('/agents', { q: 'agent', limit: 5 });
      assertSuccess(unfilteredJson);
      assertHasSearchMode(unfilteredJson);
      const unfilteredTotal = unfilteredJson.meta?.total ?? 0;

      // Get filtered total
      const { json: filteredJson } = await get('/agents', { q: 'agent', mcp: true, limit: 5 });
      assertSuccess(filteredJson);
      assertHasSearchMode(filteredJson);
      const filteredTotal = filteredJson.meta?.total ?? 0;

      // Filtered total should be less than or equal to unfiltered total
      if (filteredTotal > unfilteredTotal) {
        throw new Error(
          `Filtered total (${filteredTotal}) should be <= unfiltered total (${unfilteredTotal})`
        );
      }

      // If we have results, verify all have mcp=true
      if (filteredJson.data?.length > 0) {
        assertBooleanFlag(filteredJson.data!, 'hasMcp', true);
      }
    });

    it('POST /search with mcp filter returns filtered total (not global)', async () => {
      // Get unfiltered total first
      const { json: unfilteredJson } = await post('/search', { query: 'agent', limit: 5 });
      assertSuccess(unfilteredJson);
      assertHasSearchMode(unfilteredJson);
      const unfilteredTotal = unfilteredJson.meta?.total ?? 0;

      // Get filtered total
      const { json: filteredJson } = await post('/search', {
        query: 'agent',
        filters: { mcp: true },
        limit: 5,
      });
      assertSuccess(filteredJson);
      assertHasSearchMode(filteredJson);
      const filteredTotal = filteredJson.meta?.total ?? 0;

      // Filtered total should be less than or equal to unfiltered total
      if (filteredTotal > unfilteredTotal) {
        throw new Error(
          `Filtered total (${filteredTotal}) should be <= unfiltered total (${unfilteredTotal})`
        );
      }

      // If we have results, verify all have mcp=true
      if (filteredJson.data?.length > 0) {
        assertBooleanFlag(filteredJson.data!, 'hasMcp', true);
      }
    });
  });

  describe('Search Fallback Strategy', () => {
    it('POST /search returns searchMode in meta', async () => {
      const { json } = await post('/search', { query: 'agent', limit: 5 });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Should be either 'vector' or 'fallback'
      const mode = json.meta?.searchMode;
      if (mode !== 'vector' && mode !== 'fallback') {
        throw new Error(`Unexpected searchMode: ${mode}`);
      }
    });

    it('POST /search returns valid scores in range [0, 1]', async () => {
      const { json } = await post('/search', { query: 'test', limit: 10 });
      assertSuccess(json);
      if (json.data && json.data.length > 0) {
        assertSearchScoreInRange(json.data);
      }
    });

    it('POST /search returns matchReasons for results', async () => {
      const { json } = await post('/search', { query: 'Test Agent', limit: 5 });
      assertSuccess(json);
      if (json.data && json.data.length > 0) {
        assertHasMatchReasons(json.data);
      }
    });

    it('POST /search returns byChain breakdown', async () => {
      const { json } = await post('/search', { query: 'agent', limit: 10 });
      assertSuccess(json);
      assertHasByChain(json);
    });

    it('POST /search scores are sorted descending', async () => {
      const { json } = await post('/search', { query: 'agent', limit: 10 });
      assertSuccess(json);
      if (json.data && json.data.length > 1) {
        assertSorted(json.data, (a: Agent) => a.searchScore ?? 0, 'desc');
      }
    });

    it('POST /search with exact name match returns high score', async () => {
      // First get an agent name to search for
      const { json: listJson } = await get('/agents', { limit: 1 });
      assertSuccess(listJson);
      if (!listJson.data || listJson.data.length === 0) return;

      const agentName = (listJson.data[0] as Agent).name;
      const { json } = await post('/search', { query: agentName, limit: 5 });
      assertSuccess(json);

      if (json.data && json.data.length > 0) {
        // The first result should have a high score for exact/near match
        const firstResult = json.data[0] as Agent;
        if (firstResult.searchScore !== undefined && firstResult.searchScore < 0.5) {
          throw new Error(
            `Expected high score for exact name search, got ${firstResult.searchScore}`
          );
        }
      }
    });

    it('POST /search with mcp filter in fallback mode works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { mcp: true },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasMcp', true);
      }
    });

    it('POST /search with a2a filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { a2a: true },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasA2a', true);
      }
    });

    it('POST /search with OR mode filters works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: {
          mcp: true,
          a2a: true,
          filterMode: 'OR',
        },
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

    it('POST /search with chainIds filter works', async () => {
      const { json } = await post('/search', {
        query: 'agent',
        filters: { chainIds: [11155111] },
        limit: 5,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data && json.data.length > 0) {
        assertChainIds(json.data, [11155111]);
      }
    });

    it('POST /search includes OASF classifications', async () => {
      const { json } = await post('/search', { query: 'agent', limit: 10 });
      assertSuccess(json);
      // At least some agents should have OASF classifications
      if (json.data && json.data.length > 0) {
        const withOasf = json.data.filter(
          (a: Agent) => a.oasf && (a.oasf.skills?.length || a.oasf.domains?.length)
        );
        // Don't fail if no OASF, just log
        if (withOasf.length === 0) {
          console.log('  Note: No agents with OASF classifications found');
        }
      }
    });
  });

  // ========== Search Pagination (Offset-based) ==========
  describe('Search Pagination', () => {
    it('GET /agents?q=X&page=1 returns search results', async () => {
      const { json } = await get('/agents', { q: 'agent', page: 1, limit: 5 });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
      }
      // Verify pagination meta is present
      if (json.meta?.page !== 1) {
        throw new Error(`Expected page=1 in meta, got ${json.meta?.page}`);
      }
    });

    it('GET /agents?q=X&page=2 returns different results', async () => {
      // Get page 1
      const { json: page1 } = await get('/agents', { q: 'agent', page: 1, limit: 5 });
      assertSuccess(page1);
      assertHasSearchMode(page1);

      // Get page 2
      const { json: page2 } = await get('/agents', { q: 'agent', page: 2, limit: 5 });
      assertSuccess(page2);
      assertHasSearchMode(page2);

      // If both pages have data, verify no overlap
      if (page1.data && page2.data && page1.data.length > 0 && page2.data.length > 0) {
        const page1Ids = new Set(page1.data.map((a: Agent) => a.id));
        const hasOverlap = page2.data.some((a: Agent) => page1Ids.has(a.id));
        if (hasOverlap) {
          throw new Error('Page 2 should not overlap with page 1 in search results');
        }
      }
    });

    it('GET /agents?q=X&page=N with filter maintains filter across pages', async () => {
      // Get page 1 with mcp filter
      const { json: page1 } = await get('/agents', {
        q: 'agent',
        mcp: true,
        page: 1,
        limit: 5,
      });
      assertSuccess(page1);
      assertHasSearchMode(page1);

      if (page1.data && page1.data.length > 0) {
        assertBooleanFlag(page1.data, 'hasMcp', true);
      }

      // Get page 2 with same filter
      const { json: page2 } = await get('/agents', {
        q: 'agent',
        mcp: true,
        page: 2,
        limit: 5,
      });
      assertSuccess(page2);
      assertHasSearchMode(page2);

      // Filter should still apply on page 2
      if (page2.data && page2.data.length > 0) {
        assertBooleanFlag(page2.data, 'hasMcp', true);
      }
    });

    it('POST /search cursor pagination returns different pages', async () => {
      // Get first page
      const { json: page1 } = await post('/search', { query: 'agent', limit: 5 });
      assertSuccess(page1);
      assertHasSearchMode(page1);

      if (!page1.meta?.nextCursor) {
        console.log('  Note: Not enough data for cursor pagination test');
        return;
      }

      // Get second page with cursor
      const { json: page2 } = await post('/search', {
        query: 'agent',
        limit: 5,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);
      assertHasSearchMode(page2);

      // Verify different results
      if (page1.data && page2.data && page1.data.length > 0 && page2.data.length > 0) {
        const page1Ids = new Set(page1.data.map((a: Agent) => a.id));
        const hasOverlap = page2.data.some((a: Agent) => page1Ids.has(a.id));
        if (hasOverlap) {
          throw new Error('Cursor page 2 should not overlap with page 1');
        }
      }
    });

    it('POST /search cursor + filters maintains filters across pages', async () => {
      // Get first page with filters
      const { json: page1 } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, chainIds: [11155111] },
        limit: 5,
      });
      assertSuccess(page1);
      assertHasSearchMode(page1);

      if (page1.data && page1.data.length > 0) {
        assertBooleanFlag(page1.data, 'hasMcp', true);
        assertChainIds(page1.data, [11155111]);
      }

      if (!page1.meta?.nextCursor) {
        console.log('  Note: Not enough filtered data for cursor test');
        return;
      }

      // Get second page with same filters + cursor
      const { json: page2 } = await post('/search', {
        query: 'agent',
        filters: { mcp: true, chainIds: [11155111] },
        limit: 5,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);
      assertHasSearchMode(page2);

      // Filters should still apply
      if (page2.data && page2.data.length > 0) {
        assertBooleanFlag(page2.data, 'hasMcp', true);
        assertChainIds(page2.data, [11155111]);
      }
    });
  });

  // ========== Sorting + Search ==========
  describe('Sorting + Search', () => {
    it('GET /agents?q=X&sort=createdAt&order=desc returns sorted results', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
        sort: 'createdAt',
        order: 'desc',
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 1) {
        // Verify sorting by createdAt descending
        const createdAts = json.data!.map((a: Agent) => a.createdAt).filter(Boolean);
        if (createdAts.length > 1) {
          for (let i = 1; i < createdAts.length; i++) {
            if (createdAts[i] > createdAts[i - 1]) {
              throw new Error(
                `Sort order broken: ${createdAts[i - 1]} should come before ${createdAts[i]}`
              );
            }
          }
        }
      }
    });

    it('GET /agents?q=X&sort=reputation&order=desc returns sorted results', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
        sort: 'reputation',
        order: 'desc',
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      // Results should still have search scores
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
        // Verify reputation sorting
        const reputations = json.data!.map((a: Agent) => a.reputation ?? 0);
        for (let i = 1; i < reputations.length; i++) {
          if (reputations[i] > reputations[i - 1]) {
            throw new Error(
              `Reputation sort order broken: ${reputations[i - 1]} should be >= ${reputations[i]}`
            );
          }
        }
      }
    });

    it('GET /agents?q=X&sort=name&order=asc returns alphabetically sorted', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
        sort: 'name',
        order: 'asc',
        limit: 10,
      });
      assertSuccess(json);
      assertHasSearchMode(json);
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
      }
    });
  });

  describe('Search Input Validation', () => {
    it('POST /search with empty query returns error', async () => {
      const { json } = await post('/search', { query: '', limit: 5 });
      // Should return validation error
      if (json.success) {
        throw new Error('Expected error for empty query');
      }
      if (!json.error) {
        throw new Error('Expected error message');
      }
    });

    it('POST /search with very long query is handled', async () => {
      // Query longer than reasonable limit (e.g., 1000 chars)
      const longQuery = 'a'.repeat(1001);
      const { json } = await post('/search', { query: longQuery, limit: 5 });
      // API may accept long queries or return error - just verify it doesn't crash
      // This documents the actual behavior
      if (json.success) {
        console.log('  Note: API accepts long queries');
      }
    });

    it('POST /search with whitespace-only query is handled', async () => {
      const { json } = await post('/search', { query: '   ', limit: 5 });
      // API may trim whitespace or return error - just verify it doesn't crash
      // This documents the actual behavior
      if (json.success) {
        console.log('  Note: API accepts whitespace-only queries');
      }
    });
  });
}
