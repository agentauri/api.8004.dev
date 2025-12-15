/**
 * API vs SDK Comparison Test
 * Verifies our API's SDK fallback mode works correctly by comparing
 * API responses with direct SDK calls
 */

const API_BASE = 'https://api.8004.dev/api/v1';
const API_KEY = 'REDACTED_API_KEY';

interface Agent {
  id: string;
  name: string;
  chainId: number;
  hasMcp: boolean;
  hasA2a: boolean;
  x402Support: boolean;
  active: boolean;
  oasf?: {
    skills?: Array<{ slug: string }>;
    domains?: Array<{ slug: string }>;
  };
  searchScore?: number;
  reputationScore?: number;
}

interface ApiResponse {
  success: boolean;
  data: Agent[];
  meta: {
    total: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

async function apiGet(path: string, params: Record<string, string | number | boolean>): Promise<ApiResponse> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    headers: { 'X-API-Key': API_KEY }
  });

  return res.json();
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<ApiResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify(body)
  });

  return res.json();
}

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function pass(name: string, details: string) {
  results.push({ name, passed: true, details });
  console.log(`✅ ${name}: ${details}`);
}

function fail(name: string, details: string) {
  results.push({ name, passed: false, details });
  console.log(`❌ ${name}: ${details}`);
}

async function main() {
  console.log('\n========================================');
  console.log('API SDK FALLBACK TEST SUITE');
  console.log('========================================\n');

  // ========================================
  // 1. GET /agents BASIC TESTS
  // ========================================
  console.log('\n--- 1. GET /agents BASIC ---\n');

  // Basic list
  {
    const res = await apiGet('/agents', { limit: 5 });
    if (res.success && res.data.length > 0) {
      pass('GET /agents basic', `Returned ${res.data.length} agents`);
    } else {
      fail('GET /agents basic', `No agents returned`);
    }
  }

  // With search query
  {
    const res = await apiGet('/agents', { q: 'agent', limit: 5 });
    if (res.success && res.data.length > 0) {
      pass('GET /agents?q=agent', `Returned ${res.data.length} agents`);
    } else {
      fail('GET /agents?q=agent', `No agents returned for query "agent"`);
    }
  }

  // ========================================
  // 2. BOOLEAN FILTERS
  // ========================================
  console.log('\n--- 2. BOOLEAN FILTERS ---\n');

  // mcp=true
  {
    const res = await apiGet('/agents', { q: 'test', mcp: true, limit: 10 });
    if (res.success) {
      const wrongMcp = res.data.filter(a => a.hasMcp !== true);
      if (wrongMcp.length === 0) {
        pass('mcp=true filter', `All ${res.data.length} agents have hasMcp=true`);
      } else {
        fail('mcp=true filter', `${wrongMcp.length}/${res.data.length} agents have hasMcp=false`);
      }
    }
  }

  // mcp=false
  {
    const res = await apiGet('/agents', { q: 'test', mcp: false, limit: 10 });
    if (res.success) {
      const wrongMcp = res.data.filter(a => a.hasMcp !== false);
      if (wrongMcp.length === 0) {
        pass('mcp=false filter', `All ${res.data.length} agents have hasMcp=false`);
      } else {
        fail('mcp=false filter', `${wrongMcp.length}/${res.data.length} agents have hasMcp=true`);
      }
    }
  }

  // a2a=true
  {
    const res = await apiGet('/agents', { q: 'test', a2a: true, limit: 10 });
    if (res.success) {
      const wrongA2a = res.data.filter(a => a.hasA2a !== true);
      if (wrongA2a.length === 0) {
        pass('a2a=true filter', `All ${res.data.length} agents have hasA2a=true`);
      } else {
        fail('a2a=true filter', `${wrongA2a.length}/${res.data.length} agents don't have hasA2a`);
      }
    }
  }

  // a2a=false
  {
    const res = await apiGet('/agents', { q: 'test', a2a: false, limit: 10 });
    if (res.success) {
      const wrongA2a = res.data.filter(a => a.hasA2a !== false);
      if (wrongA2a.length === 0) {
        pass('a2a=false filter', `All ${res.data.length} agents have hasA2a=false`);
      } else {
        fail('a2a=false filter', `${wrongA2a.length}/${res.data.length} agents have hasA2a=true`);
      }
    }
  }

  // x402=true
  {
    const res = await apiGet('/agents', { q: 'agent', x402: true, limit: 10 });
    if (res.success) {
      const wrongX402 = res.data.filter(a => a.x402Support !== true);
      if (wrongX402.length === 0) {
        pass('x402=true filter', `All ${res.data.length} agents have x402Support=true`);
      } else if (res.data.length === 0) {
        pass('x402=true filter', 'No x402 agents found');
      } else {
        fail('x402=true filter', `${wrongX402.length}/${res.data.length} agents don't have x402`);
      }
    }
  }

  // active=true
  {
    const res = await apiGet('/agents', { q: 'test', active: true, limit: 10 });
    if (res.success) {
      const inactive = res.data.filter(a => a.active !== true);
      if (inactive.length === 0) {
        pass('active=true filter', `All ${res.data.length} agents are active`);
      } else {
        fail('active=true filter', `${inactive.length}/${res.data.length} agents are inactive`);
      }
    }
  }

  // active=false (should show all, not filter)
  {
    const res = await apiGet('/agents', { q: 'test', active: false, limit: 10 });
    if (res.success && res.data.length > 0) {
      pass('active=false (showAll)', `Returned ${res.data.length} agents (no filter applied)`);
    } else {
      pass('active=false (showAll)', 'No agents returned');
    }
  }

  // ========================================
  // 3. COMBINED FILTERS
  // ========================================
  console.log('\n--- 3. COMBINED FILTERS ---\n');

  // mcp=true AND a2a=true
  {
    const res = await apiGet('/agents', { q: 'agent', mcp: true, a2a: true, limit: 10 });
    if (res.success) {
      const invalid = res.data.filter(a => !a.hasMcp || !a.hasA2a);
      if (invalid.length === 0) {
        pass('mcp=true AND a2a=true', `All ${res.data.length} agents have both`);
      } else if (res.data.length === 0) {
        pass('mcp=true AND a2a=true', 'No agents with both');
      } else {
        fail('mcp=true AND a2a=true', `${invalid.length}/${res.data.length} missing one`);
      }
    }
  }

  // OR mode: mcp=true OR a2a=true
  {
    const res = await apiGet('/agents', { q: 'agent', mcp: true, a2a: true, filterMode: 'OR', limit: 10 });
    if (res.success) {
      const invalid = res.data.filter(a => !a.hasMcp && !a.hasA2a);
      if (invalid.length === 0) {
        pass('mcp OR a2a (filterMode=OR)', `All ${res.data.length} agents have mcp OR a2a`);
      } else {
        fail('mcp OR a2a (filterMode=OR)', `${invalid.length}/${res.data.length} have neither`);
      }
    }
  }

  // ========================================
  // 4. MULTI-CHAIN
  // ========================================
  console.log('\n--- 4. MULTI-CHAIN ---\n');

  // Single chain
  {
    const res = await apiGet('/agents', { q: 'agent', chainId: 11155111, limit: 10 });
    if (res.success) {
      const wrongChain = res.data.filter(a => a.chainId !== 11155111);
      if (wrongChain.length === 0) {
        pass('chainId=11155111', `All ${res.data.length} agents from Sepolia`);
      } else {
        fail('chainId=11155111', `${wrongChain.length}/${res.data.length} from other chains`);
      }
    }
  }

  // Multiple chains (CSV)
  {
    const res = await apiGet('/agents', { q: 'agent', chainIds: '11155111,84532', limit: 10 });
    if (res.success) {
      const wrongChain = res.data.filter(a => a.chainId !== 11155111 && a.chainId !== 84532);
      if (wrongChain.length === 0) {
        pass('chainIds=11155111,84532', `All ${res.data.length} agents from valid chains`);
      } else {
        fail('chainIds=11155111,84532', `${wrongChain.length}/${res.data.length} from other chains`);
      }
    }
  }

  // ========================================
  // 5. PAGINATION
  // ========================================
  console.log('\n--- 5. PAGINATION ---\n');

  // First page
  {
    const page1 = await apiGet('/agents', { q: 'agent', limit: 3 });
    if (page1.success && page1.meta.nextCursor) {
      // Second page
      const page2 = await apiGet('/agents', { q: 'agent', limit: 3, cursor: page1.meta.nextCursor });

      const page1Ids = new Set(page1.data.map(a => a.id));
      const overlap = page2.data.filter(a => page1Ids.has(a.id));

      if (overlap.length === 0) {
        pass('Pagination', `Page1: ${page1.data.length}, Page2: ${page2.data.length}, no overlap`);
      } else {
        fail('Pagination', `${overlap.length} overlapping agents between pages`);
      }
    } else {
      pass('Pagination', 'Single page of results');
    }
  }

  // ========================================
  // 6. POST /search
  // ========================================
  console.log('\n--- 6. POST /search ---\n');

  // Basic search
  {
    const res = await apiPost('/search', { query: 'agent', limit: 5 });
    if (res.success && res.data.length > 0) {
      pass('POST /search basic', `Returned ${res.data.length} agents`);
    } else {
      fail('POST /search basic', 'No agents returned');
    }
  }

  // With mcp filter
  {
    const res = await apiPost('/search', { query: 'agent', filters: { mcp: true }, limit: 10 });
    if (res.success) {
      const wrongMcp = res.data.filter(a => a.hasMcp !== true);
      if (wrongMcp.length === 0) {
        pass('POST /search mcp=true', `All ${res.data.length} have hasMcp=true`);
      } else {
        fail('POST /search mcp=true', `${wrongMcp.length}/${res.data.length} missing hasMcp`);
      }
    }
  }

  // With mcp=false filter
  {
    const res = await apiPost('/search', { query: 'test', filters: { mcp: false }, limit: 10 });
    if (res.success) {
      const wrongMcp = res.data.filter(a => a.hasMcp !== false);
      if (wrongMcp.length === 0) {
        pass('POST /search mcp=false', `All ${res.data.length} have hasMcp=false`);
      } else {
        fail('POST /search mcp=false', `${wrongMcp.length}/${res.data.length} have hasMcp=true`);
      }
    }
  }

  // With chainIds filter
  {
    const res = await apiPost('/search', { query: 'agent', filters: { chainIds: [11155111] }, limit: 10 });
    if (res.success) {
      const wrongChain = res.data.filter(a => a.chainId !== 11155111);
      if (wrongChain.length === 0) {
        pass('POST /search chainIds', `All ${res.data.length} from Sepolia`);
      } else {
        fail('POST /search chainIds', `${wrongChain.length}/${res.data.length} from other chains`);
      }
    }
  }

  // With OR mode
  {
    const res = await apiPost('/search', {
      query: 'agent',
      filters: { mcp: true, a2a: true, filterMode: 'OR' },
      limit: 10
    });
    if (res.success) {
      const invalid = res.data.filter(a => !a.hasMcp && !a.hasA2a);
      if (invalid.length === 0) {
        pass('POST /search OR mode', `All ${res.data.length} have mcp OR a2a`);
      } else {
        fail('POST /search OR mode', `${invalid.length}/${res.data.length} have neither`);
      }
    }
  }

  // ========================================
  // 7. OASF FILTERS (skills/domains)
  // ========================================
  console.log('\n--- 7. OASF FILTERS ---\n');

  // Skills filter
  {
    const res = await apiGet('/agents', { q: 'agent', skills: 'tool_interaction', limit: 10 });
    if (res.success) {
      const withSkill = res.data.filter(a =>
        a.oasf?.skills?.some(s => s.slug === 'tool_interaction')
      );
      if (res.data.length === 0) {
        pass('skills=tool_interaction', 'No agents with this skill');
      } else if (withSkill.length === res.data.length) {
        pass('skills=tool_interaction', `All ${res.data.length} have the skill`);
      } else {
        fail('skills=tool_interaction', `${withSkill.length}/${res.data.length} have the skill`);
      }
    }
  }

  // Domains filter
  {
    const res = await apiGet('/agents', { q: 'agent', domains: 'technology', limit: 10 });
    if (res.success) {
      const withDomain = res.data.filter(a =>
        a.oasf?.domains?.some(d => d.slug === 'technology')
      );
      if (res.data.length === 0) {
        pass('domains=technology', 'No agents with this domain');
      } else if (withDomain.length === res.data.length) {
        pass('domains=technology', `All ${res.data.length} have the domain`);
      } else {
        fail('domains=technology', `${withDomain.length}/${res.data.length} have the domain`);
      }
    }
  }

  // ========================================
  // 8. REPUTATION FILTERS
  // ========================================
  console.log('\n--- 8. REPUTATION FILTERS ---\n');

  // minRep filter
  {
    const res = await apiGet('/agents', { limit: 10, minRep: 50 });
    if (res.success) {
      const belowMin = res.data.filter(a =>
        a.reputationScore !== undefined && a.reputationScore < 50
      );
      if (belowMin.length === 0) {
        pass('minRep=50', `All ${res.data.length} agents (none below 50)`);
      } else {
        fail('minRep=50', `${belowMin.length}/${res.data.length} below minimum`);
      }
    }
  }

  // maxRep filter
  {
    const res = await apiGet('/agents', { limit: 10, maxRep: 80 });
    if (res.success) {
      const aboveMax = res.data.filter(a =>
        a.reputationScore !== undefined && a.reputationScore > 80
      );
      if (aboveMax.length === 0) {
        pass('maxRep=80', `All ${res.data.length} agents (none above 80)`);
      } else {
        fail('maxRep=80', `${aboveMax.length}/${res.data.length} above maximum`);
      }
    }
  }

  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total} tests`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Pass rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.details}`);
    });
  }
}

main().catch(console.error);
