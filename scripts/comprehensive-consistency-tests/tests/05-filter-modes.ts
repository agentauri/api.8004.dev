/**
 * Filter Mode Tests
 * Tests AND/OR filter combinations
 */

import { callOurApiGet } from '../client';
import type { TestResult } from '../types';

export async function runFilterModeTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n=== Filter Mode Tests (AND/OR) ===\n');

  // Test: AND mode (default) - all boolean filters must match
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      a2a: true,
      filterMode: 'AND',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      // In AND mode, ALL agents must have BOTH mcp AND a2a
      let failedCount = 0;
      for (const agent of data.data) {
        if (agent.hasMcp !== true || agent.hasA2a !== true) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents don't have both MCP and A2A`;
      }
    }

    results.push({
      name: 'AND mode: mcp=true AND a2a=true',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} AND mode (mcp+a2a): ${data.data?.length ?? 0} agents`);
  }

  // Test: OR mode - any boolean filter can match
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      a2a: true,
      filterMode: 'OR',
      limit: 50,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      // In OR mode, agents must have AT LEAST ONE of mcp OR a2a
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
      name: 'OR mode: mcp=true OR a2a=true',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} OR mode (mcp+a2a): ${data.data?.length ?? 0} agents`);
  }

  // Test: OR mode with x402
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      x402: true,
      filterMode: 'OR',
      limit: 30,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        if (agent.hasMcp !== true && agent.x402Support !== true) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents have neither MCP nor x402`;
      }
    }

    results.push({
      name: 'OR mode: mcp=true OR x402=true',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} OR mode (mcp+x402): ${data.data?.length ?? 0} agents`);
  }

  // Test: AND vs OR should return different counts (OR >= AND)
  {
    const start = Date.now();
    const { data: andData } = await callOurApiGet({
      mcp: true,
      a2a: true,
      filterMode: 'AND',
      limit: 100,
    });
    const { data: orData } = await callOurApiGet({
      mcp: true,
      a2a: true,
      filterMode: 'OR',
      limit: 100,
    });
    const duration = Date.now() - start;

    const andCount = andData.data?.length ?? 0;
    const orCount = orData.data?.length ?? 0;

    // OR should return >= AND results (OR is less restrictive)
    const passed = andData.success && orData.success && orCount >= andCount;

    results.push({
      name: 'OR mode returns >= AND mode results',
      passed,
      duration,
      error: !passed ? `AND: ${andCount}, OR: ${orCount}` : undefined,
      details: {
        apiCount: andCount,
        sdkCount: orCount,
      },
    });
    console.log(`  ${passed ? '✓' : '✗'} AND=${andCount} <= OR=${orCount}`);
  }

  // Test: AND mode with chainId
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      chainId: 11155111,
      mcp: true,
      a2a: true,
      filterMode: 'AND',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        if (agent.chainId !== 11155111 || agent.hasMcp !== true || agent.hasA2a !== true) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined filter`;
      }
    }

    results.push({
      name: 'AND mode with chainId filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} AND + chainId: ${data.data?.length ?? 0} agents`);
  }

  // Test: OR mode with chainId
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      chainId: 11155111,
      mcp: true,
      a2a: true,
      filterMode: 'OR',
      limit: 30,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        // ChainId is AND-ed, but mcp/a2a are OR-ed
        const chainOk = agent.chainId === 11155111;
        const boolOk = agent.hasMcp === true || agent.hasA2a === true;
        if (!chainOk || !boolOk) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined filter`;
      }
    }

    results.push({
      name: 'OR mode with chainId filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} OR + chainId: ${data.data?.length ?? 0} agents`);
  }

  // Test: AND mode with skills (skills are always AND with other filters)
  // Note: Use skills that have agents with MCP support to avoid SDK fallback
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      skills: 'natural_language_processing',
      filterMode: 'AND',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        const hasMcp = agent.hasMcp === true;
        const hasSkill = agent.oasf?.skills?.some((s) => s.slug === 'natural_language_processing');
        if (!hasMcp || !hasSkill) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined filter`;
      }
    }

    results.push({
      name: 'AND mode with skills filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} AND + skills: ${data.data?.length ?? 0} agents`);
  }

  // Test: OR mode with skills (boolean filters OR-ed, skills always AND-ed)
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      a2a: true,
      skills: 'natural_language_processing',
      filterMode: 'OR',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        // Skills are AND-ed regardless of filterMode
        const hasSkill = agent.oasf?.skills?.some((s) => s.slug === 'natural_language_processing');
        // Boolean filters are OR-ed
        const boolOk = agent.hasMcp === true || agent.hasA2a === true;

        if (!hasSkill || !boolOk) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined filter`;
      }
    }

    results.push({
      name: 'OR mode with skills filter (skills still AND-ed)',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} OR + skills: ${data.data?.length ?? 0} agents`);
  }

  // Test: Triple boolean filter in AND mode
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      a2a: true,
      x402: true,
      filterMode: 'AND',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        if (agent.hasMcp !== true || agent.hasA2a !== true || agent.x402Support !== true) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents don't have all three`;
      }
    }

    results.push({
      name: 'AND mode: mcp AND a2a AND x402',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} AND (mcp+a2a+x402): ${data.data?.length ?? 0} agents`);
  }

  // Test: Triple boolean filter in OR mode
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      a2a: true,
      x402: true,
      filterMode: 'OR',
      limit: 50,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        if (agent.hasMcp !== true && agent.hasA2a !== true && agent.x402Support !== true) {
          failedCount++;
        }
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents have none of the three`;
      }
    }

    results.push({
      name: 'OR mode: mcp OR a2a OR x402',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} OR (mcp+a2a+x402): ${data.data?.length ?? 0} agents`);
  }

  return results;
}
