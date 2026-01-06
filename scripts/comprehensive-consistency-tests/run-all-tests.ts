#!/usr/bin/env npx ts-node
/**
 * Comprehensive Consistency Test Suite
 * Tests all filters, pagination, sorting, and cross-source consistency
 *
 * Usage:
 *   API_KEY="your_key" npx ts-node scripts/comprehensive-consistency-tests/run-all-tests.ts
 *
 * Options:
 *   --filter=<pattern>   Run only tests matching pattern
 *   --skip=<suite>       Skip specific test suite (comma-separated)
 *   --json               Output results as JSON
 *   --verbose            Show detailed output
 *   --summary            Show only summary (default: false)
 */

import { healthCheck, hasApiKey, getApiBaseUrl } from './client';
import { runBasicFilterTests } from './tests/01-basic-filters';
import { runOasfFilterTests } from './tests/02-oasf-filters';
import { runPaginationTests } from './tests/03-pagination';
import { runSortingTests } from './tests/04-sorting';
import { runFilterModeTests } from './tests/05-filter-modes';
import { runSearchTests } from './tests/06-search';
import { runReputationTests } from './tests/07-reputation';
import { runCrossSourceTests } from './tests/08-cross-source';
import type { TestResult } from './types';

interface SuiteResult {
  name: string;
  results: TestResult[];
  passed: number;
  failed: number;
  duration: number;
}

const ALL_SUITES: Record<string, () => Promise<TestResult[]>> = {
  'basic-filters': runBasicFilterTests,
  'oasf-filters': runOasfFilterTests,
  pagination: runPaginationTests,
  sorting: runSortingTests,
  'filter-modes': runFilterModeTests,
  search: runSearchTests,
  reputation: runReputationTests,
  'cross-source': runCrossSourceTests,
};

function parseArgs(): {
  filter?: string;
  skip: string[];
  json: boolean;
  verbose: boolean;
  summary: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    filter: undefined as string | undefined,
    skip: [] as string[],
    json: false,
    verbose: false,
    summary: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--filter=')) {
      result.filter = arg.replace('--filter=', '');
    } else if (arg.startsWith('--skip=')) {
      result.skip = arg.replace('--skip=', '').split(',');
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--summary') {
      result.summary = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  if (!args.json) {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     COMPREHENSIVE CONSISTENCY TEST SUITE                      ║');
    console.log('║     Testing ALL filters, pagination, and consistency          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log(`API Base: ${getApiBaseUrl()}`);
    console.log(`API Key: ${hasApiKey() ? '✓ configured' : '✗ NOT CONFIGURED'}`);
    console.log('');
  }

  // Health check
  if (!args.json) {
    console.log('Checking API availability...');
  }
  const healthy = await healthCheck();
  if (!healthy) {
    console.error('ERROR: API is not available. Check API_BASE_URL and API_KEY.');
    process.exit(1);
  }
  if (!args.json) {
    console.log('API is healthy ✓\n');
  }

  // Run all test suites
  const suiteResults: SuiteResult[] = [];
  const startTime = Date.now();

  for (const [suiteName, runSuite] of Object.entries(ALL_SUITES)) {
    // Apply filters
    if (args.filter && !suiteName.includes(args.filter)) {
      continue;
    }
    if (args.skip.includes(suiteName)) {
      if (!args.json) {
        console.log(`\nSkipping ${suiteName}...`);
      }
      continue;
    }

    const suiteStart = Date.now();
    try {
      const results = await runSuite();
      const suiteDuration = Date.now() - suiteStart;

      const passed = results.filter((r) => r.passed).length;
      const failed = results.filter((r) => !r.passed).length;

      suiteResults.push({
        name: suiteName,
        results,
        passed,
        failed,
        duration: suiteDuration,
      });

      if (!args.json && !args.summary) {
        console.log(`\n  Suite: ${suiteName} - ${passed}/${results.length} passed (${(suiteDuration / 1000).toFixed(1)}s)`);
      }
    } catch (error) {
      console.error(`\nERROR in suite ${suiteName}:`, error);
      suiteResults.push({
        name: suiteName,
        results: [],
        passed: 0,
        failed: 1,
        duration: Date.now() - suiteStart,
      });
    }
  }

  const totalDuration = Date.now() - startTime;

  // Calculate totals
  const totalPassed = suiteResults.reduce((sum, s) => sum + s.passed, 0);
  const totalFailed = suiteResults.reduce((sum, s) => sum + s.failed, 0);
  const totalTests = totalPassed + totalFailed;

  // Output results
  if (args.json) {
    const output = {
      timestamp: new Date().toISOString(),
      apiBase: getApiBaseUrl(),
      duration: totalDuration,
      summary: {
        totalSuites: suiteResults.length,
        totalTests,
        passed: totalPassed,
        failed: totalFailed,
        passRate: totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0,
      },
      suites: suiteResults.map((s) => ({
        name: s.name,
        passed: s.passed,
        failed: s.failed,
        duration: s.duration,
        tests: s.results,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Summary output
    console.log('\n' + '═'.repeat(65));
    console.log('                        TEST SUMMARY');
    console.log('═'.repeat(65));

    for (const suite of suiteResults) {
      const status = suite.failed === 0 ? '✓' : '✗';
      const passRate = suite.results.length > 0
        ? Math.round((suite.passed / suite.results.length) * 100)
        : 0;
      console.log(`  ${status} ${suite.name.padEnd(20)} ${suite.passed}/${suite.results.length} (${passRate}%)`);

      // Show failed tests
      if (suite.failed > 0 && args.verbose) {
        for (const test of suite.results.filter((t) => !t.passed)) {
          console.log(`      ✗ ${test.name}: ${test.error || 'Failed'}`);
        }
      }
    }

    console.log('─'.repeat(65));
    const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
    console.log(`  TOTAL: ${totalPassed}/${totalTests} tests passed (${passRate}%)`);
    console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log('═'.repeat(65));

    // Exit code
    if (totalFailed > 0) {
      console.log(`\n${totalFailed} test(s) failed. Run with --verbose for details.\n`);
      process.exit(1);
    } else {
      console.log('\nAll tests passed! ✓\n');
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
