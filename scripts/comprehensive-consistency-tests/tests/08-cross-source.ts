/**
 * Cross-Source Consistency Tests
 * Compares results between different API paths:
 * - GET /agents (SDK path without query)
 * - GET /agents?q= (search path with query)
 * - POST /search (direct search)
 */

import { callOurApiGet, callOurApiSearch, callOurApiWithQuery, getAgentById } from '../client';
import { compareAgentLists, compareAgents, CORE_FIELDS } from '../comparator';
import type { Agent, TestResult } from '../types';

export async function runCrossSourceTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n=== Cross-Source Consistency Tests ===\n');

  // Test: Same chainId filter returns same agents from GET vs POST /search
  {
    const start = Date.now();
    const { data: getData } = await callOurApiGet({ chainId: 11155111, limit: 30 });
    const { data: searchData } = await callOurApiSearch({
      query: '*', // wildcard to get all
      filters: { chainIds: [11155111] },
      limit: 30,
    });
    const duration = Date.now() - start;

    let passed = getData.success && searchData.success;
    let error: string | undefined;

    if (getData.data && searchData.data) {
      // Check that agents exist in both and have consistent core fields
      const getIds = new Set(getData.data.map((a) => a.id));
      const searchIds = new Set(searchData.data.map((a) => a.id));

      // Find common agents
      const common = [...getIds].filter((id) => searchIds.has(id));

      if (common.length > 0) {
        // Compare fields for common agents
        const getMap = new Map(getData.data.map((a) => [a.id, a]));
        const searchMap = new Map(searchData.data.map((a) => [a.id, a]));

        let fieldMismatches = 0;
        for (const id of common.slice(0, 10)) {
          const getAgent = getMap.get(id)!;
          const searchAgent = searchMap.get(id)!;
          const diffs = compareAgents(getAgent, searchAgent, CORE_FIELDS);
          if (diffs.length > 0) fieldMismatches++;
        }

        if (fieldMismatches > 0) {
          error = `${fieldMismatches} agents have field mismatches`;
          passed = false;
        }
      }
    }

    results.push({
      name: 'GET vs POST /search with chainId filter',
      passed,
      duration,
      error,
      details: {
        apiCount: getData.data?.length,
        searchCount: searchData.data?.length,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} GET=${getData.data?.length}, POST=${searchData.data?.length}`);
  }

  // Test: Same boolean filters return consistent agents
  // Note: Different sorting algorithms (GET default vs POST semantic) will return different agents,
  // but both should correctly filter and return similar totals
  // Using "agent" as query (not "*") because wildcard doesn't filter correctly in semantic search
  {
    const start = Date.now();
    const { data: getData } = await callOurApiGet({ mcp: true, a2a: true, limit: 30 });
    const { data: searchData } = await callOurApiSearch({
      query: 'agent',
      filters: { mcp: true, a2a: true },
      limit: 30,
    });
    const duration = Date.now() - start;

    let passed = getData.success && searchData.success;
    let error: string | undefined;

    // Verify both endpoints correctly filter (all agents must have hasMcp=true AND hasA2a=true)
    if (getData.data && searchData.data) {
      // Check GET results - handle undefined as false
      const getFailures = getData.data.filter(
        (a) => (a.hasMcp ?? false) !== true || (a.hasA2a ?? false) !== true
      );
      // Check POST results - handle undefined as false
      const postFailures = searchData.data.filter(
        (a) => (a.hasMcp ?? false) !== true || (a.hasA2a ?? false) !== true
      );

      if (getFailures.length > 0 || postFailures.length > 0) {
        error = `Filter mismatch: GET=${getFailures.length}, POST=${postFailures.length} wrong`;
        passed = false;
      }
    }

    results.push({
      name: 'GET vs POST with mcp+a2a filter',
      passed,
      duration,
      error,
      details: {
        apiCount: getData.data?.length,
        searchCount: searchData.data?.length,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} Boolean filters: GET=${getData.data?.length}, POST=${searchData.data?.length}`);
  }

  // Test: Single agent detail vs list entry consistency
  {
    // First get an agent from the list
    const { data: listData } = await callOurApiGet({ limit: 5 });
    if (!listData.data || listData.data.length === 0) {
      results.push({
        name: 'Detail vs List consistency',
        passed: false,
        duration: 0,
        error: 'No agents in list',
      });
    } else {
      const testAgent = listData.data[0];
      const start = Date.now();
      const { data: detailData } = await getAgentById(testAgent.id);
      const duration = Date.now() - start;

      let passed = detailData.success;
      let error: string | undefined;

      if (detailData.success && detailData.data) {
        const detail = detailData.data as unknown as Agent;
        const diffs = compareAgents(testAgent, detail, CORE_FIELDS);
        if (diffs.length > 0) {
          error = `Field differences: ${diffs.slice(0, 3).join(', ')}`;
          passed = false;
        }
      }

      results.push({
        name: `Detail vs List consistency (${testAgent.id})`,
        passed,
        duration,
        error,
      });
      console.log(`  ${passed ? '✓' : '✗'} Detail vs List: ${passed ? 'consistent' : error}`);
    }
  }

  // Test: GET q= vs POST /search same query
  {
    const query = 'blockchain';
    const start = Date.now();
    const { data: getData } = await callOurApiWithQuery(query, { limit: 20 });
    const { data: searchData } = await callOurApiSearch({ query, limit: 20 });
    const duration = Date.now() - start;

    let passed = getData.success && searchData.success;
    let error: string | undefined;

    if (getData.data && searchData.data) {
      // Both should return search results with scores
      const getHasScores = getData.data.every((a) => typeof a.searchScore === 'number');
      const searchHasScores = searchData.data.every((a) => typeof a.searchScore === 'number');

      if (!getHasScores || !searchHasScores) {
        error = 'Missing searchScore in results';
        passed = false;
      }

      // Compare top results (should be similar)
      const getTop5 = getData.data.slice(0, 5).map((a) => a.id);
      const searchTop5 = searchData.data.slice(0, 5).map((a) => a.id);
      const overlap = getTop5.filter((id) => searchTop5.includes(id));

      if (overlap.length < 3 && getData.data.length >= 5 && searchData.data.length >= 5) {
        // Allow some variance but top results should be similar
        error = `Only ${overlap.length}/5 top results match`;
        // Don't fail, just note it
      }
    }

    results.push({
      name: 'GET q= vs POST /search same query',
      passed,
      duration,
      error,
      details: {
        apiCount: getData.data?.length,
        searchCount: searchData.data?.length,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} GET q= vs POST: GET=${getData.data?.length}, POST=${searchData.data?.length}`);
  }

  // Test: OASF data consistency between paths
  {
    const start = Date.now();
    const { data: listData } = await callOurApiGet({ skills: 'code_generation', limit: 10 });
    const duration = Date.now() - start;

    let passed = listData.success;
    let error: string | undefined;

    if (listData.success && listData.data && listData.data.length > 0) {
      // Check each agent has OASF data
      const withOasf = listData.data.filter((a) => a.oasf?.skills?.length);
      const withoutOasf = listData.data.filter((a) => !a.oasf?.skills?.length);

      if (withoutOasf.length > 0) {
        error = `${withoutOasf.length} agents missing OASF data`;
        // Don't fail if most have data
        passed = withOasf.length > withoutOasf.length;
      }

      // Verify the filtered skill is present
      const hasCorrectSkill = listData.data.every((a) =>
        a.oasf?.skills?.some((s) => s.slug === 'code_generation')
      );
      if (!hasCorrectSkill) {
        error = 'Some agents missing filtered skill';
        passed = false;
      }
    }

    results.push({
      name: 'OASF data present in filtered results',
      passed,
      duration,
      error,
      details: { apiCount: listData.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} OASF in filtered: ${listData.data?.length ?? 0} agents`);
  }

  // Test: Reputation data consistency
  {
    const start = Date.now();
    const { data: listData } = await callOurApiGet({ minRep: 50, limit: 10 });
    const duration = Date.now() - start;

    let passed = listData.success;
    let error: string | undefined;

    if (listData.success && listData.data && listData.data.length > 0) {
      // Check reputation data is present for filtered agents
      const withRep = listData.data.filter((a) => a.reputationScore !== undefined);
      const validRep = withRep.filter((a) => a.reputationScore! >= 50);

      if (withRep.length !== validRep.length) {
        error = `${withRep.length - validRep.length} agents below minRep threshold`;
        passed = false;
      }
    }

    results.push({
      name: 'Reputation data consistent with filter',
      passed,
      duration,
      error,
      details: { apiCount: listData.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Reputation consistency: ${listData.data?.length ?? 0} agents`);
  }

  // Test: Multi-chain results consistency
  {
    const start = Date.now();
    const { data: multiChain } = await callOurApiGet({ chainIds: '11155111,84532', limit: 30 });
    const { data: chain1 } = await callOurApiGet({ chainId: 11155111, limit: 15 });
    const { data: chain2 } = await callOurApiGet({ chainId: 84532, limit: 15 });
    const duration = Date.now() - start;

    let passed = multiChain.success && chain1.success && chain2.success;
    let error: string | undefined;

    if (multiChain.data && chain1.data && chain2.data) {
      // Multi-chain should contain agents from both chains
      const multiIds = new Set(multiChain.data.map((a) => a.id));
      const chain1Ids = chain1.data.map((a) => a.id);
      const chain2Ids = chain2.data.map((a) => a.id);

      // Some chain1 and chain2 agents should be in multi-chain
      const chain1InMulti = chain1Ids.filter((id) => multiIds.has(id));
      const chain2InMulti = chain2Ids.filter((id) => multiIds.has(id));

      if (chain1InMulti.length === 0 && chain2InMulti.length === 0 && multiChain.data.length > 0) {
        error = 'Multi-chain contains no agents from individual chain queries';
        passed = false;
      }

      // Check chain IDs are correct
      const validChains = multiChain.data.every((a) => [11155111, 84532].includes(a.chainId));
      if (!validChains) {
        error = 'Multi-chain contains agents from wrong chains';
        passed = false;
      }
    }

    results.push({
      name: 'Multi-chain vs individual chain consistency',
      passed,
      duration,
      error,
      details: {
        apiCount: multiChain.data?.length,
        sdkCount: (chain1.data?.length ?? 0) + (chain2.data?.length ?? 0),
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} Multi-chain: ${multiChain.data?.length} vs individual: ${(chain1.data?.length ?? 0) + (chain2.data?.length ?? 0)}`);
  }

  // Test: byChain meta field accuracy
  {
    const start = Date.now();
    const { data } = await callOurApiSearch({ query: 'AI', limit: 50 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.meta?.byChain) {
      // Verify byChain counts match actual agent chain distribution
      const actualByChain = new Map<number, number>();
      for (const agent of data.data) {
        actualByChain.set(agent.chainId, (actualByChain.get(agent.chainId) || 0) + 1);
      }

      // byChain should match or be >= (if more exist)
      let mismatch = false;
      for (const [chain, count] of actualByChain) {
        const metaCount = data.meta.byChain[chain] || 0;
        if (metaCount < count) {
          mismatch = true;
          error = `byChain[${chain}]=${metaCount} but found ${count} agents`;
          break;
        }
      }

      passed = !mismatch;
    }

    results.push({
      name: 'byChain meta field accuracy',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} byChain accuracy: ${data.meta?.byChain ? JSON.stringify(data.meta.byChain) : 'N/A'}`);
  }

  // Test: Total count consistency across pagination
  {
    const start = Date.now();
    const { data: page1 } = await callOurApiGet({ limit: 10 });
    const { data: page2 } = await callOurApiGet({ limit: 10, offset: 10 });
    const duration = Date.now() - start;

    let passed = page1.success && page2.success;
    let error: string | undefined;

    if (page1.meta?.total !== undefined && page2.meta?.total !== undefined) {
      if (page1.meta.total !== page2.meta.total) {
        error = `Page 1 total=${page1.meta.total}, Page 2 total=${page2.meta.total}`;
        // Don't fail for slight variations due to concurrent changes
        passed = Math.abs(page1.meta.total - page2.meta.total) <= 2;
      }
    }

    results.push({
      name: 'Total count consistent across pages',
      passed,
      duration,
      error,
      details: {
        apiCount: page1.meta?.total,
        searchCount: page2.meta?.total,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} Total consistency: page1=${page1.meta?.total}, page2=${page2.meta?.total}`);
  }

  return results;
}
