/**
 * Reputation Filter Tests
 * Tests minRep and maxRep filters
 */

import { callOurApiGet } from '../client';
import type { TestResult } from '../types';
import { ALL_FILTERS } from '../types';

export async function runReputationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n=== Reputation Filter Tests ===\n');

  // Test: minRep filter
  for (const { minRep } of ALL_FILTERS.reputationRanges) {
    const start = Date.now();
    const { data } = await callOurApiGet({ minRep, limit: 30 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      // Only check agents that have reputation scores
      const withRep = data.data.filter((a) => a.reputationScore !== undefined);
      const belowMin = withRep.filter((a) => a.reputationScore! < minRep);

      if (belowMin.length > 0) {
        passed = false;
        error = `${belowMin.length} agents have reputationScore < ${minRep}`;
      }
    }

    results.push({
      name: `minRep=${minRep} filter`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} minRep=${minRep}: ${data.data?.length ?? 0} agents`);
  }

  // Test: maxRep filter
  for (const { maxRep } of ALL_FILTERS.reputationRanges) {
    const start = Date.now();
    const { data } = await callOurApiGet({ maxRep, limit: 30 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const withRep = data.data.filter((a) => a.reputationScore !== undefined);
      const aboveMax = withRep.filter((a) => a.reputationScore! > maxRep);

      if (aboveMax.length > 0) {
        passed = false;
        error = `${aboveMax.length} agents have reputationScore > ${maxRep}`;
      }
    }

    results.push({
      name: `maxRep=${maxRep} filter`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} maxRep=${maxRep}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Combined minRep and maxRep
  for (const range of ALL_FILTERS.reputationRanges) {
    const start = Date.now();
    const { data } = await callOurApiGet({
      minRep: range.minRep,
      maxRep: range.maxRep,
      limit: 30,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const withRep = data.data.filter((a) => a.reputationScore !== undefined);
      const outOfRange = withRep.filter(
        (a) => a.reputationScore! < range.minRep || a.reputationScore! > range.maxRep
      );

      if (outOfRange.length > 0) {
        passed = false;
        error = `${outOfRange.length} agents outside range [${range.minRep}, ${range.maxRep}]`;
      }
    }

    results.push({
      name: `Reputation range [${range.minRep}, ${range.maxRep}]`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Range [${range.minRep}, ${range.maxRep}]: ${data.data?.length ?? 0} agents`);
  }

  // Test: Reputation + chainId filter
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      chainId: 11155111,
      minRep: 50,
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        const chainOk = agent.chainId === 11155111;
        const repOk = agent.reputationScore === undefined || agent.reputationScore >= 50;
        if (!chainOk || !repOk) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined filter`;
      }
    }

    results.push({
      name: 'Reputation + chainId filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} minRep + chainId: ${data.data?.length ?? 0} agents`);
  }

  // Test: Reputation + boolean filter
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      minRep: 30,
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        const mcpOk = agent.hasMcp === true;
        const repOk = agent.reputationScore === undefined || agent.reputationScore >= 30;
        if (!mcpOk || !repOk) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined filter`;
      }
    }

    results.push({
      name: 'Reputation + mcp filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} minRep + mcp: ${data.data?.length ?? 0} agents`);
  }

  // Test: Reputation + skills filter
  // Note: Use minRep=0 since most agents with NLP skill have rep=0 (avoids SDK fallback)
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      skills: 'natural_language_processing',
      minRep: 0,
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        const skillOk = agent.oasf?.skills?.some((s) => s.slug === 'natural_language_processing');
        const repOk = agent.reputationScore === undefined || agent.reputationScore >= 0;
        if (!skillOk || !repOk) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined filter`;
      }
    }

    results.push({
      name: 'Reputation + skills filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} minRep + skills: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sort by reputation ascending
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      sort: 'reputation',
      order: 'asc',
      limit: 30,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      const withRep = data.data.filter((a) => a.reputationScore !== undefined);
      if (withRep.length >= 2) {
        for (let i = 1; i < withRep.length; i++) {
          if (withRep[i].reputationScore! < withRep[i - 1].reputationScore!) {
            passed = false;
            error = `Sort violation: ${withRep[i - 1].reputationScore} > ${withRep[i].reputationScore}`;
            break;
          }
        }
      }
    }

    results.push({
      name: 'Sort by reputation asc',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} sort=reputation asc: ${data.data?.length ?? 0} agents`);
  }

  // Test: Sort by reputation descending
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      sort: 'reputation',
      order: 'desc',
      limit: 30,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length >= 2) {
      const withRep = data.data.filter((a) => a.reputationScore !== undefined);
      if (withRep.length >= 2) {
        for (let i = 1; i < withRep.length; i++) {
          if (withRep[i].reputationScore! > withRep[i - 1].reputationScore!) {
            passed = false;
            error = `Sort violation: ${withRep[i - 1].reputationScore} < ${withRep[i].reputationScore}`;
            break;
          }
        }
      }
    }

    results.push({
      name: 'Sort by reputation desc',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} sort=reputation desc: ${data.data?.length ?? 0} agents`);
  }

  return results;
}
