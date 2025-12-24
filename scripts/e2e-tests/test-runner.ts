/**
 * Lightweight E2E Test Runner
 * A minimal test framework for running E2E tests against the API
 */

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  expected?: string;
  actual?: string;
}

export interface TestCase {
  name: string;
  fn: () => Promise<void>;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
}

// Global state for test collection
let currentSuite: TestSuite | null = null;
const suites: TestSuite[] = [];
let verboseMode = false;
let testDelayMs = 0; // Delay between tests to avoid rate limiting

/**
 * Set verbose mode for output
 */
export function setVerbose(verbose: boolean): void {
  verboseMode = verbose;
}

/**
 * Set delay between tests (in milliseconds) to avoid rate limiting
 */
export function setTestDelay(delayMs: number): void {
  testDelayMs = delayMs;
}

/**
 * Define a test suite
 */
export function describe(name: string, fn: () => void): void {
  currentSuite = { name, tests: [] };
  fn();
  suites.push(currentSuite);
  currentSuite = null;
}

/**
 * Define a test case
 */
export function it(name: string, fn: () => Promise<void>): void {
  if (!currentSuite) {
    throw new Error('it() must be called within a describe() block');
  }
  currentSuite.tests.push({ name, fn });
}

/**
 * Test assertion error
 */
export class AssertionError extends Error {
  constructor(
    message: string,
    public expected?: string,
    public actual?: string
  ) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Expect helper for assertions
 */
export function expect<T>(value: T) {
  return {
    toBe(expected: T): void {
      if (value !== expected) {
        throw new AssertionError(
          `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`,
          JSON.stringify(expected),
          JSON.stringify(value)
        );
      }
    },

    toEqual(expected: T): void {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new AssertionError(
          'Expected deep equality',
          JSON.stringify(expected, null, 2),
          JSON.stringify(value, null, 2)
        );
      }
    },

    toBeTruthy(): void {
      if (!value) {
        throw new AssertionError(
          `Expected truthy value but got ${JSON.stringify(value)}`,
          'truthy',
          JSON.stringify(value)
        );
      }
    },

    toBeFalsy(): void {
      if (value) {
        throw new AssertionError(
          `Expected falsy value but got ${JSON.stringify(value)}`,
          'falsy',
          JSON.stringify(value)
        );
      }
    },

    toBeGreaterThan(expected: number): void {
      if (typeof value !== 'number' || value <= expected) {
        throw new AssertionError(
          `Expected ${value} to be greater than ${expected}`,
          `> ${expected}`,
          String(value)
        );
      }
    },

    toBeGreaterThanOrEqual(expected: number): void {
      if (typeof value !== 'number' || value < expected) {
        throw new AssertionError(
          `Expected ${value} to be >= ${expected}`,
          `>= ${expected}`,
          String(value)
        );
      }
    },

    toBeLessThan(expected: number): void {
      if (typeof value !== 'number' || value >= expected) {
        throw new AssertionError(
          `Expected ${value} to be less than ${expected}`,
          `< ${expected}`,
          String(value)
        );
      }
    },

    toBeLessThanOrEqual(expected: number): void {
      if (typeof value !== 'number' || value > expected) {
        throw new AssertionError(
          `Expected ${value} to be <= ${expected}`,
          `<= ${expected}`,
          String(value)
        );
      }
    },

    toContain(expected: unknown): void {
      if (!Array.isArray(value) || !value.includes(expected)) {
        throw new AssertionError(
          `Expected array to contain ${JSON.stringify(expected)}`,
          `contains ${JSON.stringify(expected)}`,
          JSON.stringify(value)
        );
      }
    },

    toHaveLength(expected: number): void {
      if (!Array.isArray(value) || value.length !== expected) {
        throw new AssertionError(
          `Expected array length ${expected} but got ${Array.isArray(value) ? value.length : 'not an array'}`,
          String(expected),
          String(Array.isArray(value) ? value.length : 'N/A')
        );
      }
    },

    toBeDefined(): void {
      if (value === undefined) {
        throw new AssertionError('Expected value to be defined', 'defined', 'undefined');
      }
    },

    toBeUndefined(): void {
      if (value !== undefined) {
        throw new AssertionError(
          `Expected undefined but got ${JSON.stringify(value)}`,
          'undefined',
          JSON.stringify(value)
        );
      }
    },

    toBeNull(): void {
      if (value !== null) {
        throw new AssertionError(
          `Expected null but got ${JSON.stringify(value)}`,
          'null',
          JSON.stringify(value)
        );
      }
    },

    toMatchPredicate(predicate: (v: T) => boolean, description: string): void {
      if (!predicate(value)) {
        throw new AssertionError(
          `Expected value to match: ${description}`,
          description,
          JSON.stringify(value)
        );
      }
    },
  };
}

/**
 * Run a single test with timeout
 */
async function runTest(test: TestCase, timeout = 10000): Promise<TestResult> {
  const start = Date.now();

  try {
    await Promise.race([
      test.fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout)
      ),
    ]);

    return {
      name: test.name,
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    const err = error as Error & { expected?: string; actual?: string };
    return {
      name: test.name,
      passed: false,
      duration: Date.now() - start,
      error: err.message,
      expected: err.expected,
      actual: err.actual,
    };
  }
}

/**
 * Run a test suite
 */
export async function runSuite(suite: TestSuite): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const test of suite.tests) {
    const result = await runTest(test);
    results.push(result);
  }

  return results;
}

/**
 * Get all registered suites
 */
export function getSuites(): TestSuite[] {
  return suites;
}

/**
 * Clear all registered suites (for testing the test runner itself)
 */
export function clearSuites(): void {
  suites.length = 0;
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Print test results to console
 */
export function printResults(
  suiteResults: Map<string, TestResult[]>,
  options: { json?: boolean; verbose?: boolean } = {}
): { passed: number; failed: number; total: number } {
  let passed = 0;
  let failed = 0;
  let total = 0;
  const failures: Array<{ suite: string; test: TestResult }> = [];

  if (options.json) {
    const jsonOutput: Record<string, unknown> = {};
    for (const [suiteName, results] of suiteResults) {
      jsonOutput[suiteName] = results;
      for (const r of results) {
        total++;
        if (r.passed) passed++;
        else failed++;
      }
    }
    return { passed, failed, total };
  }

  for (const [suiteName, results] of suiteResults) {
    for (const result of results) {
      total++;
      const _icon = result.passed ? '✅' : '❌';
      const _duration = formatDuration(result.duration);

      if (result.passed) {
        passed++;
      } else {
        failed++;
        failures.push({ suite: suiteName, test: result });

        if (options.verbose && result.error) {
          // Verbose output handled elsewhere
        }
      }
    }
  }
  const _percentage = total > 0 ? Math.round((passed / total) * 100) : 0;

  if (failures.length > 0) {
    for (const { suite: _suite, test: _test } of failures) {
      // Failure details logged during test run
    }
  }

  return { passed, failed, total };
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run all registered test suites and return results
 */
export async function runAllSuites(): Promise<Array<{ name: string; results: TestResult[] }>> {
  const allResults: Array<{ name: string; results: TestResult[] }> = [];

  for (const suite of suites) {
    const results: TestResult[] = [];

    for (const test of suite.tests) {
      const result = await runTest(test);
      results.push(result);

      // Print test result immediately
      const _icon = result.passed ? '✅' : '❌';
      const _duration = formatDuration(result.duration);

      if (!result.passed) {
        if (verboseMode && result.error) {
          // Error details available in result
        }
      }

      // Add delay between tests if configured (to avoid rate limiting)
      if (testDelayMs > 0) {
        await sleep(testDelayMs);
      }
    }

    allResults.push({ name: suite.name, results });
  }

  return allResults;
}
