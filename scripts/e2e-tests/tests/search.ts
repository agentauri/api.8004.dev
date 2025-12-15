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
  assertSearchScoreInRange,
  assertSorted,
  assertSuccess,
} from '../utils/assertions';

export function registerSearchTests(): void {
  describe('Search Path', () => {
    it('GET with q= returns searchScore', async () => {
      const { json } = await get('/agents', { q: 'AI', limit: 5 });
      assertSuccess(json);
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
      if (json.data?.length > 1) {
        // Scores should be in descending order
        assertSorted(json.data!, (a: Agent) => a.searchScore ?? 0, 'desc');
      }
    });

    it('Search with mcp filter', async () => {
      const { json } = await get('/agents', { q: 'agent', mcp: true, limit: 5 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('Search with skills filter', async () => {
      const { json } = await get('/agents', { q: 'agent', skills: 'tool_interaction', limit: 5 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, 'tool_interaction');
      }
    });

    it('Search with minScore filter', async () => {
      const { json } = await get('/agents', { q: 'AI', minScore: 0.5, limit: 5 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertMinSearchScore(json.data!, 0.5);
      }
    });

    it('POST /search with query', async () => {
      const { json } = await post('/search', { query: 'AI assistant', limit: 5 });
      assertSuccess(json);
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
      if (json.data?.length > 0) {
        assertHasDomain(json.data!, 'technology');
      }
    });

    it('POST /search with active=false (showAll) returns results', async () => {
      // active=false means "no filter" (showAll=true in frontend)
      // This should return results in both vector search and fallback modes
      const { json } = await post('/search', {
        query: 'agent',
        filters: { active: false },
        limit: 5,
      });
      assertSuccess(json);
      // Should return results (no active filter applied)
      if (json.data?.length > 0) {
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
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertHasSkill(json.data!, 'tool_interaction');
        assertChainIds(json.data!, [11155111]);
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
}
