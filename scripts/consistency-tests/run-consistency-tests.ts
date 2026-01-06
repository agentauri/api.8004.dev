/**
 * Comprehensive Consistency Test Suite
 *
 * Tests that SDK, Search Service, and our API return consistent results
 * for all filters, combinations, and pagination types.
 *
 * Usage: API_KEY="..." pnpm exec tsx scripts/consistency-tests/run-consistency-tests.ts
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
    skills?: Array<{ slug: string }>;
    domains?: Array<{ slug: string }>;
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
    stats?: {
      total: number;
      withRegistrationFile: number;
      active: number;
    };
  };
}

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  apiCount?: number;
  expectedBehavior?: string;
  duration?: number;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
}

// ============================================================================
// HTTP Client
// ============================================================================

async function fetchApi(
  endpoint: string,
  options?: { method?: string; body?: unknown; params?: Record<string, string | number | boolean | undefined> }
): Promise<ApiResponse> {
  const url = new URL(`${API_BASE_URL}${endpoint}`);

  // Add query params
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

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<ApiResponse>;
}

// ============================================================================
// Test Utilities
// ============================================================================

function compareAgentSets(
  set1: AgentSummary[],
  set2: AgentSummary[],
  tolerance: number = 0
): { match: boolean; details: string } {
  const ids1 = new Set(set1.map((a) => a.id));
  const ids2 = new Set(set2.map((a) => a.id));

  const inBoth = [...ids1].filter((id) => ids2.has(id));
  const onlyIn1 = [...ids1].filter((id) => !ids2.has(id));
  const onlyIn2 = [...ids2].filter((id) => !ids1.has(id));

  const diff = Math.abs(ids1.size - ids2.size);
  const match = diff <= tolerance && onlyIn1.length <= tolerance && onlyIn2.length <= tolerance;

  return {
    match,
    details: `Set1: ${ids1.size}, Set2: ${ids2.size}, Common: ${inBoth.length}, OnlyIn1: ${onlyIn1.length}, OnlyIn2: ${onlyIn2.length}`,
  };
}

function validateFilter(agents: AgentSummary[], filter: string, expected: unknown): boolean {
  switch (filter) {
    case 'mcp':
      return agents.every((a) => a.hasMcp === expected);
    case 'a2a':
      return agents.every((a) => a.hasA2a === expected);
    case 'x402':
      return agents.every((a) => a.x402Support === expected);
    case 'active':
      return agents.every((a) => a.active === expected);
    case 'chainId':
      return agents.every((a) => a.chainId === expected);
    case 'minRep':
      return agents.every((a) => (a.reputationScore ?? 0) >= (expected as number));
    case 'maxRep':
      return agents.every((a) => (a.reputationScore ?? 100) <= (expected as number));
    default:
      return true;
  }
}

// ============================================================================
// Test Suites
// ============================================================================

async function testSingleFilters(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Single Filters',
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  const filters = [
    // Boolean filters
    { name: 'mcp=true', params: { mcp: 'true' }, validate: (a: AgentSummary) => a.hasMcp === true },
    { name: 'mcp=false', params: { mcp: 'false' }, validate: (a: AgentSummary) => a.hasMcp === false },
    { name: 'a2a=true', params: { a2a: 'true' }, validate: (a: AgentSummary) => a.hasA2a === true },
    { name: 'a2a=false', params: { a2a: 'false' }, validate: (a: AgentSummary) => a.hasA2a === false },
    { name: 'x402=true', params: { x402: 'true' }, validate: (a: AgentSummary) => a.x402Support === true },
    { name: 'active=true', params: { active: 'true' }, validate: (a: AgentSummary) => a.active === true },

    // Chain filters
    { name: 'chainId=11155111 (Sepolia)', params: { chainId: '11155111' }, validate: (a: AgentSummary) => a.chainId === 11155111 },
    { name: 'chainId=84532 (Base Sepolia)', params: { chainId: '84532' }, validate: (a: AgentSummary) => a.chainId === 84532 },
    { name: 'chainId=80002 (Polygon Amoy)', params: { chainId: '80002' }, validate: (a: AgentSummary) => a.chainId === 80002 },
    { name: 'chainIds=11155111,84532', params: { chainIds: '11155111,84532' }, validate: (a: AgentSummary) => [11155111, 84532].includes(a.chainId) },

    // Reputation filters
    { name: 'minRep=50', params: { minRep: '50' }, validate: (a: AgentSummary) => (a.reputationScore ?? 0) >= 50 || a.reputationScore === undefined },
    { name: 'maxRep=80', params: { maxRep: '80' }, validate: (a: AgentSummary) => (a.reputationScore ?? 0) <= 80 },

    // Search query
    { name: 'q=ai', params: { q: 'ai' }, validate: () => true }, // Can't validate content match easily
    { name: 'q=crypto', params: { q: 'crypto' }, validate: () => true },
    { name: 'q=data', params: { q: 'data' }, validate: () => true },
  ];

  for (const filter of filters) {
    const startTime = Date.now();
    try {
      const response = await fetchApi('/api/v1/agents', { params: { ...filter.params, limit: 50 } });
      const duration = Date.now() - startTime;

      // Validate filter was applied correctly
      const allValid = response.data.every(filter.validate);
      const passed = response.success && allValid;

      suite.tests.push({
        name: filter.name,
        passed,
        details: `${response.data.length} results, total: ${response.meta.total}, valid: ${allValid}`,
        apiCount: response.data.length,
        duration,
      });

      if (passed) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: filter.name,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      });
      suite.failed++;
    }
  }

  return suite;
}

async function testFilterCombinations(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Filter Combinations (AND/OR)',
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  const combinations = [
    // AND mode (default)
    {
      name: 'AND: mcp=true + a2a=true',
      params: { mcp: 'true', a2a: 'true', filterMode: 'AND' },
      validate: (a: AgentSummary) => a.hasMcp === true && a.hasA2a === true,
    },
    {
      name: 'AND: mcp=true + chainId=11155111',
      params: { mcp: 'true', chainId: '11155111', filterMode: 'AND' },
      validate: (a: AgentSummary) => a.hasMcp === true && a.chainId === 11155111,
    },
    {
      name: 'AND: a2a=true + x402=true',
      params: { a2a: 'true', x402: 'true', filterMode: 'AND' },
      validate: (a: AgentSummary) => a.hasA2a === true && a.x402Support === true,
    },
    {
      name: 'AND: mcp=true + a2a=true + active=true',
      params: { mcp: 'true', a2a: 'true', active: 'true', filterMode: 'AND' },
      validate: (a: AgentSummary) => a.hasMcp === true && a.hasA2a === true && a.active === true,
    },

    // OR mode
    {
      name: 'OR: mcp=true | a2a=true',
      params: { mcp: 'true', a2a: 'true', filterMode: 'OR' },
      validate: (a: AgentSummary) => a.hasMcp === true || a.hasA2a === true,
    },
    {
      name: 'OR: mcp=true | x402=true',
      params: { mcp: 'true', x402: 'true', filterMode: 'OR' },
      validate: (a: AgentSummary) => a.hasMcp === true || a.x402Support === true,
    },
    {
      name: 'OR: a2a=true | x402=true',
      params: { a2a: 'true', x402: 'true', filterMode: 'OR' },
      validate: (a: AgentSummary) => a.hasA2a === true || a.x402Support === true,
    },
    {
      name: 'OR: mcp=true | a2a=true | x402=true',
      params: { mcp: 'true', a2a: 'true', x402: 'true', filterMode: 'OR' },
      validate: (a: AgentSummary) => a.hasMcp === true || a.hasA2a === true || a.x402Support === true,
    },

    // Mixed: boolean filters + chain filter
    {
      name: 'AND: mcp=true + chainIds=11155111,84532',
      params: { mcp: 'true', chainIds: '11155111,84532', filterMode: 'AND' },
      validate: (a: AgentSummary) => a.hasMcp === true && [11155111, 84532].includes(a.chainId),
    },

    // Query + filters
    {
      name: 'q=ai + mcp=true',
      params: { q: 'ai', mcp: 'true' },
      validate: (a: AgentSummary) => a.hasMcp === true,
    },
    {
      name: 'q=crypto + a2a=true + chainId=11155111',
      params: { q: 'crypto', a2a: 'true', chainId: '11155111' },
      validate: (a: AgentSummary) => a.hasA2a === true && a.chainId === 11155111,
    },
  ];

  for (const combo of combinations) {
    const startTime = Date.now();
    try {
      const response = await fetchApi('/api/v1/agents', { params: { ...combo.params, limit: 50 } });
      const duration = Date.now() - startTime;

      const allValid = response.data.every(combo.validate);
      const passed = response.success && allValid;

      suite.tests.push({
        name: combo.name,
        passed,
        details: `${response.data.length} results, valid: ${allValid}`,
        apiCount: response.data.length,
        duration,
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

async function testPagination(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Pagination',
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  // Test 1: Limit variations
  const limits = [5, 10, 20, 50, 100];
  for (const limit of limits) {
    const startTime = Date.now();
    try {
      const response = await fetchApi('/api/v1/agents', { params: { limit } });
      const passed = response.success && response.data.length <= limit;

      suite.tests.push({
        name: `limit=${limit}`,
        passed,
        details: `Got ${response.data.length} results (expected <= ${limit})`,
        apiCount: response.data.length,
        duration: Date.now() - startTime,
      });

      if (passed) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: `limit=${limit}`,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      });
      suite.failed++;
    }
  }

  // Test 2: Page-based pagination
  const startTime2 = Date.now();
  try {
    const page1 = await fetchApi('/api/v1/agents', { params: { limit: 10, page: 1 } });
    const page2 = await fetchApi('/api/v1/agents', { params: { limit: 10, page: 2 } });

    const page1Ids = new Set(page1.data.map((a) => a.id));
    const page2Ids = new Set(page2.data.map((a) => a.id));
    const overlap = [...page1Ids].filter((id) => page2Ids.has(id));

    const passed = page1.success && page2.success && overlap.length === 0;

    suite.tests.push({
      name: 'page-based (page=1 vs page=2)',
      passed,
      details: `Page1: ${page1.data.length}, Page2: ${page2.data.length}, Overlap: ${overlap.length}`,
      duration: Date.now() - startTime2,
    });

    if (passed) suite.passed++;
    else suite.failed++;
  } catch (error) {
    suite.tests.push({
      name: 'page-based (page=1 vs page=2)',
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime2,
    });
    suite.failed++;
  }

  // Test 3: Offset-based pagination
  const startTime3 = Date.now();
  try {
    const offset0 = await fetchApi('/api/v1/agents', { params: { limit: 10, offset: 0 } });
    const offset10 = await fetchApi('/api/v1/agents', { params: { limit: 10, offset: 10 } });

    const offset0Ids = new Set(offset0.data.map((a) => a.id));
    const offset10Ids = new Set(offset10.data.map((a) => a.id));
    const overlap = [...offset0Ids].filter((id) => offset10Ids.has(id));

    const passed = offset0.success && offset10.success && overlap.length === 0;

    suite.tests.push({
      name: 'offset-based (offset=0 vs offset=10)',
      passed,
      details: `Offset0: ${offset0.data.length}, Offset10: ${offset10.data.length}, Overlap: ${overlap.length}`,
      duration: Date.now() - startTime3,
    });

    if (passed) suite.passed++;
    else suite.failed++;
  } catch (error) {
    suite.tests.push({
      name: 'offset-based (offset=0 vs offset=10)',
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime3,
    });
    suite.failed++;
  }

  // Test 4: Cursor-based pagination
  const startTime4 = Date.now();
  try {
    const page1 = await fetchApi('/api/v1/agents', { params: { limit: 10 } });

    if (page1.meta.nextCursor) {
      const page2 = await fetchApi('/api/v1/agents', { params: { limit: 10, cursor: page1.meta.nextCursor } });

      const page1Ids = new Set(page1.data.map((a) => a.id));
      const page2Ids = new Set(page2.data.map((a) => a.id));
      const overlap = [...page1Ids].filter((id) => page2Ids.has(id));

      const passed = page1.success && page2.success && overlap.length === 0;

      suite.tests.push({
        name: 'cursor-based (using nextCursor)',
        passed,
        details: `Page1: ${page1.data.length}, Page2: ${page2.data.length}, Overlap: ${overlap.length}`,
        duration: Date.now() - startTime4,
      });

      if (passed) suite.passed++;
      else suite.failed++;
    } else {
      suite.tests.push({
        name: 'cursor-based (using nextCursor)',
        passed: true,
        details: 'No nextCursor (all results fit in one page)',
        duration: Date.now() - startTime4,
      });
      suite.passed++;
    }
  } catch (error) {
    suite.tests.push({
      name: 'cursor-based (using nextCursor)',
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime4,
    });
    suite.failed++;
  }

  // Test 5: Pagination consistency across multiple pages
  const startTime5 = Date.now();
  try {
    const allAgentIds = new Set<string>();
    let cursor: string | undefined;
    let pageCount = 0;
    const maxPages = 5;

    while (pageCount < maxPages) {
      const params: Record<string, string | number> = { limit: 20 };
      if (cursor) params.cursor = cursor;

      const response = await fetchApi('/api/v1/agents', { params });
      for (const agent of response.data) {
        if (allAgentIds.has(agent.id)) {
          throw new Error(`Duplicate agent found: ${agent.id}`);
        }
        allAgentIds.add(agent.id);
      }

      cursor = response.meta.nextCursor;
      pageCount++;

      if (!response.meta.hasMore || !cursor) break;
    }

    suite.tests.push({
      name: `pagination consistency (${pageCount} pages)`,
      passed: true,
      details: `${allAgentIds.size} unique agents across ${pageCount} pages`,
      apiCount: allAgentIds.size,
      duration: Date.now() - startTime5,
    });
    suite.passed++;
  } catch (error) {
    suite.tests.push({
      name: 'pagination consistency',
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime5,
    });
    suite.failed++;
  }

  return suite;
}

async function testSorting(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Sorting',
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  const sortTests = [
    { sort: 'name', order: 'asc', validator: (a: AgentSummary, b: AgentSummary) => a.name.localeCompare(b.name) <= 0 },
    { sort: 'name', order: 'desc', validator: (a: AgentSummary, b: AgentSummary) => a.name.localeCompare(b.name) >= 0 },
    { sort: 'createdAt', order: 'desc', validator: (a: AgentSummary, b: AgentSummary) => Number(a.tokenId) >= Number(b.tokenId) },
    { sort: 'createdAt', order: 'asc', validator: (a: AgentSummary, b: AgentSummary) => Number(a.tokenId) <= Number(b.tokenId) },
    { sort: 'reputation', order: 'desc', validator: (a: AgentSummary, b: AgentSummary) => (a.reputationScore ?? -1) >= (b.reputationScore ?? -1) },
    { sort: 'reputation', order: 'asc', validator: (a: AgentSummary, b: AgentSummary) => (a.reputationScore ?? 101) <= (b.reputationScore ?? 101) },
  ];

  for (const test of sortTests) {
    const startTime = Date.now();
    try {
      const response = await fetchApi('/api/v1/agents', {
        params: { limit: 20, sort: test.sort, order: test.order },
      });

      // Check if sorted correctly
      let isSorted = true;
      for (let i = 1; i < response.data.length; i++) {
        const prev = response.data[i - 1];
        const curr = response.data[i];
        if (prev && curr && !test.validator(prev, curr)) {
          isSorted = false;
          break;
        }
      }

      suite.tests.push({
        name: `sort=${test.sort}, order=${test.order}`,
        passed: isSorted,
        details: `${response.data.length} results, sorted: ${isSorted}`,
        apiCount: response.data.length,
        duration: Date.now() - startTime,
      });

      if (isSorted) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: `sort=${test.sort}, order=${test.order}`,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      });
      suite.failed++;
    }
  }

  return suite;
}

async function testSearchVsAgentsEndpoint(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Search vs Agents Endpoint Consistency',
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  const queries = ['ai', 'crypto', 'data', 'chat', 'assistant'];

  for (const query of queries) {
    const startTime = Date.now();
    try {
      // GET /agents?q=...
      const agentsResponse = await fetchApi('/api/v1/agents', { params: { q: query, limit: 20 } });

      // POST /search
      const searchResponse = await fetchApi('/api/v1/search', {
        method: 'POST',
        body: { query, limit: 20 },
      });

      // Compare results
      const comparison = compareAgentSets(agentsResponse.data, searchResponse.data, 5);

      suite.tests.push({
        name: `q="${query}"`,
        passed: comparison.match,
        details: `Agents: ${agentsResponse.data.length}, Search: ${searchResponse.data.length}, ${comparison.details}`,
        duration: Date.now() - startTime,
      });

      if (comparison.match) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: `q="${query}"`,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      });
      suite.failed++;
    }
  }

  // Test with filters
  const filterTests = [
    { query: 'ai', filters: { mcp: true } },
    { query: 'crypto', filters: { chainIds: [11155111] } },
    { query: 'data', filters: { a2a: true, mcp: true, filterMode: 'OR' as const } },
  ];

  for (const test of filterTests) {
    const startTime = Date.now();
    try {
      // GET /agents with filters
      const agentsParams: Record<string, string | number | boolean> = { q: test.query, limit: 20 };
      if (test.filters.mcp !== undefined) agentsParams.mcp = String(test.filters.mcp);
      if (test.filters.a2a !== undefined) agentsParams.a2a = String(test.filters.a2a);
      if (test.filters.chainIds) agentsParams.chainIds = test.filters.chainIds.join(',');
      if (test.filters.filterMode) agentsParams.filterMode = test.filters.filterMode;

      const agentsResponse = await fetchApi('/api/v1/agents', { params: agentsParams });

      // POST /search with filters
      const searchResponse = await fetchApi('/api/v1/search', {
        method: 'POST',
        body: {
          query: test.query,
          limit: 20,
          filters: test.filters,
        },
      });

      const comparison = compareAgentSets(agentsResponse.data, searchResponse.data, 5);
      const filterStr = JSON.stringify(test.filters);

      suite.tests.push({
        name: `q="${test.query}" + filters=${filterStr}`,
        passed: comparison.match,
        details: `Agents: ${agentsResponse.data.length}, Search: ${searchResponse.data.length}, ${comparison.details}`,
        duration: Date.now() - startTime,
      });

      if (comparison.match) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: `q="${test.query}" + filters`,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      });
      suite.failed++;
    }
  }

  return suite;
}

async function testSkillsDomains(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Skills/Domains Filtering',
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  // First, get some agents with classifications to extract valid skills/domains
  const startTime1 = Date.now();
  try {
    const sampleResponse = await fetchApi('/api/v1/agents', { params: { limit: 100 } });
    const agentsWithOasf = sampleResponse.data.filter((a) => a.oasf?.skills?.length || a.oasf?.domains?.length);

    if (agentsWithOasf.length === 0) {
      suite.tests.push({
        name: 'skills/domains sample',
        passed: true,
        details: 'No agents with OASF classifications found - skipping skill/domain tests',
        duration: Date.now() - startTime1,
      });
      suite.skipped++;
      return suite;
    }

    // Extract unique skills and domains
    const allSkills = new Set<string>();
    const allDomains = new Set<string>();
    for (const agent of agentsWithOasf) {
      agent.oasf?.skills?.forEach((s) => allSkills.add(s.slug));
      agent.oasf?.domains?.forEach((d) => allDomains.add(d.slug));
    }

    suite.tests.push({
      name: 'skills/domains sample',
      passed: true,
      details: `Found ${allSkills.size} unique skills, ${allDomains.size} unique domains`,
      duration: Date.now() - startTime1,
    });
    suite.passed++;

    // Test skill filtering
    const skillsToTest = [...allSkills].slice(0, 3);
    for (const skill of skillsToTest) {
      const startTime = Date.now();
      try {
        const response = await fetchApi('/api/v1/agents', { params: { skills: skill, limit: 20 } });

        // Validate all returned agents have the skill
        const allHaveSkill = response.data.every(
          (a) => a.oasf?.skills?.some((s) => s.slug === skill) ?? false
        );

        suite.tests.push({
          name: `skills=${skill}`,
          passed: allHaveSkill || response.data.length === 0,
          details: `${response.data.length} results, all have skill: ${allHaveSkill}`,
          apiCount: response.data.length,
          duration: Date.now() - startTime,
        });

        if (allHaveSkill || response.data.length === 0) suite.passed++;
        else suite.failed++;
      } catch (error) {
        suite.tests.push({
          name: `skills=${skill}`,
          passed: false,
          details: `Error: ${error instanceof Error ? error.message : String(error)}`,
          duration: Date.now() - startTime,
        });
        suite.failed++;
      }
    }

    // Test domain filtering
    const domainsToTest = [...allDomains].slice(0, 3);
    for (const domain of domainsToTest) {
      const startTime = Date.now();
      try {
        const response = await fetchApi('/api/v1/agents', { params: { domains: domain, limit: 20 } });

        const allHaveDomain = response.data.every(
          (a) => a.oasf?.domains?.some((d) => d.slug === domain) ?? false
        );

        suite.tests.push({
          name: `domains=${domain}`,
          passed: allHaveDomain || response.data.length === 0,
          details: `${response.data.length} results, all have domain: ${allHaveDomain}`,
          apiCount: response.data.length,
          duration: Date.now() - startTime,
        });

        if (allHaveDomain || response.data.length === 0) suite.passed++;
        else suite.failed++;
      } catch (error) {
        suite.tests.push({
          name: `domains=${domain}`,
          passed: false,
          details: `Error: ${error instanceof Error ? error.message : String(error)}`,
          duration: Date.now() - startTime,
        });
        suite.failed++;
      }
    }
  } catch (error) {
    suite.tests.push({
      name: 'skills/domains sample',
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime1,
    });
    suite.failed++;
  }

  return suite;
}

async function testSearchModes(): Promise<TestSuite> {
  const suite: TestSuite = {
    name: 'Search Modes',
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  const modes = ['auto', 'semantic', 'name'];
  const query = 'ai assistant';

  for (const mode of modes) {
    const startTime = Date.now();
    try {
      const response = await fetchApi('/api/v1/agents', {
        params: { q: query, searchMode: mode, limit: 20 },
      });

      suite.tests.push({
        name: `searchMode=${mode}`,
        passed: response.success,
        details: `${response.data.length} results, mode: ${response.meta.searchMode}`,
        apiCount: response.data.length,
        duration: Date.now() - startTime,
      });

      if (response.success) suite.passed++;
      else suite.failed++;
    } catch (error) {
      suite.tests.push({
        name: `searchMode=${mode}`,
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
  console.log('🧪 Comprehensive Consistency Test Suite');
  console.log(`📍 API: ${API_BASE_URL}`);
  console.log('='.repeat(80));
  console.log('');

  const allSuites: TestSuite[] = [];

  // Run all test suites
  console.log('Running tests...\n');

  const suiteRunners = [
    { name: 'Single Filters', fn: testSingleFilters },
    { name: 'Filter Combinations', fn: testFilterCombinations },
    { name: 'Pagination', fn: testPagination },
    { name: 'Sorting', fn: testSorting },
    { name: 'Search vs Agents', fn: testSearchVsAgentsEndpoint },
    { name: 'Skills/Domains', fn: testSkillsDomains },
    { name: 'Search Modes', fn: testSearchModes },
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
  let totalSkipped = 0;

  for (const suite of allSuites) {
    console.log(`\n### ${suite.name} ###`);
    console.log(`Passed: ${suite.passed}, Failed: ${suite.failed}, Skipped: ${suite.skipped}`);
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
    totalSkipped += suite.skipped;
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📈 Summary');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalPassed + totalFailed + totalSkipped}`);
  console.log(`  ✅ Passed:  ${totalPassed}`);
  console.log(`  ❌ Failed:  ${totalFailed}`);
  console.log(`  ⏭️  Skipped: ${totalSkipped}`);
  console.log('');

  if (totalFailed > 0) {
    console.log('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
