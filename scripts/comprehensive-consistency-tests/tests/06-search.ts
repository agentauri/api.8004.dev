/**
 * Search Tests
 * Tests semantic search (POST /search) and GET with q= parameter
 */

import { callOurApiGet, callOurApiSearch, callOurApiWithQuery } from '../client';
import { compareAgentLists } from '../comparator';
import type { TestResult } from '../types';
import { SEARCH_QUERIES, ALL_FILTERS } from '../types';

export async function runSearchTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n=== Search Tests ===\n');

  // Test: GET with q= parameter for various queries
  for (const query of SEARCH_QUERIES.slice(0, 5)) {
    const start = Date.now();
    const { data } = await callOurApiWithQuery(query, { limit: 10 });
    const duration = Date.now() - start;

    const hasSearchScore = data.data?.every((a) => typeof a.searchScore === 'number') ?? true;
    const hasSearchMode = data.meta?.searchMode !== undefined;

    results.push({
      name: `GET q="${query}" returns scored results`,
      passed: data.success && hasSearchScore && hasSearchMode,
      duration,
      error: !hasSearchScore ? 'Missing searchScore' : (!hasSearchMode ? 'Missing searchMode' : undefined),
      details: {
        apiCount: data.data?.length,
        differences: [`searchMode: ${data.meta?.searchMode}`],
      },
    });
    console.log(`  ${data.success && hasSearchScore ? '✓' : '✗'} GET q="${query}": ${data.data?.length ?? 0} agents (mode: ${data.meta?.searchMode})`);
  }

  // Test: POST /search for various queries
  for (const query of SEARCH_QUERIES.slice(0, 5)) {
    const start = Date.now();
    const { data } = await callOurApiSearch({ query, limit: 10 });
    const duration = Date.now() - start;

    const hasSearchScore = data.data?.every((a) => typeof a.searchScore === 'number') ?? true;

    results.push({
      name: `POST /search query="${query}"`,
      passed: data.success && hasSearchScore,
      duration,
      error: !hasSearchScore ? 'Missing searchScore' : undefined,
      details: {
        apiCount: data.data?.length,
        differences: [`searchMode: ${data.meta?.searchMode}`],
      },
    });
    console.log(`  ${data.success && hasSearchScore ? '✓' : '✗'} POST search "${query}": ${data.data?.length ?? 0} agents`);
  }

  // Test: Search modes (semantic, name, auto)
  for (const searchMode of ALL_FILTERS.searchModes) {
    const start = Date.now();
    const { data } = await callOurApiWithQuery('AI assistant', { searchMode, limit: 10 });
    const duration = Date.now() - start;

    results.push({
      name: `Search mode: ${searchMode}`,
      passed: data.success,
      duration,
      details: {
        apiCount: data.data?.length,
        differences: [`actual mode: ${data.meta?.searchMode}`],
      },
    });
    console.log(`  ${data.success ? '✓' : '✗'} searchMode=${searchMode}: ${data.data?.length ?? 0} agents (actual: ${data.meta?.searchMode})`);
  }

  // Test: minScore filter
  for (const minScore of [0.3, 0.5, 0.7]) {
    const start = Date.now();
    const { data } = await callOurApiSearch({ query: 'crypto', minScore, limit: 20 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const belowMin = data.data.filter((a) => (a.searchScore ?? 0) < minScore);
      passed = belowMin.length === 0;
      if (!passed) {
        error = `${belowMin.length} agents have score < ${minScore}`;
      }
    }

    results.push({
      name: `minScore=${minScore} filter`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} minScore=${minScore}: ${data.data?.length ?? 0} agents`);
  }

  // Test: GET q= vs POST /search consistency
  {
    const query = 'data analysis';
    const start = Date.now();
    const { data: getData } = await callOurApiWithQuery(query, { limit: 20 });
    const { data: postData } = await callOurApiSearch({ query, limit: 20 });
    const duration = Date.now() - start;

    let passed = getData.success && postData.success;
    let error: string | undefined;

    if (getData.data && postData.data) {
      const comparison = compareAgentLists(getData.data, postData.data, 'GET', 'POST');
      passed = comparison.identical || comparison.matchedCount > 0;
      if (!comparison.identical && comparison.differences.length > 0) {
        error = comparison.differences[0];
      }
    }

    results.push({
      name: 'GET q= vs POST /search consistency',
      passed,
      duration,
      error,
      details: {
        apiCount: getData.data?.length,
        searchCount: postData.data?.length,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} GET vs POST: GET=${getData.data?.length}, POST=${postData.data?.length}`);
  }

  // Test: Search with chainId filter
  {
    const start = Date.now();
    const { data } = await callOurApiSearch({
      query: 'AI',
      filters: { chainIds: [11155111] },
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const wrongChain = data.data.filter((a) => a.chainId !== 11155111);
      passed = wrongChain.length === 0;
      if (!passed) {
        error = `${wrongChain.length} agents have wrong chainId`;
      }
    }

    results.push({
      name: 'Search with chainId filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Search + chainId: ${data.data?.length ?? 0} agents`);
  }

  // Test: Search with boolean filters
  {
    const start = Date.now();
    const { data } = await callOurApiSearch({
      query: 'helper',
      filters: { mcp: true },
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const noMcp = data.data.filter((a) => a.hasMcp !== true);
      passed = noMcp.length === 0;
      if (!passed) {
        error = `${noMcp.length} agents missing MCP`;
      }
    }

    results.push({
      name: 'Search with mcp=true filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Search + mcp: ${data.data?.length ?? 0} agents`);
  }

  // Test: Search with skills filter
  {
    const start = Date.now();
    const { data } = await callOurApiSearch({
      query: 'code',
      filters: { skills: ['code_generation'] },
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const noSkill = data.data.filter(
        (a) => !a.oasf?.skills?.some((s) => s.slug === 'code_generation')
      );
      passed = noSkill.length === 0;
      if (!passed) {
        error = `${noSkill.length} agents missing skill`;
      }
    }

    results.push({
      name: 'Search with skills filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Search + skills: ${data.data?.length ?? 0} agents`);
  }

  // Test: Search with domains filter
  {
    const start = Date.now();
    const { data } = await callOurApiSearch({
      query: 'finance',
      filters: { domains: ['finance'] },
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const noDomain = data.data.filter(
        (a) => !a.oasf?.domains?.some((d) => d.slug === 'finance')
      );
      passed = noDomain.length === 0;
      if (!passed) {
        error = `${noDomain.length} agents missing domain`;
      }
    }

    results.push({
      name: 'Search with domains filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Search + domains: ${data.data?.length ?? 0} agents`);
  }

  // Test: Search with filterMode=OR
  {
    const start = Date.now();
    const { data } = await callOurApiSearch({
      query: 'assistant',
      filters: {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
      },
      limit: 30,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        if (agent.hasMcp !== true && agent.hasA2a !== true) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents have neither MCP nor A2A`;
      }
    }

    results.push({
      name: 'Search with filterMode=OR',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Search + OR mode: ${data.data?.length ?? 0} agents`);
  }

  // Test: Search pagination with cursor
  {
    const start = Date.now();
    const { data: page1 } = await callOurApiSearch({ query: 'AI', limit: 5 });
    let page2Data = null;
    if (page1.meta?.nextCursor) {
      const { data } = await callOurApiSearch({
        query: 'AI',
        limit: 5,
        cursor: page1.meta.nextCursor,
      });
      page2Data = data;
    }
    const duration = Date.now() - start;

    let passed = page1.success;
    let overlap = 0;

    if (page1.data && page2Data?.data) {
      const page1Ids = new Set(page1.data.map((a) => a.id));
      overlap = page2Data.data.filter((a) => page1Ids.has(a.id)).length;
      passed = passed && overlap === 0;
    }

    results.push({
      name: 'Search pagination with cursor',
      passed,
      duration,
      error: overlap > 0 ? `${overlap} agents overlap` : undefined,
      details: {
        apiCount: page1.data?.length,
        searchCount: page2Data?.data?.length,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} Search pagination: page1=${page1.data?.length}, page2=${page2Data?.data?.length ?? 'N/A'}`);
  }

  // Test: Search with offset pagination
  {
    const start = Date.now();
    const { data: page1 } = await callOurApiSearch({ query: 'AI', limit: 5, offset: 0 });
    const { data: page2 } = await callOurApiSearch({ query: 'AI', limit: 5, offset: 5 });
    const duration = Date.now() - start;

    let passed = page1.success && page2.success;
    let overlap = 0;

    if (page1.data && page2.data) {
      const page1Ids = new Set(page1.data.map((a) => a.id));
      overlap = page2.data.filter((a) => page1Ids.has(a.id)).length;
      passed = passed && overlap === 0;
    }

    results.push({
      name: 'Search pagination with offset',
      passed,
      duration,
      error: overlap > 0 ? `${overlap} agents overlap` : undefined,
      details: {
        apiCount: page1.data?.length,
        searchCount: page2.data?.length,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} Search offset pagination: page1=${page1.data?.length}, page2=${page2.data?.length}`);
  }

  // Test: matchReasons present in search results
  {
    const start = Date.now();
    const { data } = await callOurApiSearch({ query: 'blockchain', limit: 10 });
    const duration = Date.now() - start;

    let hasMatchReasons = true;
    if (data.data && data.data.length > 0) {
      hasMatchReasons = data.data.every(
        (a) => Array.isArray(a.matchReasons) && a.matchReasons.length > 0
      );
    }

    results.push({
      name: 'Search results have matchReasons',
      passed: data.success && hasMatchReasons,
      duration,
      error: !hasMatchReasons ? 'Some agents missing matchReasons' : undefined,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${data.success && hasMatchReasons ? '✓' : '✗'} matchReasons present: ${hasMatchReasons}`);
  }

  return results;
}
