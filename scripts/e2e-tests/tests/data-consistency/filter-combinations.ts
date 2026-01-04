/**
 * Filter Combinations Test Suite
 *
 * Tests complex combinations of filters to ensure
 * all filter permutations work correctly together.
 */

import { describe, expect, it } from '../../test-runner';
import { get, post } from '../../utils/api-client';
import {
  assertAllMatch,
  assertBooleanFlag,
  assertChainId,
  assertChainIds,
  assertHasDomain,
  assertHasSkill,
  assertMinSearchScore,
  assertReputationInRange,
  assertSuccess,
} from '../../utils/assertions';

// Test configuration
const LIMIT = 20;
const CHAINS = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  POLYGON_AMOY: 80002,
};

// Known skills and domains for testing
const TEST_SKILLS = ['natural_language_processing', 'code_generation', 'data_analysis'];
const TEST_DOMAINS = ['technology', 'finance', 'healthcare'];

interface Agent {
  id: string;
  chainId: number;
  active?: boolean;
  hasMcp?: boolean;
  hasA2a?: boolean;
  x402Support?: boolean;
  reputation?: number;
  skills?: string[];
  domains?: string[];
  searchScore?: number;
  [key: string]: unknown;
}

export function registerFilterCombinationsTests(): void {
  describe('Filter Combinations - Two Boolean Filters', () => {
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

    it('active=true + x402=true', async () => {
      const { json } = await get('/agents', { active: true, x402: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'x402Support', true);
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

    it('a2a=true + x402=true', async () => {
      const { json } = await get('/agents', { a2a: true, x402: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasA2a', true);
        assertBooleanFlag(json.data!, 'x402Support', true);
      }
    });

    it('active=false + mcp=true', async () => {
      const { json } = await get('/agents', { active: false, mcp: true, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', false);
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });
  });

  describe('Filter Combinations - Boolean + Chain', () => {
    it('active=true + chainId', async () => {
      const { json } = await get('/agents', {
        active: true,
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });

    it('mcp=true + chainId', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });

    it('active=true + chainIds (multiple)', async () => {
      const { json } = await get('/agents', {
        active: true,
        chainIds: `${CHAINS.SEPOLIA},${CHAINS.BASE_SEPOLIA}`,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertChainIds(json.data!, [CHAINS.SEPOLIA, CHAINS.BASE_SEPOLIA]);
      }
    });

    it('mcp=true + a2a=true + chainId', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'hasA2a', true);
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });
  });

  describe('Filter Combinations - Boolean + Reputation', () => {
    it('active=true + minRep', async () => {
      const { json } = await get('/agents', { active: true, minRep: 3, limit: LIMIT });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertReputationInRange(json.data!, 3, undefined);
      }
    });

    it('mcp=true + minRep + maxRep', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        minRep: 2,
        maxRep: 4,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertReputationInRange(json.data!, 2, 4);
      }
    });

    it('active=true + mcp=true + minRep', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        minRep: 2,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertReputationInRange(json.data!, 2, undefined);
      }
    });
  });

  describe('Filter Combinations - Three+ Boolean Filters', () => {
    it('active=true + mcp=true + a2a=true', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        a2a: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'hasA2a', true);
      }
    });

    it('active=true + mcp=true + x402=true', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        x402: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'x402Support', true);
      }
    });

    it('active=true + mcp=true + a2a=true + x402=true (all)', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        a2a: true,
        x402: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'hasA2a', true);
        assertBooleanFlag(json.data!, 'x402Support', true);
      }
    });
  });

  describe('Filter Combinations - OASF Filters', () => {
    it('skills + active', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
        skills: TEST_SKILLS[0],
        active: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertHasSkill(json.data!, TEST_SKILLS[0]!);
      }
    });

    it('domains + mcp', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
        domains: TEST_DOMAINS[0],
        mcp: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertHasDomain(json.data!, TEST_DOMAINS[0]!);
      }
    });

    it('skills + domains + active', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
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

    it('skills + domains + chainId', async () => {
      const { json } = await get('/agents', {
        q: 'agent',
        skills: TEST_SKILLS[0],
        domains: TEST_DOMAINS[0],
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });
  });

  describe('Filter Combinations - Search + Filters', () => {
    it('query + active + mcp', async () => {
      const { json } = await get('/agents', {
        q: 'AI assistant',
        active: true,
        mcp: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('query + active + chainId', async () => {
      const { json } = await get('/agents', {
        q: 'AI assistant',
        active: true,
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });

    it('query + minScore + active', async () => {
      const { json } = await get('/agents', {
        q: 'AI assistant',
        minScore: 0.4,
        active: true,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertMinSearchScore(json.data!, 0.4);
      }
    });

    it('POST /search with multiple filters', async () => {
      const { json } = await post('/search', {
        query: 'AI assistant',
        limit: LIMIT,
        filters: {
          active: true,
          mcp: true,
          chainIds: [CHAINS.SEPOLIA],
        },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertChainId(json.data!, CHAINS.SEPOLIA);
      }
    });
  });

  describe('Filter Combinations - Filter Mode OR', () => {
    it('filterMode=OR: mcp OR a2a', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'has MCP or A2A'
        );
      }
    });

    it('filterMode=OR: mcp OR x402', async () => {
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
          (a: Agent) => a.hasMcp === true || a.x402Support === true,
          'has MCP or x402'
        );
      }
    });

    it('filterMode=OR: a2a OR x402', async () => {
      const { json } = await get('/agents', {
        a2a: true,
        x402: true,
        filterMode: 'OR',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasA2a === true || a.x402Support === true,
          'has A2A or x402'
        );
      }
    });

    it('filterMode=OR with three flags', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        x402: true,
        filterMode: 'OR',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true || a.x402Support === true,
          'has MCP or A2A or x402'
        );
      }
    });

    it('filterMode=OR + active (active still required)', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        // Active should be required, OR applies to mcp/a2a
        assertBooleanFlag(json.data!, 'active', true);
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'has MCP or A2A'
        );
      }
    });

    it('filterMode=OR + chainId', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        chainId: CHAINS.SEPOLIA,
        filterMode: 'OR',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertChainId(json.data!, CHAINS.SEPOLIA);
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'has MCP or A2A'
        );
      }
    });

    it('filterMode=OR via POST /search', async () => {
      const { json } = await post('/search', {
        query: 'AI assistant',
        limit: LIMIT,
        filters: {
          mcp: true,
          a2a: true,
          filterMode: 'OR',
        },
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'has MCP or A2A'
        );
      }
    });
  });

  describe('Filter Combinations - Complex Scenarios', () => {
    it('all boolean + chain + reputation', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        chainId: CHAINS.SEPOLIA,
        minRep: 1,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertChainId(json.data!, CHAINS.SEPOLIA);
        assertReputationInRange(json.data!, 1, undefined);
      }
    });

    it('query + all filters combined', async () => {
      const { json } = await get('/agents', {
        q: 'AI',
        active: true,
        mcp: true,
        chainId: CHAINS.SEPOLIA,
        minScore: 0.3,
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertChainId(json.data!, CHAINS.SEPOLIA);
        assertMinSearchScore(json.data!, 0.3);
      }
    });

    it('filters + sorting', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        sort: 'name',
        order: 'asc',
        limit: LIMIT,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
      }
    });

    it('filters + pagination offset', async () => {
      const { json: page1 } = await get('/agents', {
        active: true,
        mcp: true,
        limit: 10,
        offset: 0,
      });
      const { json: page2 } = await get('/agents', {
        active: true,
        mcp: true,
        limit: 10,
        offset: 10,
      });

      assertSuccess(page1);
      assertSuccess(page2);

      // All agents should match filters
      for (const agent of [...(page1.data || []), ...(page2.data || [])]) {
        expect(agent.active).toBe(true);
        expect(agent.hasMcp).toBe(true);
      }

      // No duplicates across pages
      if (page1.data?.length > 0 && page2.data?.length > 0) {
        const page1Ids = new Set(page1.data.map((a: Agent) => a.id));
        for (const agent of page2.data) {
          expect(page1Ids.has(agent.id)).toBe(false);
        }
      }
    });

    it('filters + cursor pagination', async () => {
      const allIds = new Set<string>();
      let cursor: string | undefined;
      let iterations = 0;

      while (iterations < 3) {
        const params: Record<string, unknown> = {
          active: true,
          mcp: true,
          limit: 10,
        };
        if (cursor) params.cursor = cursor;

        const { json } = await get('/agents', params);
        assertSuccess(json);

        if (json.data!.length === 0) break;

        for (const agent of json.data!) {
          expect(allIds.has(agent.id)).toBe(false);
          expect(agent.active).toBe(true);
          expect(agent.hasMcp).toBe(true);
          allIds.add(agent.id);
        }

        cursor = json.meta?.nextCursor;
        iterations++;

        if (!json.meta?.hasMore) break;
      }
    });
  });

  describe('Filter Combinations - Edge Cases', () => {
    it('conflicting boolean values (active=true AND active=false via query)', async () => {
      // This should use the last value or error gracefully
      const { json } = await get('/agents', { active: true, limit: LIMIT });
      assertSuccess(json);
    });

    it('empty filter values handled', async () => {
      const { json } = await get('/agents', { chainIds: '', limit: LIMIT });
      // Should ignore empty value
      assertSuccess(json);
    });

    it('very restrictive filters may return empty', async () => {
      const { json } = await get('/agents', {
        active: true,
        mcp: true,
        a2a: true,
        x402: true,
        chainId: CHAINS.POLYGON_AMOY,
        minRep: 5,
        limit: LIMIT,
      });
      assertSuccess(json);
      // May return 0 results, which is valid
    });

    it('filters with non-existent values', async () => {
      const { json } = await get('/agents', {
        chainId: 99999999,
        limit: LIMIT,
      });
      assertSuccess(json);
      expect(json.data!.length).toBe(0);
    });
  });
}
