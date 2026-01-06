/**
 * OASF Filter Tests
 * Tests skills and domains filtering
 */

import { callOurApiGet } from '../client';
import { verifySkillFilter, verifyDomainFilter } from '../comparator';
import type { TestResult } from '../types';
import { ALL_FILTERS } from '../types';

export async function runOasfFilterTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n=== OASF Filter Tests ===\n');

  // Test: Single skill filter
  for (const skill of ALL_FILTERS.skills) {
    const start = Date.now();
    const { data } = await callOurApiGet({ skills: skill, limit: 20 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const verification = verifySkillFilter(data.data, skill);
      passed = verification.passed;
      if (!passed) {
        error = `${verification.failedCount} agents missing skill "${skill}"`;
      }
    }

    results.push({
      name: `Skill filter: ${skill}`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} skills=${skill}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Single domain filter
  for (const domain of ALL_FILTERS.domains) {
    const start = Date.now();
    const { data } = await callOurApiGet({ domains: domain, limit: 20 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      const verification = verifyDomainFilter(data.data, domain);
      passed = verification.passed;
      if (!passed) {
        error = `${verification.failedCount} agents missing domain "${domain}"`;
      }
    }

    results.push({
      name: `Domain filter: ${domain}`,
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} domains=${domain}: ${data.data?.length ?? 0} agents`);
  }

  // Test: Multiple skills (OR within skills)
  {
    const skills = 'natural_language_processing,code_generation';
    const start = Date.now();
    const { data } = await callOurApiGet({ skills, limit: 20 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      // At least one of the skills should be present
      let failedCount = 0;
      for (const agent of data.data) {
        const hasAnySkill = agent.oasf?.skills?.some((s) =>
          ['natural_language_processing', 'code_generation'].includes(s.slug)
        );
        if (!hasAnySkill) failedCount++;
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents missing both skills`;
      }
    }

    results.push({
      name: 'Multiple skills filter (OR logic)',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Multiple skills: ${data.data?.length ?? 0} agents`);
  }

  // Test: Multiple domains (OR within domains)
  {
    const domains = 'technology,finance';
    const start = Date.now();
    const { data } = await callOurApiGet({ domains, limit: 20 });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        const hasAnyDomain = agent.oasf?.domains?.some((d) =>
          ['technology', 'finance'].includes(d.slug)
        );
        if (!hasAnyDomain) failedCount++;
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents missing both domains`;
      }
    }

    results.push({
      name: 'Multiple domains filter (OR logic)',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Multiple domains: ${data.data?.length ?? 0} agents`);
  }

  // Test: Combined skill + domain (AND across categories)
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      skills: 'natural_language_processing',
      domains: 'technology',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        const hasSkill = agent.oasf?.skills?.some((s) => s.slug === 'natural_language_processing');
        const hasDomain = agent.oasf?.domains?.some((d) => d.slug === 'technology');
        if (!hasSkill || !hasDomain) failedCount++;
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents missing skill or domain`;
      }
    }

    results.push({
      name: 'Combined skill + domain (AND logic)',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Skill + Domain: ${data.data?.length ?? 0} agents`);
  }

  // Test: OASF + chain filter
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      chainId: 11155111,
      skills: 'code_generation',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        const correctChain = agent.chainId === 11155111;
        const hasSkill = agent.oasf?.skills?.some((s) => s.slug === 'code_generation');
        if (!correctChain || !hasSkill) failedCount++;
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined check`;
      }
    }

    results.push({
      name: 'Chain + skill combined filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} Chain + Skill: ${data.data?.length ?? 0} agents`);
  }

  // Test: OASF + boolean filter
  {
    const start = Date.now();
    const { data } = await callOurApiGet({
      mcp: true,
      domains: 'finance_business',
      limit: 20,
    });
    const duration = Date.now() - start;

    let passed = data.success;
    let error: string | undefined;

    if (data.success && data.data && data.data.length > 0) {
      let failedCount = 0;
      for (const agent of data.data) {
        const hasMcp = agent.hasMcp === true;
        const hasDomain = agent.oasf?.domains?.some((d) => d.slug === 'finance_business');
        if (!hasMcp || !hasDomain) failedCount++;
      }
      passed = failedCount === 0;
      if (!passed) {
        error = `${failedCount} agents fail combined check`;
      }
    }

    results.push({
      name: 'MCP + domain combined filter',
      passed,
      duration,
      error,
      details: { apiCount: data.data?.length },
    });
    console.log(`  ${passed ? '✓' : '✗'} MCP + Domain: ${data.data?.length ?? 0} agents`);
  }

  return results;
}
