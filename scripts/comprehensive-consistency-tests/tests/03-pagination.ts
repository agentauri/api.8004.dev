/**
 * Pagination Tests
 * Tests all pagination modes: cursor, offset, page
 */

import {
  callOurApiGet,
  paginateAllWithCursor,
  paginateAllWithOffset,
  paginateAllWithPage,
} from '../client';
import { verifyPagination } from '../comparator';
import type { TestResult } from '../types';
import { ALL_FILTERS } from '../types';

export async function runPaginationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n=== Pagination Tests ===\n');

  // Test: Different limit values
  for (const limit of ALL_FILTERS.limits) {
    const start = Date.now();
    const { data } = await callOurApiGet({ limit });
    const duration = Date.now() - start;

    const actualCount = data.data?.length ?? 0;
    // Limit should be respected (but can return fewer if not enough data)
    const passed = data.success && actualCount <= limit;

    results.push({
      name: `Limit=${limit} returns correct count`,
      passed,
      duration,
      error: !passed ? `Expected <= ${limit}, got ${actualCount}` : undefined,
      details: { apiCount: actualCount },
    });
    console.log(`  ${passed ? '✓' : '✗'} limit=${limit}: ${actualCount} agents (max ${limit})`);
  }

  // Test: Cursor pagination - page 1
  {
    const start = Date.now();
    const { data } = await callOurApiGet({ limit: 10 });
    const duration = Date.now() - start;

    const hasNextCursor = data.meta?.hasMore && data.meta?.nextCursor;
    const passed = data.success && data.data && data.data.length > 0;

    results.push({
      name: 'Cursor pagination - first page',
      passed,
      duration,
      details: {
        apiCount: data.data?.length,
        differences: hasNextCursor ? ['Has nextCursor'] : ['No more pages'],
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} First page: ${data.data?.length ?? 0} agents, hasMore=${data.meta?.hasMore}`);

    // Test: Cursor pagination - page 2 (if available)
    if (hasNextCursor) {
      const start2 = Date.now();
      const { data: data2 } = await callOurApiGet({ limit: 10, cursor: data.meta!.nextCursor });
      const duration2 = Date.now() - start2;

      const passed2 = data2.success && data2.data && data2.data.length > 0;

      // Check no overlap with page 1
      const page1Ids = new Set(data.data!.map((a) => a.id));
      const overlap = data2.data?.filter((a) => page1Ids.has(a.id)) ?? [];

      results.push({
        name: 'Cursor pagination - second page (no overlap)',
        passed: passed2 && overlap.length === 0,
        duration: duration2,
        error: overlap.length > 0 ? `${overlap.length} agents overlap with page 1` : undefined,
        details: { apiCount: data2.data?.length },
      });
      console.log(`  ${passed2 && overlap.length === 0 ? '✓' : '✗'} Second page: ${data2.data?.length ?? 0} agents, overlap=${overlap.length}`);
    }
  }

  // Test: Offset pagination
  {
    const start = Date.now();
    const { data: page1 } = await callOurApiGet({ limit: 10, offset: 0 });
    const { data: page2 } = await callOurApiGet({ limit: 10, offset: 10 });
    const duration = Date.now() - start;

    const passed = page1.success && page2.success;
    let overlap = 0;
    if (page1.data && page2.data) {
      const page1Ids = new Set(page1.data.map((a) => a.id));
      overlap = page2.data.filter((a) => page1Ids.has(a.id)).length;
    }

    results.push({
      name: 'Offset pagination (offset=0 vs offset=10)',
      passed: passed && overlap === 0,
      duration,
      error: overlap > 0 ? `${overlap} agents overlap` : undefined,
    });
    console.log(`  ${passed && overlap === 0 ? '✓' : '✗'} Offset pagination: no overlap between pages`);
  }

  // Test: Page-based pagination
  {
    const start = Date.now();
    const { data: page1 } = await callOurApiGet({ limit: 10, page: 1 });
    const { data: page2 } = await callOurApiGet({ limit: 10, page: 2 });
    const duration = Date.now() - start;

    const passed = page1.success && page2.success;
    let overlap = 0;
    if (page1.data && page2.data) {
      const page1Ids = new Set(page1.data.map((a) => a.id));
      overlap = page2.data.filter((a) => page1Ids.has(a.id)).length;
    }

    results.push({
      name: 'Page-based pagination (page=1 vs page=2)',
      passed: passed && overlap === 0,
      duration,
      error: overlap > 0 ? `${overlap} agents overlap` : undefined,
    });
    console.log(`  ${passed && overlap === 0 ? '✓' : '✗'} Page pagination: no overlap between pages`);
  }

  // Test: Full cursor pagination (multiple pages)
  {
    console.log('\n  Testing full cursor pagination...');
    const start = Date.now();
    const { agents, pages, totalFromMeta } = await paginateAllWithCursor({ limit: 20 }, 5);
    const duration = Date.now() - start;

    const verification = verifyPagination(agents);

    results.push({
      name: `Full cursor pagination (${pages} pages)`,
      passed: verification.passed,
      duration,
      error: verification.errors.join('; '),
      details: { apiCount: agents.length },
    });
    console.log(`  ${verification.passed ? '✓' : '✗'} Full cursor: ${agents.length} agents in ${pages} pages (meta.total=${totalFromMeta})`);
  }

  // Test: Full offset pagination (multiple pages)
  {
    console.log('  Testing full offset pagination...');
    const start = Date.now();
    const { agents, pages, totalFromMeta } = await paginateAllWithOffset({ limit: 20 }, 5);
    const duration = Date.now() - start;

    const verification = verifyPagination(agents);

    results.push({
      name: `Full offset pagination (${pages} pages)`,
      passed: verification.passed,
      duration,
      error: verification.errors.join('; '),
      details: { apiCount: agents.length },
    });
    console.log(`  ${verification.passed ? '✓' : '✗'} Full offset: ${agents.length} agents in ${pages} pages (meta.total=${totalFromMeta})`);
  }

  // Test: Full page pagination (multiple pages)
  {
    console.log('  Testing full page pagination...');
    const start = Date.now();
    const { agents, pages, totalFromMeta } = await paginateAllWithPage({ limit: 20 }, 5);
    const duration = Date.now() - start;

    const verification = verifyPagination(agents);

    results.push({
      name: `Full page pagination (${pages} pages)`,
      passed: verification.passed,
      duration,
      error: verification.errors.join('; '),
      details: { apiCount: agents.length },
    });
    console.log(`  ${verification.passed ? '✓' : '✗'} Full page: ${agents.length} agents in ${pages} pages (meta.total=${totalFromMeta})`);
  }

  // Test: Pagination with filters
  {
    console.log('  Testing pagination with chainId filter...');
    const start = Date.now();
    const { agents, pages } = await paginateAllWithCursor({ chainId: 11155111, limit: 10 }, 5);
    const duration = Date.now() - start;

    const verification = verifyPagination(agents);
    let allCorrectChain = true;
    for (const agent of agents) {
      if (agent.chainId !== 11155111) {
        allCorrectChain = false;
        break;
      }
    }

    results.push({
      name: 'Pagination with chainId filter',
      passed: verification.passed && allCorrectChain,
      duration,
      error: !allCorrectChain ? 'Some agents have wrong chainId' : verification.errors.join('; '),
      details: { apiCount: agents.length },
    });
    console.log(`  ${verification.passed && allCorrectChain ? '✓' : '✗'} Filtered pagination: ${agents.length} agents in ${pages} pages`);
  }

  // Test: Pagination with boolean filter
  {
    console.log('  Testing pagination with mcp=true filter...');
    const start = Date.now();
    const { agents, pages } = await paginateAllWithCursor({ mcp: true, limit: 10 }, 5);
    const duration = Date.now() - start;

    const verification = verifyPagination(agents);
    let allHaveMcp = true;
    for (const agent of agents) {
      if (agent.hasMcp !== true) {
        allHaveMcp = false;
        break;
      }
    }

    results.push({
      name: 'Pagination with mcp=true filter',
      passed: verification.passed && allHaveMcp,
      duration,
      error: !allHaveMcp ? 'Some agents missing MCP' : verification.errors.join('; '),
      details: { apiCount: agents.length },
    });
    console.log(`  ${verification.passed && allHaveMcp ? '✓' : '✗'} MCP pagination: ${agents.length} agents in ${pages} pages`);
  }

  // Test: Pagination consistency (cursor vs offset should return same data)
  {
    console.log('  Testing cursor vs offset consistency...');
    const start = Date.now();
    const { agents: cursorAgents, pages: cursorPages } = await paginateAllWithCursor({ limit: 10 }, 3);
    const { agents: offsetAgents, pages: offsetPages } = await paginateAllWithOffset({ limit: 10 }, 3);
    const duration = Date.now() - start;

    // Compare IDs (order may differ)
    const cursorIds = new Set(cursorAgents.map((a) => a.id));
    const offsetIds = new Set(offsetAgents.map((a) => a.id));

    // Find differences
    const onlyInCursor = [...cursorIds].filter((id) => !offsetIds.has(id));
    const onlyInOffset = [...offsetIds].filter((id) => !cursorIds.has(id));

    const passed = onlyInCursor.length === 0 && onlyInOffset.length === 0;

    results.push({
      name: 'Cursor vs offset pagination consistency',
      passed,
      duration,
      error: !passed
        ? `${onlyInCursor.length} only in cursor, ${onlyInOffset.length} only in offset`
        : undefined,
      details: {
        apiCount: cursorAgents.length,
        sdkCount: offsetAgents.length,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} Cursor vs Offset: cursor=${cursorPages} pages (${cursorAgents.length}), offset=${offsetPages} pages (${offsetAgents.length})`);
  }

  return results;
}
