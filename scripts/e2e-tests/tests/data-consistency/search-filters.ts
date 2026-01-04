/**
 * Search Filters Test Suite
 *
 * Tests all filters available via Search path (with search query)
 * Verifies that each filter returns correct results with semantic search.
 */

import { describe, expect, it } from '../../test-runner';
import { get, post } from '../../utils/api-client';
import {
  assertAllMatch,
  assertBooleanFlag,
  assertChainId,
  assertChainIds,
  assertHasDomain,
  assertHasSearchScore,
  assertHasSkill,
  assertMinSearchScore,
  assertSuccess,
} from '../../utils/assertions';

// Test configuration
const LIMIT = 20;
const TEST_QUERY = 'AI assistant';
const CHAINS = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
};

// Known skills and domains for testing
const TEST_SKILLS = ['natural_language_processing', 'code_generation', 'data_analysis'];
const TEST_DOMAINS = ['technology', 'finance', 'healthcare'];

export function registerSearchFiltersTests(): void {
  describe('Search Filters - Query via GET', () => {
    it('q parameter triggers semantic search', async () => {
      const { json } = await get('/agents', { q: TEST_QUERY, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
      }
    });

    it('q + active=true filter', async () => {
      const { json } = await get('/agents', { q: TEST_QUERY, active: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertHasSearchScore(json.data!);
      }
    });

    it('q + mcp=true filter', async () => {
      const { json } = await get('/agents', { q: TEST_QUERY, mcp: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('q + chainId filter', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });

    it('q + minScore filter', async () => {
      const { json } = await get('/agents', { q: TEST_QUERY, minScore: 0.5, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertMinSearchScore(json.data!, 0.5);
      }
    });
  });

  describe('Search Filters - POST /search', () => {
    it('basic search query', async () => {
      const { json } = await post('/search', { query: TEST_QUERY, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
      }
    });

    it('search with active filter', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        filters: { active: true },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
      }
    });

    it('search with mcp filter', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        filters: { mcp: true },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('search with a2a filter', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        filters: { a2a: true },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasA2a', true);
      }
    });

    it('search with x402 filter', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        filters: { x402: true },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'x402Support', true);
      }
    });

    it('search with chainIds filter', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        filters: { chainIds: [CHAINS.SEPOLIA, CHAINS.BASE_SEPOLIA] },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainIds(json.data!, [CHAINS.SEPOLIA, CHAINS.BASE_SEPOLIA]);
      }
    });

    it('search with minScore filter', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        minScore: 0.4,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertMinSearchScore(json.data!, 0.4);
      }
    });
  });

  describe('Search Filters - OASF Skills', () => {
    it('skills filter with single skill', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        skills: TEST_SKILLS[0],
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, TEST_SKILLS[0]!);
      }
    });

    it('skills filter via POST', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        filters: { skills: [TEST_SKILLS[0]] },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, TEST_SKILLS[0]!);
      }
    });

    it('multiple skills filter (CSV)', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        skills: `${TEST_SKILLS[0]},${TEST_SKILLS[1]}`,
        limit: LIMIT,
      });
      assertSuccess(json);
      // Should have at least one of the skills
    });
  });

  describe('Search Filters - OASF Domains', () => {
    it('domains filter with single domain', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        domains: TEST_DOMAINS[0],
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasDomain(json.data!, TEST_DOMAINS[0]!);
      }
    });

    it('domains filter via POST', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        filters: { domains: [TEST_DOMAINS[0]] },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasDomain(json.data!, TEST_DOMAINS[0]!);
      }
    });

    it('multiple domains filter (CSV)', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        domains: `${TEST_DOMAINS[0]},${TEST_DOMAINS[1]}`,
        limit: LIMIT,
      });
      assertSuccess(json);
    });
  });

  describe('Search Filters - Combined OASF', () => {
    it('skills + domains filter', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        skills: TEST_SKILLS[0],
        domains: TEST_DOMAINS[0],
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, TEST_SKILLS[0]!);
        assertHasDomain(json.data!, TEST_DOMAINS[0]!);
      }
    });

    it('skills + domains + active filter', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        skills: TEST_SKILLS[0],
        domains: TEST_DOMAINS[0],
        active: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
      }
    });
  });

  describe('Search Filters - Filter Mode', () => {
    it('filterMode=AND with search query', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        mcp: true,
        a2a: true,
        filterMode: 'AND',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'hasA2a', true);
      }
    });

    it('filterMode=OR with search query', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a) => a.hasMcp === true || a.hasA2a === true,
          'has MCP or A2A'
        );
      }
    });

    it('filterMode=OR via POST', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        filters: {
          mcp: true,
          x402: true,
          filterMode: 'OR',
        },
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
  });

  describe('Search Filters - Search Modes', () => {
    it('searchMode=semantic uses vector search', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        searchMode: 'semantic',
        limit: LIMIT,
      });
      assertSuccess(json);
      // Should use semantic search path
      if (json.data?.length > 0) {
        assertHasSearchScore(json.data!);
      }
    });

    it('searchMode=name uses substring search', async () => {
      const { json } = await get('/agents', {
        q: 'agent', // common substring
        searchMode: 'name',
        limit: LIMIT,
      });
      assertSuccess(json);
      // Should find agents with "agent" in name
    });

    it('searchMode=auto falls back appropriately', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        searchMode: 'auto',
        limit: LIMIT,
      });
      assertSuccess(json);
      // Auto mode chooses based on results
    });
  });

  describe('Search Filters - Complex Combinations', () => {
    it('query + active + mcp + chainId', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
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

    it('query + skills + domains + minScore', async () => {
      const { json } = await post('/search', {
        query: TEST_QUERY,
        limit: LIMIT,
        minScore: 0.3,
        filters: {
          skills: [TEST_SKILLS[0]],
          domains: [TEST_DOMAINS[0]],
        },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertMinSearchScore(json.data!, 0.3);
      }
    });

    it('all boolean filters + query', async () => {
      const { json } = await get('/agents', {
        q: TEST_QUERY,
        active: true,
        mcp: true,
        a2a: false,
        x402: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'hasA2a', false);
        assertBooleanFlag(json.data!, 'x402Support', true);
      }
    });
  });

  describe('Search Filters - Edge Cases', () => {
    it('empty query returns error or fallback', async () => {
      const { json } = await get('/agents', { q: '', limit: LIMIT });
      // Should either error or return SDK path results
      if (json.success) {
        expect(json.data).toBeDefined();
      }
    });

    it('very short query', async () => {
      const { json } = await get('/agents', { q: 'ai', limit: LIMIT });
      assertSuccess(json);
    });

    it('very long query', async () => {
      const longQuery = 'AI assistant that can help with coding and data analysis '.repeat(5);
      const { json } = await get('/agents', { q: longQuery, limit: LIMIT });
      assertSuccess(json);
    });

    it('special characters in query', async () => {
      const { json } = await get('/agents', { q: 'AI & ML assistant', limit: LIMIT });
      assertSuccess(json);
    });

    it('unicode characters in query', async () => {
      const { json } = await get('/agents', { q: 'AI 助手', limit: LIMIT });
      assertSuccess(json);
    });
  });
}
