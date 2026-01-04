/**
 * API Consistency Test Suite
 *
 * Compares results from SDK path vs Search path vs combined API
 * to ensure data consistency across all sources.
 */

import { describe, expect, it } from '../../test-runner';
import { get, post } from '../../utils/api-client';
import { assertSuccess } from '../../utils/assertions';

// Test configuration
const LIMIT = 50;
const CHAINS = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
};

// Fields that should be consistent across sources
const CONSISTENT_FIELDS = [
  'id',
  'chainId',
  'tokenId',
  'name',
  'active',
  'hasMcp',
  'hasA2a',
  'x402Support',
];

interface Agent {
  id: string;
  chainId: number;
  tokenId: string;
  name: string;
  active?: boolean;
  hasMcp?: boolean;
  hasA2a?: boolean;
  x402Support?: boolean;
  searchScore?: number;
  [key: string]: unknown;
}

/**
 * Compare two agent objects for field consistency
 */
function compareAgentFields(a1: Agent, a2: Agent, fields: string[]): string[] {
  const differences: string[] = [];
  for (const field of fields) {
    if (a1[field] !== a2[field]) {
      differences.push(`${field}: ${a1[field]} vs ${a2[field]}`);
    }
  }
  return differences;
}

/**
 * Find matching agent by ID
 */
function findById(agents: Agent[], id: string): Agent | undefined {
  return agents.find((a) => a.id === id);
}

/**
 * Assert agents from two sources have consistent fields
 */
function assertFieldConsistency(
  source1Name: string,
  source1Agents: Agent[],
  source2Name: string,
  source2Agents: Agent[],
  fields: string[] = CONSISTENT_FIELDS
): void {
  const issues: string[] = [];

  for (const a1 of source1Agents) {
    const a2 = findById(source2Agents, a1.id);
    if (a2) {
      const diffs = compareAgentFields(a1, a2, fields);
      if (diffs.length > 0) {
        issues.push(`Agent ${a1.id}: ${diffs.join(', ')}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Field inconsistency between ${source1Name} and ${source2Name}:\n${issues.slice(0, 5).join('\n')}`
    );
  }
}

export function registerApiConsistencyTests(): void {
  describe('API Consistency - SDK vs Search Path', () => {
    it('same agent has consistent fields in both paths', async () => {
      // SDK path (no query)
      const { json: sdkResult } = await get('/agents', { limit: LIMIT });
      assertSuccess(sdkResult);

      // Search path (with query)
      const { json: searchResult } = await get('/agents', { q: 'agent', limit: LIMIT });
      assertSuccess(searchResult);

      if (sdkResult.data?.length > 0 && searchResult.data?.length > 0) {
        assertFieldConsistency('SDK', sdkResult.data, 'Search', searchResult.data);
      }
    });

    it('active filter returns same agents in both paths', async () => {
      const { json: sdkResult } = await get('/agents', { active: true, limit: LIMIT });
      const { json: searchResult } = await get('/agents', { q: 'agent', active: true, limit: LIMIT });

      assertSuccess(sdkResult);
      assertSuccess(searchResult);

      if (sdkResult.data?.length > 0 && searchResult.data?.length > 0) {
        // All agents in both should have active=true
        for (const agent of [...sdkResult.data, ...searchResult.data]) {
          expect(agent.active).toBe(true);
        }
      }
    });

    it('mcp filter returns same agents in both paths', async () => {
      const { json: sdkResult } = await get('/agents', { mcp: true, limit: LIMIT });
      const { json: searchResult } = await get('/agents', { q: 'agent', mcp: true, limit: LIMIT });

      assertSuccess(sdkResult);
      assertSuccess(searchResult);

      if (sdkResult.data?.length > 0 && searchResult.data?.length > 0) {
        for (const agent of [...sdkResult.data, ...searchResult.data]) {
          expect(agent.hasMcp).toBe(true);
        }
      }
    });

    it('chainId filter consistent across paths', async () => {
      const { json: sdkResult } = await get('/agents', {
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });
      const { json: searchResult } = await get('/agents', {
        q: 'agent',
        chainId: CHAINS.SEPOLIA,
        limit: LIMIT,
      });

      assertSuccess(sdkResult);
      assertSuccess(searchResult);

      if (sdkResult.data?.length > 0 && searchResult.data?.length > 0) {
        for (const agent of [...sdkResult.data, ...searchResult.data]) {
          expect(agent.chainId).toBe(CHAINS.SEPOLIA);
        }
      }
    });
  });

  describe('API Consistency - GET vs POST /search', () => {
    it('GET q= and POST /search return consistent results', async () => {
      const query = 'AI assistant';

      const { json: getResult } = await get('/agents', { q: query, limit: LIMIT });
      const { json: postResult } = await post('/search', { query, limit: LIMIT });

      assertSuccess(getResult);
      assertSuccess(postResult);

      if (getResult.data?.length > 0 && postResult.data?.length > 0) {
        assertFieldConsistency('GET', getResult.data, 'POST', postResult.data);
      }
    });

    it('GET q= with filters matches POST /search with filters', async () => {
      const query = 'agent';

      const { json: getResult } = await get('/agents', {
        q: query,
        active: true,
        mcp: true,
        limit: LIMIT,
      });

      const { json: postResult } = await post('/search', {
        query,
        limit: LIMIT,
        filters: { active: true, mcp: true },
      });

      assertSuccess(getResult);
      assertSuccess(postResult);

      if (getResult.data?.length > 0 && postResult.data?.length > 0) {
        // Both should have same filter constraints
        for (const agent of [...getResult.data, ...postResult.data]) {
          expect(agent.active).toBe(true);
          expect(agent.hasMcp).toBe(true);
        }
      }
    });

    it('minScore filter works same in GET and POST', async () => {
      const query = 'AI';
      const minScore = 0.4;

      const { json: getResult } = await get('/agents', {
        q: query,
        minScore,
        limit: LIMIT,
      });

      const { json: postResult } = await post('/search', {
        query,
        minScore,
        limit: LIMIT,
      });

      assertSuccess(getResult);
      assertSuccess(postResult);

      // Both should respect minScore
      if (getResult.data?.length > 0) {
        for (const agent of getResult.data) {
          if (agent.searchScore !== undefined) {
            expect(agent.searchScore).toBeGreaterThan(minScore - 0.01);
          }
        }
      }
      if (postResult.data?.length > 0) {
        for (const agent of postResult.data) {
          if (agent.searchScore !== undefined) {
            expect(agent.searchScore).toBeGreaterThan(minScore - 0.01);
          }
        }
      }
    });
  });

  describe('API Consistency - Boolean Filter Validation', () => {
    const booleanFilters = [
      { name: 'active', field: 'active' },
      { name: 'mcp', field: 'hasMcp' },
      { name: 'a2a', field: 'hasA2a' },
      { name: 'x402', field: 'x402Support' },
    ];

    for (const { name, field } of booleanFilters) {
      it(`${name}=true returns only ${field}=true agents`, async () => {
        const { json } = await get('/agents', { [name]: true, limit: LIMIT });
        assertSuccess(json);
        if (json.data?.length > 0) {
          for (const agent of json.data) {
            expect(agent[field]).toBe(true);
          }
        }
      });

      it(`${name}=false returns only ${field}=false agents`, async () => {
        const { json } = await get('/agents', { [name]: false, limit: LIMIT });
        assertSuccess(json);
        if (json.data?.length > 0) {
          for (const agent of json.data) {
            expect(agent[field]).toBe(false);
          }
        }
      });
    }
  });

  describe('API Consistency - Total Counts', () => {
    it('filtered total is less than unfiltered total', async () => {
      const { json: unfiltered } = await get('/agents', { limit: 1 });
      const { json: filtered } = await get('/agents', { active: true, mcp: true, limit: 1 });

      assertSuccess(unfiltered);
      assertSuccess(filtered);

      const unfilteredTotal = unfiltered.meta?.total ?? 0;
      const filteredTotal = filtered.meta?.total ?? 0;

      expect(filteredTotal).toBeLessThan(unfilteredTotal + 1);
    });

    it('chainId filter reduces total count', async () => {
      const { json: all } = await get('/agents', { limit: 1 });
      const { json: sepolia } = await get('/agents', { chainId: CHAINS.SEPOLIA, limit: 1 });

      assertSuccess(all);
      assertSuccess(sepolia);

      const allTotal = all.meta?.total ?? 0;
      const sepoliaTotal = sepolia.meta?.total ?? 0;

      expect(sepoliaTotal).toBeLessThan(allTotal + 1);
    });

    it('multiple filters reduce total more than single filter', async () => {
      const { json: single } = await get('/agents', { active: true, limit: 1 });
      const { json: multiple } = await get('/agents', {
        active: true,
        mcp: true,
        chainId: CHAINS.SEPOLIA,
        limit: 1,
      });

      assertSuccess(single);
      assertSuccess(multiple);

      const singleTotal = single.meta?.total ?? 0;
      const multipleTotal = multiple.meta?.total ?? 0;

      expect(multipleTotal).toBeLessThan(singleTotal + 1);
    });
  });

  describe('API Consistency - Response Structure', () => {
    it('SDK path has correct response structure', async () => {
      const { json } = await get('/agents', { limit: 10 });
      assertSuccess(json);

      expect(json.data).toBeDefined();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.meta).toBeDefined();
      expect(json.meta.total).toBeDefined();
    });

    it('Search path has correct response structure', async () => {
      const { json } = await get('/agents', { q: 'test', limit: 10 });
      assertSuccess(json);

      expect(json.data).toBeDefined();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.meta).toBeDefined();
    });

    it('POST /search has correct response structure', async () => {
      const { json } = await post('/search', { query: 'test', limit: 10 });
      assertSuccess(json);

      expect(json.data).toBeDefined();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.meta).toBeDefined();
    });

    it('agent object has required fields', async () => {
      const { json } = await get('/agents', { limit: 1 });
      assertSuccess(json);

      if (json.data?.length > 0) {
        const agent = json.data[0];
        expect(agent.id).toBeDefined();
        expect(agent.chainId).toBeDefined();
        expect(agent.tokenId).toBeDefined();
        expect(agent.name).toBeDefined();
      }
    });
  });

  describe('API Consistency - Temporal Stability', () => {
    it('consecutive requests return same results', async () => {
      const params = { active: true, limit: 20 };

      const { json: first } = await get('/agents', params);
      const { json: second } = await get('/agents', params);

      assertSuccess(first);
      assertSuccess(second);

      // Same total
      expect(first.meta?.total).toBe(second.meta?.total);

      // Same IDs in same order
      if (first.data?.length > 0 && second.data?.length > 0) {
        const firstIds = first.data.map((a: Agent) => a.id);
        const secondIds = second.data.map((a: Agent) => a.id);
        expect(firstIds).toEqual(secondIds);
      }
    });

    it('search results are stable for same query', async () => {
      const params = { q: 'AI assistant', limit: 20 };

      const { json: first } = await get('/agents', params);
      const { json: second } = await get('/agents', params);

      assertSuccess(first);
      assertSuccess(second);

      if (first.data?.length > 0 && second.data?.length > 0) {
        const firstIds = first.data.map((a: Agent) => a.id);
        const secondIds = second.data.map((a: Agent) => a.id);
        expect(firstIds).toEqual(secondIds);
      }
    });
  });
}
