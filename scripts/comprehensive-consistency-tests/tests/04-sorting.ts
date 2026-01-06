/**
 * Sorting Tests
 * Tests all sorting options: relevance, name, createdAt, reputation
 */

import { callOurApiGet } from '../client';
import { verifySorting } from '../comparator';
import type { Agent, TestResult } from '../types';
import { ALL_FILTERS } from '../types';

export async function runSortingTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n=== Sorting Tests ===\n');

  // Test: Default sorting (no explicit sort)
  {
    const start = Date.now();
    const { data } = await callOurApiGet({ limit: 20 });
    const duration = Date.now() - start;

    results.push({
      name: 'Default sorting returns agents',
      passed: data.success && (data.data?.length ?? 0) > 0,
      duration,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${results[results.length - 1].passed ? '✓' : '✗'} Default sort: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sort by name (asc/desc)
  for (const order of ALL_FILTERS.sortOrders) {
    const start = Date.now();
    const { data } = await callOurApiGet({ sort: 'name', order, limit: 30 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      const verification = verifySorting(data.data, 'name', order);
      passed = verification.passed;
      if (!passed && verification.firstViolation) {
        error = `Sort violation at index ${verification.firstViolation.index}: ${verification.firstViolation.prev} vs ${verification.firstViolation.curr}`;
      }
    }

    results.push({
      name: `Sort by name ${order}`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} sort=name, order=${order}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sort by createdAt (uses tokenId as proxy)
  for (const order of ALL_FILTERS.sortOrders) {
    const start = Date.now();
    const { data } = await callOurApiGet({ sort: 'createdAt', order, limit: 30 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      // createdAt sorting uses tokenId as proxy
      const verification = verifySorting(
        data.data,
        (a: Agent) => parseInt(a.tokenId, 10),
        order
      );
      passed = verification.passed;
      if (!passed && verification.firstViolation) {
        error = `Sort violation at index ${verification.firstViolation.index}`;
      }
    }

    results.push({
      name: `Sort by createdAt ${order}`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} sort=createdAt, order=${order}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sort by reputation
  for (const order of ALL_FILTERS.sortOrders) {
    const start = Date.now();
    const { data } = await callOurApiGet({ sort: 'reputation', order, limit: 30 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      // Filter agents with reputation scores for verification
      const withRep = data.data.filter((a) => a.reputationScore !== undefined);
      if (withRep.length >= 2) {
        const verification = verifySorting(withRep, 'reputationScore', order);
        passed = verification.passed;
        if (!passed && verification.firstViolation) {
          error = `Sort violation: ${verification.firstViolation.prev} vs ${verification.firstViolation.curr}`;
        }
      }
    }

    results.push({
      name: `Sort by reputation ${order}`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} sort=reputation, order=${order}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sort by relevance (with search query)
  for (const order of ALL_FILTERS.sortOrders) {
    const start = Date.now();
    const { data } = await callOurApiGet({ q: 'AI', sort: 'relevance', order, limit: 20 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      const verification = verifySorting(data.data, 'searchScore', order);
      passed = verification.passed;
      if (!passed && verification.firstViolation) {
        error = `Score sort violation: ${verification.firstViolation.prev} vs ${verification.firstViolation.curr}`;
      }
    }

    results.push({
      name: `Sort by relevance ${order} (with q=AI)`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} sort=relevance, order=${order}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sorting with filters
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      chainId: 11155111,
      sort: 'name',
      order: 'asc',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      // Check both filter and sort
      const allCorrectChain = data.data.every((a) => a.chainId === 11155111);
      const verification = verifySorting(data.data, 'name', 'asc');

      passed = allCorrectChain && verification.passed;
      if (!allCorrectChain) {
        error = 'Some agents have wrong chainId';
      } else if (!verification.passed) {
        error = 'Sort order incorrect';
      }
    }

    results.push({
      name: 'Sort with chainId filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Sort + filter: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sorting with boolean filter
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      sort: 'name',
      order: 'desc',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      const allHaveMcp = data.data.every((a) => a.hasMcp === true);
      const verification = verifySorting(data.data, 'name', 'desc');

      passed = allHaveMcp && verification.passed;
      if (!allHaveMcp) {
        error = 'Some agents missing MCP';
      } else if (!verification.passed) {
        error = 'Sort order incorrect';
      }
    }

    results.push({
      name: 'Sort with mcp=true filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Sort + mcp filter: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sorting with OASF filter
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      skills: 'code_generation',
      sort: 'name',
      order: 'asc',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      const allHaveSkill = data.data.every((a) =>
        a.oasf?.skills?.some((s) => s.slug === 'code_generation')
      );
      const verification = verifySorting(data.data, 'name', 'asc');

      passed = allHaveSkill && verification.passed;
      if (!allHaveSkill) {
        error = 'Some agents missing skill';
      } else if (!verification.passed) {
        error = 'Sort order incorrect';
      }
    }

    results.push({
      name: 'Sort with skills filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Sort + skills filter: ${data.data?.length ?? 0} agents`);
  }

  return results;
}
