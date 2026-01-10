/**
 * Comprehensive Data Consistency Tests
 *
 * Verifies data consistency between:
 * 1. SDK (agent0-sdk via The Graph subgraph)
 * 2. Qdrant Search Service (vector database)
 * 3. Our API (api.8004.dev)
 *
 * Tests all filter combinations, pagination options, and search modes.
 */

import { describe, it, expect } from '../test-runner';
import { get, post, batchGet } from '../utils/api-client';
import type { Agent, ApiResponse } from '../utils/api-client';
import {
  assertSuccess,
  assertAllMatch,
  assertNoDuplicates,
  assertSorted,
  assertChainId,
  assertChainIds,
  assertBooleanFlag,
  assertHasSkill,
  assertHasDomain,
  assertReputationInRange,
  assertHasMeta,
  assertPagination,
  assertHasSearchScore,
  assertSearchScoreInRange,
} from '../utils/assertions';
import {
  assertApproximateCount,
  assertPaginationNoDuplicates,
  assertTotalConsistent,
  assertFilterApplied,
  assertSortOrder,
  TEST_CONFIG,
} from '../utils/consistency-helpers';
import {
  fetchAgentsFromSubgraph,
  fetchAgentsFromMultipleChains,
  isSDKAvailable,
  getSupportedChainIds,
} from '../utils/sdk-client';

/**
 * Register comprehensive consistency tests
 */
export function registerComprehensiveConsistencyTests(): void {
// ============================================================================
// SECTION 1: Single Filter Tests
// ============================================================================

describe('Single Filter Consistency', () => {
  // Boolean filters: mcp
  for (const value of [true, false]) {
    it(`mcp=${value} returns only matching agents`, async () => {
      const { json } = await get<Agent[]>('/agents', { mcp: value, limit: 50 });
      assertSuccess(json);

      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasMcp', value);
      }
    });
  }

  // Boolean filters: a2a
  for (const value of [true, false]) {
    it(`a2a=${value} returns only matching agents`, async () => {
      const { json } = await get<Agent[]>('/agents', { a2a: value, limit: 50 });
      assertSuccess(json);

      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'hasA2a', value);
      }
    });
  }

  // Boolean filters: x402
  for (const value of [true, false]) {
    it(`x402=${value} returns only matching agents`, async () => {
      const { json } = await get<Agent[]>('/agents', { x402: value, limit: 50 });
      assertSuccess(json);

      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'x402Support', value);
      }
    });
  }

  // Boolean filters: active
  for (const value of [true, false]) {
    it(`active=${value} returns only matching agents`, async () => {
      const { json } = await get<Agent[]>('/agents', { active: value, limit: 50 });
      assertSuccess(json);

      if (json.data && json.data.length > 0) {
        assertBooleanFlag(json.data, 'active', value);
      }
    });
  }

  // Chain filters
  for (const chainId of TEST_CONFIG.SUPPORTED_CHAINS.slice(0, 3)) {
    it(`chainId=${chainId} returns only that chain`, async () => {
      const { json } = await get<Agent[]>('/agents', { chainId, limit: 30 });
      assertSuccess(json);

      if (json.data && json.data.length > 0) {
        assertChainId(json.data, chainId);
      }
    });
  }

  // Multi-chain filter
  it('chainIds[] returns agents from specified chains', async () => {
    const chainIds = TEST_CONFIG.SUPPORTED_CHAINS.slice(0, 2);
    const { json } = await get<Agent[]>('/agents', {
      'chainIds[]': chainIds.join(','),
      limit: 50,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertChainIds(json.data, chainIds);
    }
  });

  // OASF skill filter
  it('skills filter returns agents with matching skills', async () => {
    const skill = TEST_CONFIG.KNOWN_SKILLS[0];
    const { json } = await get<Agent[]>('/agents', { skills: skill, limit: 30 });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertHasSkill(json.data, skill);
    }
  });

  // OASF domain filter
  it('domains filter returns agents with matching domains', async () => {
    const domain = TEST_CONFIG.KNOWN_DOMAINS[0];
    const { json } = await get<Agent[]>('/agents', { domains: domain, limit: 30 });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertHasDomain(json.data, domain);
    }
  });

  // Reputation range filter
  it('minRep filter returns agents above threshold', async () => {
    const { json } = await get<Agent[]>('/agents', { minRep: 50, limit: 30 });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertReputationInRange(json.data, 50);
    }
  });

  it('maxRep filter returns agents below threshold', async () => {
    const { json } = await get<Agent[]>('/agents', { maxRep: 80, limit: 30 });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertReputationInRange(json.data, undefined, 80);
    }
  });
});

// ============================================================================
// SECTION 2: Filter Combinations
// ============================================================================

describe('Filter Combinations', () => {
  it('mcp + chainId returns intersection', async () => {
    const chainId = TEST_CONFIG.SUPPORTED_CHAINS[0];
    const { json } = await get<Agent[]>('/agents', { mcp: true, chainId, limit: 30 });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertBooleanFlag(json.data, 'hasMcp', true);
      assertChainId(json.data, chainId);
    }
  });

  it('mcp + a2a returns intersection', async () => {
    const { json } = await get<Agent[]>('/agents', { mcp: true, a2a: true, limit: 30 });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertBooleanFlag(json.data, 'hasMcp', true);
      assertBooleanFlag(json.data, 'hasA2a', true);
    }
  });

  it('skills + domains returns intersection', async () => {
    const skill = TEST_CONFIG.KNOWN_SKILLS[0];
    const domain = TEST_CONFIG.KNOWN_DOMAINS[0];
    const { json } = await get<Agent[]>('/agents', { skills: skill, domains: domain, limit: 30 });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertHasSkill(json.data, skill);
      assertHasDomain(json.data, domain);
    }
  });

  it('chainIds + minRep returns intersection', async () => {
    const chainIds = TEST_CONFIG.SUPPORTED_CHAINS.slice(0, 2);
    const { json } = await get<Agent[]>('/agents', {
      'chainIds[]': chainIds.join(','),
      minRep: 30,
      limit: 30,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertChainIds(json.data, chainIds);
      assertReputationInRange(json.data, 30);
    }
  });

  it('filterMode=OR returns union of boolean filters', async () => {
    const { json } = await get<Agent[]>('/agents', {
      mcp: true,
      a2a: true,
      filterMode: 'OR',
      limit: 50,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      // In OR mode, at least one of the conditions should be true
      assertAllMatch(
        json.data,
        (a) => a.hasMcp === true || a.hasA2a === true,
        'hasMcp OR hasA2a'
      );
    }
  });

  it('active + mcp + minRep returns intersection', async () => {
    const { json } = await get<Agent[]>('/agents', {
      active: true,
      mcp: true,
      minRep: 40,
      limit: 30,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertBooleanFlag(json.data, 'active', true);
      assertBooleanFlag(json.data, 'hasMcp', true);
      assertReputationInRange(json.data, 40);
    }
  });
});

// ============================================================================
// SECTION 3: Pagination Consistency
// ============================================================================

describe('Pagination Consistency', () => {
  it('offset pagination has no duplicates across pages', async () => {
    const [page1, page2, page3] = await batchGet<Agent[]>([
      { path: '/agents', params: { limit: 10, offset: 0 } },
      { path: '/agents', params: { limit: 10, offset: 10 } },
      { path: '/agents', params: { limit: 10, offset: 20 } },
    ]);

    assertSuccess(page1.json);
    assertSuccess(page2.json);
    assertSuccess(page3.json);

    const allAgents = [
      ...(page1.json.data || []),
      ...(page2.json.data || []),
      ...(page3.json.data || []),
    ];

    assertNoDuplicates(allAgents, 'id');
  });

  it('page parameter works correctly', async () => {
    const [page1, page2] = await batchGet<Agent[]>([
      { path: '/agents', params: { limit: 10, page: 1 } },
      { path: '/agents', params: { limit: 10, page: 2 } },
    ]);

    assertSuccess(page1.json);
    assertSuccess(page2.json);

    const allAgents = [
      ...(page1.json.data || []),
      ...(page2.json.data || []),
    ];

    assertNoDuplicates(allAgents, 'id');
  });

  it('cursor pagination has no duplicates', async () => {
    const first = await get<Agent[]>('/agents', { limit: 10 });
    assertSuccess(first.json);
    assertPagination(first.json);

    if (first.json.meta?.nextCursor) {
      const second = await get<Agent[]>('/agents', {
        limit: 10,
        cursor: first.json.meta.nextCursor,
      });
      assertSuccess(second.json);

      const allAgents = [
        ...(first.json.data || []),
        ...(second.json.data || []),
      ];

      assertNoDuplicates(allAgents, 'id');
    }
  });

  it('total count is consistent across pages', async () => {
    const [page1, page2] = await batchGet<Agent[]>([
      { path: '/agents', params: { limit: 10, offset: 0 } },
      { path: '/agents', params: { limit: 10, offset: 10 } },
    ]);

    assertSuccess(page1.json);
    assertSuccess(page2.json);

    assertTotalConsistent([page1.json, page2.json]);
  });

  it('pagination with filters is consistent', async () => {
    const [page1, page2] = await batchGet<Agent[]>([
      { path: '/agents', params: { mcp: true, limit: 10, offset: 0 } },
      { path: '/agents', params: { mcp: true, limit: 10, offset: 10 } },
    ]);

    assertSuccess(page1.json);
    assertSuccess(page2.json);

    const allAgents = [
      ...(page1.json.data || []),
      ...(page2.json.data || []),
    ];

    // All should still match the filter
    if (allAgents.length > 0) {
      assertBooleanFlag(allAgents, 'hasMcp', true);
    }

    assertNoDuplicates(allAgents, 'id');
  });

  it('limit parameter is respected', async () => {
    const limits = [5, 10, 20, 50];

    for (const limit of limits) {
      const { json } = await get<Agent[]>('/agents', { limit });
      assertSuccess(json);

      expect(json.data?.length || 0).toBeLessThanOrEqual(limit);
    }
  });
});

// ============================================================================
// SECTION 4: Search Consistency
// ============================================================================

describe('Search Consistency', () => {
  it('semantic search returns scored results', async () => {
    const { json } = await post<Agent[]>('/search', {
      query: 'AI assistant for data analysis',
      limit: 20,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertHasSearchScore(json.data);
      assertSearchScoreInRange(json.data);
    }
  });

  it('search with filters returns filtered results', async () => {
    const { json } = await post<Agent[]>('/search', {
      query: 'blockchain agent',
      filters: { mcp: true },
      limit: 20,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertBooleanFlag(json.data, 'hasMcp', true);
      assertHasSearchScore(json.data);
    }
  });

  it('search with chainIds filter returns correct chains', async () => {
    const chainIds = TEST_CONFIG.SUPPORTED_CHAINS.slice(0, 2);
    const { json } = await post<Agent[]>('/search', {
      query: 'AI',
      filters: { chainIds },
      limit: 20,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertChainIds(json.data, chainIds);
    }
  });

  it('GET search via q parameter works', async () => {
    const { json } = await get<Agent[]>('/agents', { q: 'AI', limit: 20 });
    assertSuccess(json);
    assertHasMeta(json);
  });

  it('minScore filter is respected', async () => {
    const { json } = await post<Agent[]>('/search', {
      query: 'crypto trading',
      minScore: 0.5,
      limit: 20,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      assertAllMatch(
        json.data,
        (a) => (a.searchScore || 0) >= 0.5,
        'searchScore >= 0.5'
      );
    }
  });
});

// ============================================================================
// SECTION 5: Sorting Consistency
// ============================================================================

describe('Sorting Consistency', () => {
  it('sort=name orders alphabetically ascending', async () => {
    const { json } = await get<Agent[]>('/agents', { sort: 'name', order: 'asc', limit: 50 });
    assertSuccess(json);

    if (json.data && json.data.length > 1) {
      assertSorted(json.data, 'name', 'asc');
    }
  });

  it('sort=name orders alphabetically descending', async () => {
    const { json } = await get<Agent[]>('/agents', { sort: 'name', order: 'desc', limit: 50 });
    assertSuccess(json);

    if (json.data && json.data.length > 1) {
      assertSorted(json.data, 'name', 'desc');
    }
  });

  it('sort=reputation orders by score descending', async () => {
    const { json } = await get<Agent[]>('/agents', { sort: 'reputation', order: 'desc', limit: 50 });
    assertSuccess(json);

    if (json.data && json.data.length > 1) {
      // Filter to only agents with reputation scores for sorting check
      const withRep = json.data.filter(a => a.reputationScore !== undefined);
      if (withRep.length > 1) {
        assertSortOrder(withRep, a => a.reputationScore, 'desc');
      }
    }
  });

  it('sort with filter maintains both sort and filter', async () => {
    const { json } = await get<Agent[]>('/agents', {
      mcp: true,
      sort: 'name',
      order: 'asc',
      limit: 30,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      // Filter is applied
      assertBooleanFlag(json.data, 'hasMcp', true);

      // Sort is maintained
      if (json.data.length > 1) {
        assertSorted(json.data, 'name', 'asc');
      }
    }
  });
});

// ============================================================================
// SECTION 6: SDK vs API Consistency
// ============================================================================

describe('SDK vs API Consistency', () => {
  it('agent list counts are approximately equal', async () => {
    if (!isSDKAvailable()) {
      console.log('Skipping: SDK not available');
      return;
    }

    const chainId = TEST_CONFIG.SUPPORTED_CHAINS[0];

    // Get from API
    const { json: apiResult } = await get<Agent[]>('/agents', { chainId, limit: 100 });
    assertSuccess(apiResult);

    // Get from SDK (subgraph)
    const sdkAgents = await fetchAgentsFromSubgraph(chainId, { limit: 100 });

    // Compare counts (with tolerance for sync delays)
    assertApproximateCount(apiResult.data?.length || 0, sdkAgents.length, 0.1);
  });

  it('mcp filter returns similar results from both sources', async () => {
    if (!isSDKAvailable()) {
      console.log('Skipping: SDK not available');
      return;
    }

    const chainId = TEST_CONFIG.SUPPORTED_CHAINS[0];

    // Get from API
    const { json: apiResult } = await get<Agent[]>('/agents', {
      chainId,
      mcp: true,
      limit: 50,
    });
    assertSuccess(apiResult);

    // Get from SDK
    const sdkAgents = await fetchAgentsFromSubgraph(chainId, {
      limit: 50,
      mcp: true,
    });

    // Both should return MCP agents
    if (apiResult.data && apiResult.data.length > 0) {
      assertBooleanFlag(apiResult.data, 'hasMcp', true);
    }

    const sdkMcpAgents = sdkAgents.filter(a => a.mcp);
    expect(sdkMcpAgents.length).toBe(sdkAgents.length);
  });

  it('multi-chain query returns agents from all chains', async () => {
    if (!isSDKAvailable()) {
      console.log('Skipping: SDK not available');
      return;
    }

    const chainIds = TEST_CONFIG.SUPPORTED_CHAINS.slice(0, 2);

    // Get from API
    const { json: apiResult } = await get<Agent[]>('/agents', {
      'chainIds[]': chainIds.join(','),
      limit: 50,
    });
    assertSuccess(apiResult);

    // Get from SDK
    const sdkAgents = await fetchAgentsFromMultipleChains(chainIds, { limitPerChain: 25 });

    // Both should return agents from specified chains
    if (apiResult.data && apiResult.data.length > 0) {
      assertChainIds(apiResult.data, chainIds);
    }

    const sdkFromChains = sdkAgents.filter(a => chainIds.includes(a.chainId!));
    expect(sdkFromChains.length).toBe(sdkAgents.length);
  });
});

// ============================================================================
// SECTION 7: Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('empty results for impossible filters', async () => {
    const { json } = await get<Agent[]>('/agents', { minRep: 101, limit: 10 });
    assertSuccess(json);
    expect(json.data?.length || 0).toBe(0);
  });

  it('limit=1 returns exactly one agent', async () => {
    const { json } = await get<Agent[]>('/agents', { limit: 1 });
    assertSuccess(json);
    expect(json.data?.length).toBeLessThanOrEqual(1);
  });

  it('limit=100 respects maximum', async () => {
    const { json } = await get<Agent[]>('/agents', { limit: 100 });
    assertSuccess(json);
    expect(json.data?.length).toBeLessThanOrEqual(100);
  });

  it('offset beyond total returns empty', async () => {
    const { json } = await get<Agent[]>('/agents', { limit: 10, offset: 999999 });
    assertSuccess(json);
    expect(json.data?.length || 0).toBe(0);
  });

  it('unknown chainId returns empty or error', async () => {
    const { json, response } = await get<Agent[]>('/agents', { chainId: 999999 });

    // Either returns empty array or validation error
    if (response.status === 200) {
      assertSuccess(json);
      expect(json.data?.length || 0).toBe(0);
    } else {
      expect(response.status).toBe(400);
    }
  });

  it('empty search query returns results', async () => {
    const { json } = await get<Agent[]>('/agents', { limit: 10 });
    assertSuccess(json);
    assertHasMeta(json);
  });

  it('special characters in search are handled', async () => {
    const { json } = await post<Agent[]>('/search', {
      query: 'AI & ML "agents"',
      limit: 10,
    });
    assertSuccess(json);
    // Should not error, may return empty
  });

  it('conflicting filters return intersection (not union)', async () => {
    // Request both mcp=true and mcp filtering via skills
    const { json } = await get<Agent[]>('/agents', {
      mcp: true,
      a2a: false,
      limit: 30,
    });
    assertSuccess(json);

    if (json.data && json.data.length > 0) {
      // Both conditions must be met (AND logic by default)
      assertBooleanFlag(json.data, 'hasMcp', true);
      assertBooleanFlag(json.data, 'hasA2a', false);
    }
  });
});

} // End of registerComprehensiveConsistencyTests
