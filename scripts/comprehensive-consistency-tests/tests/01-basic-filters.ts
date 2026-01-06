/**
 * Basic Filter Tests
 * Tests all basic filters: chainId, active, mcp, a2a, x402, hasRegistrationFile
 */

import { callOurApiGet } from '../client';
import { verifyFilter } from '../comparator';
import type { Agent, TestResult } from '../types';
import { ALL_FILTERS } from '../types';

export async function runBasicFilterTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n=== Basic Filter Tests ===\n');

  // Test 1: No filters (baseline)
  {
    const start = Date.now();
    const { data } = await callOurApiGet({ limit: 50 });
    const duration = Date.now() - start;

    results.push({
      name: 'Baseline: No filters returns agents',
      passed: data.success && (data.data?.length ?? 0) > 0,
      duration,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${results[results.length - 1].passed ? '✓' : '✗'} ${results[results.length - 1].name} (${data.data?.length} agents)`);
  }

  // Test 2-8: Single chain filters
  for (const chainId of ALL_FILTERS.chainIds) {
    const start = Date.now();
    const { data } = await callOurApiGet({ chainId, limit: 20 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const verification = verifyFilter(data.data, { field: 'chainId', value: chainId });
      passed = verification.passed;
      if (!passed) {
        error = `${verification.failedAgents.length} agents have wrong chainId`;
      }
    }

    results.push({
      name: `chainId=${chainId} filter`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} chainId=${chainId}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Multiple chains
  {
    const chainIds = '11155111,84532';
    const start = Date.now();
    const { data } = await callOurApiGet({ chainIds, limit: 30 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const allowedChains = [11155111, 84532];
      const verification = verifyFilter(data.data, { field: 'chainId', value: allowedChains, operator: 'in' });
      passed = verification.passed;
      if (!passed) {
        error = `${verification.failedAgents.length} agents have invalid chainId`;
      }
    }

    results.push({
      name: 'Multiple chains filter (chainIds=11155111,84532)',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Multiple chains: ${data.data?.length ?? 0} agents`);
  }

  // Test: Boolean filters (active, mcp, a2a, x402)
  for (const filter of ['active', 'mcp', 'a2a', 'x402'] as const) {
    for (const value of [true, false]) {
      const start = Date.now();
      const { data } = await callOurApiGet({ [filter]: value, limit: 20 });
      const duration = Date.now() - start;

      let passed = data.success;
      let error: string | undefined;

      if (data.success && data.data && data.data.length > 0) {
        // Map filter name to agent field
        const fieldMap: Record<string, keyof Agent> = {
          active: 'active',
          mcp: 'hasMcp',
          a2a: 'hasA2a',
          x402: 'x402Support',
        };
        const field = fieldMap[filter];
        const verification = verifyFilter(data.data, { field, value });
        passed = verification.passed;
        if (!passed) {
          error = `${verification.failedAgents.length} agents don't match ${filter}=${value}`;
        }
      }

      results.push({
        name: `${filter}=${value} filter`,
        passed,
        duration,
        error,
        details: { apiCount: data.data?.length },
      });
      console.log(`  ${passed ? '✓' : '✗'} ${filter}=${value}: ${data.data?.length ?? 0} agents`);
    }
  }

  // Test: hasRegistrationFile filter
  for (const value of [true, false]) {
    const start = Date.now();
    const { data } = await callOurApiGet({ hasRegistrationFile: value, limit: 20 });
    const duration = Date.now() - start;

    results.push({
      name: `hasRegistrationFile=${value} filter`,
      passed: data.success,
      duration,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${data.success ? '✓' : '✗'} hasRegistrationFile=${value}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Combine chainId + boolean filter
  {
    const start = Date.now();
    const { data } = await callOurApiGet({ chainId: 11155111, mcp: true, limit: 20 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const chainCheck = verifyFilter(data.data, { field: 'chainId', value: 11155111 });
      const mcpCheck = verifyFilter(data.data, { field: 'hasMcp', value: true });
      passed = chainCheck.passed && mcpCheck.passed;
      if (!passed) {
        error = 'Some agents fail combined filter check';
      }
    }

    results.push({
      name: 'Combined: chainId=11155111 + mcp=true',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Combined chainId+mcp: ${data.data?.length ?? 0} agents`);
  }

  return results;
}
