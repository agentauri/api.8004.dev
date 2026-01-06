/**
 * Edge Case and Advanced Consistency Tests
 *
 * Tests edge cases, boundary conditions, and advanced filter combinations.
 *
 * Usage: API_KEY="..." pnpm exec tsx scripts/consistency-tests/run-edge-case-tests.ts
 */

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.8004.dev';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('❌ API_KEY environment variable is required');
  process.exit(1);
}

// ============================================================================
// Types
// ============================================================================

interface AgentSummary {
  id: string;
  chainId: number;
  tokenId: string;
  name: string;
  description?: string;
  active?: boolean;
  hasMcp?: boolean;
  hasA2a?: boolean;
  x402Support?: boolean;
  oasf?: {
    skills?: Array<{ slug: string; confidence: number }>;
    domains?: Array<{ slug: string; confidence: number }>;
  };
  reputationScore?: number;
  searchScore?: number;
}

interface ApiResponse {
  success: boolean;
  data: AgentSummary[];
  meta: {
    total: number;
    hasMore: boolean;
    nextCursor?: string;
    searchMode?: string;
  };
  error?: string;
}

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  duration?: number;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
}

// ============================================================================
// HTTP Client
// ============================================================================

async function fetchApi(
  endpoint: string,
  options?: { method?: string; body?: unknown; params?: Record<string, string | number | boolean | undefined> }
): Promise<ApiResponse> {
  const url = new URL(`${API_BASE_URL}${endpoint}`);

  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method: options?.method || 'GET',
    headers: {
      'X-API-Key': API_KEY!,
      'Content-Type': 'application/json',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  return response.json() as Promise<ApiResponse>;
}

// ============================================================================
// Test Suites
// ============================================================================

async function testEdgeCases(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Edge Cases',
    tests: [],
    passed: 0,
    failed: 0,
  };

  const tests = [
    // Empty results handling
    {
      name: 'Query with no matches (gibberish)',
      params: { q: 'xyzabc123nonsense456', limit: 10 },
      validate: (r: ApiResponse) => r.success && r.data.length >= 0, // Should return empty or fallback
    },

    // Boundary limits
    {
      name: 'limit=1 (minimum)',
      params: { limit: 1 },
      validate: (r: ApiResponse) => r.success && r.data.length === 1,
    },
    {
      name: 'limit=100 (maximum)',
      params: { limit: 100 },
      validate: (r: ApiResponse) => r.success && r.data.length <= 100,
    },
    {
      name: 'limit=999 (over max, should clamp)',
      params: { limit: 999 },
      validate: (r: ApiResponse) => r.success && r.data.length <= 100,
    },

    // Offset boundary
    {
      name: 'offset=0 (first page)',
      params: { limit: 5, offset: 0 },
      validate: (r: ApiResponse) => r.success && r.data.length <= 5,
    },
    {
      name: 'offset=9999 (beyond data, should return empty)',
      params: { limit: 10, offset: 9999 },
      validate: (r: ApiResponse) => r.success && r.data.length === 0,
    },

    // Page boundary
    {
      name: 'page=1 (first page)',
      params: { limit: 5, page: 1 },
      validate: (r: ApiResponse) => r.success && r.data.length <= 5,
    },
    {
      name: 'page=999 (beyond data, should return empty)',
      params: { limit: 10, page: 999 },
      validate: (r: ApiResponse) => r.success && r.data.length === 0,
    },

    // Reputation boundaries
    {
      name: 'minRep=0 (minimum)',
      params: { minRep: 0, limit: 10 },
      validate: (r: ApiResponse) => r.success,
    },
    {
      name: 'maxRep=100 (maximum)',
      params: { maxRep: 100, limit: 10 },
      validate: (r: ApiResponse) => r.success,
    },
    {
      name: 'minRep=100, maxRep=100 (exact match)',
      params: { minRep: 100, maxRep: 100, limit: 10 },
      validate: (r: ApiResponse) => r.success,
    },
    {
      name: 'minRep=50, maxRep=60 (narrow range)',
      params: { minRep: 50, maxRep: 60, limit: 10 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) => {
        const score = a.reputationScore;
        if (score === undefined) return true; // No score = included by default
        return score >= 50 && score <= 60;
      }),
    },

    // minScore boundary
    {
      name: 'minScore=0 (include all)',
      params: { q: 'ai', minScore: 0, limit: 10 },
      validate: (r: ApiResponse) => r.success,
    },
    {
      name: 'minScore=0.9 (very high threshold)',
      params: { q: 'ai', minScore: 0.9, limit: 10 },
      validate: (r: ApiResponse) => r.success,
    },

    // Boolean filter edge cases
    {
      name: 'mcp=true + mcp filter redundancy',
      params: { mcp: 'true', limit: 10 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) => a.hasMcp === true),
    },
    {
      name: 'All boolean filters false (AND)',
      params: { mcp: 'false', a2a: 'false', x402: 'false', filterMode: 'AND', limit: 10 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) =>
        a.hasMcp === false && a.hasA2a === false && a.x402Support === false
      ),
    },

    // Empty array-like params
    {
      name: 'chainIds with single value',
      params: { chainIds: '11155111', limit: 10 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) => a.chainId === 11155111),
    },

    // Special characters in query
    {
      name: 'Query with special chars (url encoded)',
      params: { q: 'AI & ML', limit: 10 },
      validate: (r: ApiResponse) => r.success,
    },

    // Unicode in query
    {
      name: 'Query with unicode',
      params: { q: 'AI助手', limit: 10 },
      validate: (r: ApiResponse) => r.success,
    },

    // Very long query
    {
      name: 'Very long query (100 chars)',
      params: { q: 'a'.repeat(100), limit: 10 },
      validate: (r: ApiResponse) => r.success,
    },
  ];

  for (const test of tests) {
    const startTime = Date.now();
    try {
      const response = await fetchApi('/api/v1/agents', { params: test.params });
      const passed = test.validate(response);

      suite.tests.push({
        name: test.name,
        passed,
        details: `${response.success ? 'Success' : 'Error'}: ${response.data?.length ?? 0} results`,
        duration: Date.now() - startTime,
      });

      if (passed) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: test.name,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      });
      suite.failed++;
    }
  }

  return suite;
}

async function testComplexCombinations(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Complex Filter Combinations',
    tests: [],
    passed: 0,
    failed: 0,
  };

  const combinations = [
    // Triple filter AND
    {
      name: '3 filters AND: mcp + a2a + chainId',
      params: { mcp: 'true', a2a: 'true', chainId: '11155111', filterMode: 'AND', limit: 20 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) =>
        a.hasMcp === true && a.hasA2a === true && a.chainId === 11155111
      ),
    },

    // Query + multiple filters
    {
      name: 'Query + 3 boolean filters (OR)',
      params: { q: 'assistant', mcp: 'true', a2a: 'true', x402: 'true', filterMode: 'OR', limit: 20 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) =>
        a.hasMcp === true || a.hasA2a === true || a.x402Support === true
      ),
    },

    // Query + chain + boolean
    {
      name: 'Query + chain + boolean + sort',
      params: { q: 'data', chainId: '11155111', mcp: 'true', sort: 'name', order: 'asc', limit: 20 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) =>
        a.hasMcp === true && a.chainId === 11155111
      ),
    },

    // Reputation + boolean
    {
      name: 'minRep + mcp + a2a (AND)',
      params: { minRep: 30, mcp: 'true', a2a: 'true', filterMode: 'AND', limit: 20 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) =>
        a.hasMcp === true && a.hasA2a === true
      ),
    },

    // All chains
    {
      name: 'All 3 chains combined',
      params: { chainIds: '11155111,84532,80002', limit: 50 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) =>
        [11155111, 84532, 80002].includes(a.chainId)
      ),
    },

    // Pagination + filters + sort
    {
      name: 'Pagination + filters + sort',
      params: { mcp: 'true', chainId: '11155111', sort: 'createdAt', order: 'desc', limit: 10, page: 2 },
      validate: (r: ApiResponse) => r.success && r.data.every((a) =>
        a.hasMcp === true && a.chainId === 11155111
      ),
    },
  ];

  for (const combo of combinations) {
    const startTime = Date.now();
    try {
      const response = await fetchApi('/api/v1/agents', { params: combo.params });
      const passed = combo.validate(response);

      suite.tests.push({
        name: combo.name,
        passed,
        details: `${response.data.length} results, all valid: ${passed}`,
        duration: Date.now() - startTime,
      });

      if (passed) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: combo.name,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      });
      suite.failed++;
    }
  }

  return suite;
}

async function testPaginationDeep(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Deep Pagination Tests',
    tests: [],
    passed: 0,
    failed: 0,
  };

  // Test 1: Fetch multiple pages and verify no duplicates
  const startTime1 = Date.now();
  try {
    const allIds = new Set<string>();
    const pageSize = 50;
    const maxPages = 10;
    let duplicateFound = false;
    let cursor: string | undefined;

    for (let i = 0; i < maxPages; i++) {
      const params: Record<string, string | number> = { limit: pageSize };
      if (cursor) params.cursor = cursor;

      const response = await fetchApi('/api/v1/agents', { params });

      for (const agent of response.data) {
        if (allIds.has(agent.id)) {
          duplicateFound = true;
          break;
        }
        allIds.add(agent.id);
      }

      if (duplicateFound || !response.meta.hasMore || !response.meta.nextCursor) break;
      cursor = response.meta.nextCursor;
    }

    suite.tests.push({
      name: `No duplicates across ${maxPages} cursor pages`,
      passed: !duplicateFound,
      details: `${allIds.size} unique agents, duplicates: ${duplicateFound}`,
      duration: Date.now() - startTime1,
    });

    if (!duplicateFound) suite.passed++;
    else suite.failed++;
  } catch (error) {
    suite.tests.push({
      name: 'No duplicates across cursor pages',
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime1,
    });
    suite.failed++;
  }

  // Test 2: Compare page-based vs offset-based
  const startTime2 = Date.now();
  try {
    const pageResponse = await fetchApi('/api/v1/agents', { params: { limit: 10, page: 3 } });
    const offsetResponse = await fetchApi('/api/v1/agents', { params: { limit: 10, offset: 20 } });

    const pageIds = new Set(pageResponse.data.map((a) => a.id));
    const offsetIds = new Set(offsetResponse.data.map((a) => a.id));
    const overlap = [...pageIds].filter((id) => offsetIds.has(id)).length;

    // They should return the same results (page 3 = offset 20 with limit 10)
    const passed = overlap === pageResponse.data.length;

    suite.tests.push({
      name: 'page=3 vs offset=20 consistency',
      passed,
      details: `Page: ${pageResponse.data.length}, Offset: ${offsetResponse.data.length}, Overlap: ${overlap}`,
      duration: Date.now() - startTime2,
    });

    if (passed) suite.passed++;
    else suite.failed++;
  } catch (error) {
    suite.tests.push({
      name: 'page vs offset consistency',
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime2,
    });
    suite.failed++;
  }

  // Test 3: Pagination with filters maintains consistency
  const startTime3 = Date.now();
  try {
    const params = { mcp: 'true', chainId: '11155111', limit: 10 };

    const page1 = await fetchApi('/api/v1/agents', { params: { ...params, page: 1 } });
    const page2 = await fetchApi('/api/v1/agents', { params: { ...params, page: 2 } });

    const page1Ids = new Set(page1.data.map((a) => a.id));
    const page2Ids = new Set(page2.data.map((a) => a.id));
    const overlap = [...page1Ids].filter((id) => page2Ids.has(id)).length;

    // Verify all results match filters
    const allMatchFilters =
      page1.data.every((a) => a.hasMcp === true && a.chainId === 11155111) &&
      page2.data.every((a) => a.hasMcp === true && a.chainId === 11155111);

    const passed = overlap === 0 && allMatchFilters;

    suite.tests.push({
      name: 'Pagination with filters (mcp + chainId)',
      passed,
      details: `Page1: ${page1.data.length}, Page2: ${page2.data.length}, Overlap: ${overlap}, Filters valid: ${allMatchFilters}`,
      duration: Date.now() - startTime3,
    });

    if (passed) suite.passed++;
    else suite.failed++;
  } catch (error) {
    suite.tests.push({
      name: 'Pagination with filters',
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime3,
    });
    suite.failed++;
  }

  return suite;
}

async function testSearchEndpointPost(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'POST /search Endpoint',
    tests: [],
    passed: 0,
    failed: 0,
  };

  const searchTests = [
    // Basic queries
    { name: 'Basic query: ai', body: { query: 'ai', limit: 10 } },
    { name: 'Basic query: crypto', body: { query: 'crypto', limit: 10 } },

    // With filters
    {
      name: 'Query + mcp filter',
      body: { query: 'assistant', filters: { mcp: true }, limit: 10 },
      validate: (r: ApiResponse) => r.data.every((a) => a.hasMcp === true),
    },
    {
      name: 'Query + chainIds filter',
      body: { query: 'data', filters: { chainIds: [11155111] }, limit: 10 },
      validate: (r: ApiResponse) => r.data.every((a) => a.chainId === 11155111),
    },
    {
      name: 'Query + multiple filters (AND)',
      body: { query: 'ai', filters: { mcp: true, a2a: true, filterMode: 'AND' }, limit: 10 },
      validate: (r: ApiResponse) => r.data.every((a) => a.hasMcp === true && a.hasA2a === true),
    },
    {
      name: 'Query + multiple filters (OR)',
      body: { query: 'ai', filters: { mcp: true, a2a: true, filterMode: 'OR' }, limit: 10 },
      validate: (r: ApiResponse) => r.data.every((a) => a.hasMcp === true || a.hasA2a === true),
    },

    // Pagination
    { name: 'With offset', body: { query: 'ai', offset: 5, limit: 10 } },
    { name: 'High minScore', body: { query: 'ai', minScore: 0.5, limit: 10 } },
  ];

  for (const test of searchTests) {
    const startTime = Date.now();
    try {
      const response = await fetchApi('/api/v1/search', { method: 'POST', body: test.body });

      let passed = response.success;
      if (test.validate && passed) {
        passed = test.validate(response);
      }

      suite.tests.push({
        name: test.name,
        passed,
        details: `${response.data.length} results`,
        duration: Date.now() - startTime,
      });

      if (passed) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: test.name,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      });
      suite.failed++;
    }
  }

  return suite;
}

// ============================================================================
// Main Runner
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log('='.repeat(80));
  console.log('🧪 Edge Case and Advanced Consistency Tests');
  console.log(`📍 API: ${API_BASE_URL}`);
  console.log('='.repeat(80));
  console.log('');

  const allSuites: TestSuite[] = [];

  const suiteRunners = [
    { name: 'Edge Cases', fn: testEdgeCases },
    { name: 'Complex Combinations', fn: testComplexCombinations },
    { name: 'Deep Pagination', fn: testPaginationDeep },
    { name: 'POST /search', fn: testSearchEndpointPost },
  ];

  for (const runner of suiteRunners) {
    process.stdout.write(`  Running ${runner.name}...`);
    const startTime = Date.now();
    try {
      const suite = await runner.fn();
      allSuites.push(suite);
      const duration = Date.now() - startTime;
      console.log(` ✅ (${suite.passed}/${suite.tests.length} passed, ${duration}ms)`);
    } catch (error) {
      console.log(` ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Print detailed results
  console.log('\n' + '='.repeat(80));
  console.log('📊 Detailed Results');
  console.log('='.repeat(80));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of allSuites) {
    console.log(`\n### ${suite.name} ###`);
    console.log(`Passed: ${suite.passed}, Failed: ${suite.failed}`);
    console.log('-'.repeat(60));

    for (const test of suite.tests) {
      const status = test.passed ? '✅' : '❌';
      const duration = test.duration ? ` (${test.duration}ms)` : '';
      console.log(`  ${status} ${test.name}${duration}`);
      if (test.details) {
        console.log(`     ${test.details}`);
      }
    }

    totalPassed += suite.passed;
    totalFailed += suite.failed;
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📈 Summary');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalPassed + totalFailed}`);
  console.log(`  ✅ Passed: ${totalPassed}`);
  console.log(`  ❌ Failed: ${totalFailed}`);
  console.log('');

  if (totalFailed > 0) {
    console.log('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
