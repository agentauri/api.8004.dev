#!/usr/bin/env tsx
/**
 * E2E Test Suite Entry Point
 * Run comprehensive tests against the 8004.dev API
 *
 * Usage:
 *   pnpm run test:e2e                    # Run all tests against production
 *   pnpm run test:e2e:local              # Run tests against local worker with mock data
 *   pnpm run test:e2e -- --filter=oasf   # Run only OASF tests
 *   pnpm run test:e2e -- --json          # Output JSON format
 *   pnpm run test:e2e -- --verbose       # Verbose output
 *   pnpm run test:e2e -- --local         # Run against local worker
 *   pnpm run test:e2e -- --delay=500     # Set delay between tests (default: 200ms)
 *   pnpm run test:e2e -- --no-delay      # Disable delay between tests
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { runAllSuites, setTestDelay, setVerbose } from './test-runner';

import { registerAgentsAdvancedTests } from './tests/agents-advanced';
import { registerAgentsBasicTests } from './tests/agents-basic';
import { registerAgentsBooleanTests } from './tests/agents-boolean';
import { registerAgentsDetailTests } from './tests/agents-detail';
import { registerAgentsEdgeCasesTests } from './tests/agents-edge-cases';
import { registerAgentsOASFTests } from './tests/agents-oasf';
import { registerAgentsPaginationTests } from './tests/agents-pagination';
import { registerAgentsReputationTests } from './tests/agents-reputation';
import { registerAgentsSortingTests } from './tests/agents-sorting';
import { registerConsistencyTests } from './tests/consistency';
import { registerErrorHandlingTests } from './tests/error-handling';
// Import test registration functions
import { registerHealthTests } from './tests/health';
import { registerMcpTests } from './tests/mcp';
import { registerMcpConsistencyTests } from './tests/mcp-consistency';
import { registerSearchTests } from './tests/search';
import { registerSearchFallbackTests } from './tests/search-fallback';
import { registerSecurityTests } from './tests/security';
import { registerSourceVerificationTests } from './tests/source-verification';
import { registerTaxonomyTests } from './tests/taxonomy';

// Local worker configuration
const LOCAL_WORKER_PORT = 8788;
const LOCAL_WORKER_URL = `http://localhost:${LOCAL_WORKER_PORT}/api/v1`;
const LOCAL_API_KEY = 'e2e-test-api-key';
const WORKER_STARTUP_TIMEOUT = 30000; // 30 seconds

// Parse CLI arguments
function parseArgs(): { filter?: string; json: boolean; verbose: boolean; local: boolean; delay: number } {
  const args = process.argv.slice(2);
  let filter: string | undefined;
  let json = false;
  let verbose = false;
  let local = false;
  let delay = 200; // Default 200ms delay between tests to avoid rate limiting

  for (const arg of args) {
    if (arg.startsWith('--filter=')) {
      filter = arg.slice('--filter='.length).toLowerCase();
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--local') {
      local = true;
    } else if (arg.startsWith('--delay=')) {
      delay = Number.parseInt(arg.slice('--delay='.length), 10) || 200;
    } else if (arg === '--no-delay') {
      delay = 0;
    }
  }

  return { filter, json, verbose, local, delay };
}

// Map filter strings to test registration functions
const testSuites: Record<string, () => void> = {
  health: registerHealthTests,
  basic: registerAgentsBasicTests,
  boolean: registerAgentsBooleanTests,
  oasf: registerAgentsOASFTests,
  sorting: registerAgentsSortingTests,
  search: registerSearchTests,
  fallback: registerSearchFallbackTests,
  pagination: registerAgentsPaginationTests,
  consistency: registerConsistencyTests,
  reputation: registerAgentsReputationTests,
  advanced: registerAgentsAdvancedTests,
  edge: registerAgentsEdgeCasesTests,
  error: registerErrorHandlingTests,
  detail: registerAgentsDetailTests,
  taxonomy: registerTaxonomyTests,
  security: registerSecurityTests,
  mcp: registerMcpTests,
  'mcp-consistency': registerMcpConsistencyTests,
  source: registerSourceVerificationTests,
};

/**
 * Wait for the local worker to be ready
 */
async function waitForWorker(url: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const healthUrl = `${url}/health`;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'X-API-Key': LOCAL_API_KEY },
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Worker not ready yet, keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

/**
 * Start the local worker process
 */
function startLocalWorker(): ChildProcess {
  const worker = spawn(
    'npx',
    ['wrangler', 'dev', '--config', 'wrangler.e2e.toml', '--port', String(LOCAL_WORKER_PORT)],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Provide dummy secrets for local development
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        GOOGLE_AI_API_KEY: 'test-google-key',
        SEARCH_SERVICE_URL: 'https://search.example.com',
        SEPOLIA_RPC_URL: 'https://rpc.example.com',
        BASE_SEPOLIA_RPC_URL: 'https://rpc.example.com',
        POLYGON_AMOY_RPC_URL: 'https://rpc.example.com',
        API_KEY: LOCAL_API_KEY,
      },
    }
  );

  // Log worker output in verbose mode
  worker.stdout?.on('data', (data) => {
    const output = data.toString();
    if (process.env.VERBOSE === 'true') {
      console.log(`[worker] ${output}`);
    }
  });

  worker.stderr?.on('data', (data) => {
    const output = data.toString();
    // Only log errors, not wrangler info messages
    if (output.includes('error') || output.includes('Error')) {
      console.error(`[worker error] ${output}`);
    }
  });

  return worker;
}

/**
 * Stop the local worker process
 */
function stopLocalWorker(worker: ChildProcess): void {
  if (worker && !worker.killed) {
    worker.kill('SIGTERM');
    // Force kill after 5 seconds if not terminated
    setTimeout(() => {
      if (!worker.killed) {
        worker.kill('SIGKILL');
      }
    }, 5000);
  }
}

async function main(): Promise<void> {
  const { filter, json, verbose, local, delay } = parseArgs();
  let workerProcess: ChildProcess | null = null;

  // Set verbose mode
  setVerbose(verbose);
  if (verbose) {
    process.env.VERBOSE = 'true';
  }

  // Set test delay to avoid rate limiting
  setTestDelay(delay);

  try {
    // Setup for local mode
    if (local) {
      if (!json) {
        console.log('🚀 Starting local worker with mock services...');
      }

      workerProcess = startLocalWorker();

      // Wait for worker to be ready
      const isReady = await waitForWorker(LOCAL_WORKER_URL, WORKER_STARTUP_TIMEOUT);
      if (!isReady) {
        throw new Error(`Local worker failed to start within ${WORKER_STARTUP_TIMEOUT / 1000}s`);
      }

      if (!json) {
        console.log('✅ Local worker ready');
      }

      // Set environment for local testing
      process.env.API_BASE_URL = LOCAL_WORKER_URL;
      process.env.API_KEY = LOCAL_API_KEY;
    } else {
      // Production mode - require API key
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        console.error('❌ API_KEY environment variable is required');
        console.error('   Set it with: export API_KEY=your_api_key');
        console.error('   Or use --local flag to run against local worker with mock data');
        process.exit(1);
      }
    }

    // Print header (unless JSON mode)
    if (!json) {
      console.log('🧪 8004.dev E2E Test Suite');
      console.log('==========================');
      console.log(`🌐 Mode: ${local ? 'Local (mock data)' : 'Production'}`);
      console.log(`⏱️  Delay: ${delay}ms between tests`);
      if (filter) {
        console.log(`📋 Filter: ${filter}`);
      }
      console.log('');
    }

    // Register test suites based on filter
    if (filter) {
      // Find matching suites
      const matchingSuites = Object.entries(testSuites).filter(([name]) => name.includes(filter));

      if (matchingSuites.length === 0) {
        console.error(`❌ No test suites match filter: ${filter}`);
        console.error(`   Available: ${Object.keys(testSuites).join(', ')}`);
        process.exit(1);
      }

      for (const [, register] of matchingSuites) {
        register();
      }
    } else {
      // Register all suites
      for (const register of Object.values(testSuites)) {
        register();
      }
    }

    // Run all registered tests
    const startTime = Date.now();
    const results = await runAllSuites();
    const totalTime = Date.now() - startTime;

    // Output results
    if (json) {
      // JSON output for CI
      const output = {
        timestamp: new Date().toISOString(),
        duration: totalTime,
        mode: local ? 'local' : 'production',
        suites: results.map((suite) => ({
          name: suite.name,
          passed: suite.results.filter((r) => r.passed).length,
          failed: suite.results.filter((r) => !r.passed).length,
          tests: suite.results.map((r) => ({
            name: r.name,
            passed: r.passed,
            duration: r.duration,
            error: r.error,
          })),
        })),
        summary: {
          totalSuites: results.length,
          totalTests: results.reduce((sum, s) => sum + s.results.length, 0),
          passed: results.reduce((sum, s) => sum + s.results.filter((r) => r.passed).length, 0),
          failed: results.reduce((sum, s) => sum + s.results.filter((r) => !r.passed).length, 0),
        },
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      // Print results for each suite
      for (const suite of results) {
        console.log(`\n📦 ${suite.name}`);
        for (const result of suite.results) {
          const icon = result.passed ? '✅' : '❌';
          const duration =
            result.duration < 1000
              ? `${result.duration}ms`
              : `${(result.duration / 1000).toFixed(2)}s`;
          console.log(`  ${icon} ${result.name} (${duration})`);
          if (!result.passed && result.error) {
            console.log(`     Error: ${result.error}`);
          }
        }
      }

      const totalTests = results.reduce((sum, s) => sum + s.results.length, 0);
      const passedTests = results.reduce(
        (sum, s) => sum + s.results.filter((r) => r.passed).length,
        0
      );
      const failedTests = totalTests - passedTests;
      const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

      console.log('\n==========================');
      console.log(`📊 Results: ${passedTests}/${totalTests} passed (${passRate}%)`);
      console.log(`⏱️  Duration: ${(totalTime / 1000).toFixed(2)}s`);

      if (failedTests > 0) {
        console.log(`\n❌ ${failedTests} test(s) failed`);
      } else {
        console.log('\n✅ All tests passed!');
      }
    }

    // Exit with error code if any failures
    const hasFailures = results.some((s) => s.results.some((r) => !r.passed));
    process.exit(hasFailures ? 1 : 0);
  } finally {
    // Cleanup: stop local worker if started
    if (workerProcess) {
      if (!json) {
        console.log('\n🛑 Stopping local worker...');
      }
      stopLocalWorker(workerProcess);
    }
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
