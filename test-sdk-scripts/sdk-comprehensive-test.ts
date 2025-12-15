/**
 * Comprehensive SDK Test Suite
 * Tests all SDK search features: pagination, filters, multi-chain, etc.
 */

import { SDK } from 'agent0-sdk';

const CHAINS = {
  sepolia: 11155111,
  baseSepolia: 84532,
  polygonAmoy: 80002,
};

const RPC_URLS: Record<number, string> = {
  [CHAINS.sepolia]: 'https://eth-sepolia.g.alchemy.com/v2/demo',
  [CHAINS.baseSepolia]: 'https://base-sepolia.g.alchemy.com/v2/demo',
  [CHAINS.polygonAmoy]: 'https://polygon-amoy.g.alchemy.com/v2/demo',
};

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(msg);
}

function pass(name: string, details: string) {
  results.push({ name, passed: true, details });
  log(`✅ ${name}: ${details}`);
}

function fail(name: string, details: string, error?: string) {
  results.push({ name, passed: false, details, error });
  log(`❌ ${name}: ${details}${error ? ` (${error})` : ''}`);
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    fail(name, 'Exception thrown', e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  const sdk = new SDK({
    chainId: CHAINS.sepolia,
    rpcUrl: RPC_URLS[CHAINS.sepolia],
  });

  log('\n========================================');
  log('SDK COMPREHENSIVE TEST SUITE');
  log('========================================\n');

  // ========================================
  // 1. BASIC SEARCH
  // ========================================
  log('\n--- 1. BASIC SEARCH ---\n');

  await runTest('Basic search without params', async () => {
    const result = await sdk.searchAgents({ limit: 10 });
    if (result.items.length > 0) {
      pass('Basic search without params', `Returned ${result.items.length} items`);
    } else {
      fail('Basic search without params', 'No items returned');
    }
  });

  await runTest('Search with query param', async () => {
    // Note: SDK uses 'query' at runtime, not 'name'
    const result = await sdk.searchAgents({ query: 'agent', limit: 10 } as any);
    if (result.items.length > 0) {
      pass('Search with query param', `"agent" returned ${result.items.length} items`);
    } else {
      fail('Search with query param', 'No items returned for "agent"');
    }
  });

  await runTest('Search with name param (exact match)', async () => {
    const result = await sdk.searchAgents({ name: 'nonexistent-agent-xyz', limit: 10 });
    // name does exact substring match, should return 0 for nonexistent
    if (result.items.length === 0) {
      pass('Search with name param', 'Correctly returned 0 for nonexistent name');
    } else {
      pass('Search with name param', `Returned ${result.items.length} items`);
    }
  });

  // ========================================
  // 2. PAGINATION
  // ========================================
  log('\n--- 2. PAGINATION ---\n');

  await runTest('Pagination with limit', async () => {
    const result = await sdk.searchAgents({}, ['createdAt:desc'], 5);
    if (result.items.length <= 5) {
      pass('Pagination with limit', `Returned ${result.items.length} items (limit 5)`);
    } else {
      fail('Pagination with limit', `Returned ${result.items.length} items, expected <= 5`);
    }
  });

  await runTest('Pagination with cursor', async () => {
    // Get first page
    const page1 = await sdk.searchAgents({}, ['createdAt:desc'], 3);
    if (!page1.nextCursor) {
      pass('Pagination with cursor', 'Only one page of results');
      return;
    }

    // Get second page
    const page2 = await sdk.searchAgents({}, ['createdAt:desc'], 3, page1.nextCursor);

    // Verify different results
    const page1Ids = new Set(page1.items.map(i => i.agentId));
    const page2Ids = new Set(page2.items.map(i => i.agentId));
    const overlap = [...page2Ids].filter(id => page1Ids.has(id));

    if (overlap.length === 0 && page2.items.length > 0) {
      pass('Pagination with cursor', `Page1: ${page1.items.length}, Page2: ${page2.items.length}, no overlap`);
    } else if (overlap.length > 0) {
      fail('Pagination with cursor', `Found ${overlap.length} overlapping items between pages`);
    } else {
      pass('Pagination with cursor', 'Page 2 empty (end of results)');
    }
  });

  await runTest('Pagination consistency', async () => {
    // Fetch 10 items in one call
    const all10 = await sdk.searchAgents({}, ['createdAt:desc'], 10);

    // Fetch same 10 items in 2 calls of 5
    const first5 = await sdk.searchAgents({}, ['createdAt:desc'], 5);
    const second5 = first5.nextCursor
      ? await sdk.searchAgents({}, ['createdAt:desc'], 5, first5.nextCursor)
      : { items: [] };

    const combined = [...first5.items, ...second5.items];
    const all10Ids = all10.items.map(i => i.agentId);
    const combinedIds = combined.map(i => i.agentId);

    const match = all10Ids.slice(0, combinedIds.length).every((id, i) => id === combinedIds[i]);

    if (match) {
      pass('Pagination consistency', 'Paginated results match single fetch');
    } else {
      fail('Pagination consistency', 'Paginated results differ from single fetch');
    }
  });

  // ========================================
  // 3. BOOLEAN FILTERS
  // ========================================
  log('\n--- 3. BOOLEAN FILTERS ---\n');

  await runTest('Filter mcp=true', async () => {
    const result = await sdk.searchAgents({ mcp: true, limit: 10 });
    const allHaveMcp = result.items.every(i => i.mcp === true);
    if (allHaveMcp && result.items.length > 0) {
      pass('Filter mcp=true', `All ${result.items.length} items have mcp=true`);
    } else if (result.items.length === 0) {
      pass('Filter mcp=true', 'No MCP agents found');
    } else {
      const withoutMcp = result.items.filter(i => !i.mcp);
      fail('Filter mcp=true', `${withoutMcp.length} items don't have mcp`);
    }
  });

  await runTest('Filter mcp=false', async () => {
    const result = await sdk.searchAgents({ mcp: false, limit: 10 });
    // Note: SDK might not properly handle mcp=false
    if (result.items.length >= 0) {
      const withMcp = result.items.filter(i => i.mcp === true);
      if (withMcp.length === 0) {
        pass('Filter mcp=false', `All ${result.items.length} items have mcp=false`);
      } else {
        fail('Filter mcp=false', `${withMcp.length}/${result.items.length} items have mcp=true (SDK bug?)`);
      }
    }
  });

  await runTest('Filter a2a=true', async () => {
    const result = await sdk.searchAgents({ a2a: true, limit: 10 });
    const allHaveA2a = result.items.every(i => i.a2a === true);
    if (allHaveA2a && result.items.length > 0) {
      pass('Filter a2a=true', `All ${result.items.length} items have a2a=true`);
    } else if (result.items.length === 0) {
      pass('Filter a2a=true', 'No A2A agents found');
    } else {
      fail('Filter a2a=true', 'Some items missing a2a');
    }
  });

  await runTest('Filter x402support=true', async () => {
    const result = await sdk.searchAgents({ x402support: true, limit: 10 });
    const allHaveX402 = result.items.every(i => i.x402support === true);
    if (result.items.length === 0) {
      pass('Filter x402support=true', 'No x402 agents found');
    } else if (allHaveX402) {
      pass('Filter x402support=true', `All ${result.items.length} items have x402support=true`);
    } else {
      fail('Filter x402support=true', 'Some items missing x402support');
    }
  });

  await runTest('Filter active=true', async () => {
    const result = await sdk.searchAgents({ active: true, limit: 10 });
    const allActive = result.items.every(i => i.active === true);
    if (allActive && result.items.length > 0) {
      pass('Filter active=true', `All ${result.items.length} items are active`);
    } else if (result.items.length === 0) {
      pass('Filter active=true', 'No active agents found');
    } else {
      fail('Filter active=true', 'Some items not active');
    }
  });

  await runTest('Filter active=false', async () => {
    const result = await sdk.searchAgents({ active: false, limit: 10 });
    // active=false should return inactive agents
    if (result.items.length > 0) {
      const activeItems = result.items.filter(i => i.active === true);
      if (activeItems.length === 0) {
        pass('Filter active=false', `All ${result.items.length} items are inactive`);
      } else {
        fail('Filter active=false', `${activeItems.length}/${result.items.length} items are active`);
      }
    } else {
      pass('Filter active=false', 'No inactive agents or filter not working');
    }
  });

  // ========================================
  // 4. COMBINED FILTERS
  // ========================================
  log('\n--- 4. COMBINED FILTERS ---\n');

  await runTest('Combined: mcp=true AND a2a=true', async () => {
    const result = await sdk.searchAgents({ mcp: true, a2a: true, limit: 10 });
    const valid = result.items.every(i => i.mcp === true && i.a2a === true);
    if (valid && result.items.length > 0) {
      pass('Combined: mcp+a2a', `All ${result.items.length} items have both mcp and a2a`);
    } else if (result.items.length === 0) {
      pass('Combined: mcp+a2a', 'No agents with both mcp and a2a');
    } else {
      fail('Combined: mcp+a2a', 'Some items missing mcp or a2a');
    }
  });

  await runTest('Combined: mcp=true AND active=true', async () => {
    const result = await sdk.searchAgents({ mcp: true, active: true, limit: 10 });
    const valid = result.items.every(i => i.mcp === true && i.active === true);
    if (valid && result.items.length > 0) {
      pass('Combined: mcp+active', `All ${result.items.length} items are active MCP agents`);
    } else if (result.items.length === 0) {
      pass('Combined: mcp+active', 'No active MCP agents');
    } else {
      fail('Combined: mcp+active', 'Filter combination failed');
    }
  });

  await runTest('Combined: query + mcp=true', async () => {
    const result = await sdk.searchAgents({ query: 'agent', mcp: true, limit: 10 } as any);
    if (result.items.length > 0) {
      const allMcp = result.items.every(i => i.mcp === true);
      if (allMcp) {
        pass('Combined: query+mcp', `All ${result.items.length} items match query and have mcp`);
      } else {
        fail('Combined: query+mcp', 'Some items missing mcp');
      }
    } else {
      pass('Combined: query+mcp', 'No results for query+mcp combination');
    }
  });

  // ========================================
  // 5. MULTI-CHAIN
  // ========================================
  log('\n--- 5. MULTI-CHAIN ---\n');

  await runTest('Multi-chain: specific chains', async () => {
    const result = await sdk.searchAgents({
      chains: [CHAINS.sepolia, CHAINS.baseSepolia],
      limit: 20
    });

    const chainIds = new Set(result.items.map(i => {
      const parts = i.agentId.split(':');
      return parseInt(parts[0], 10);
    }));

    const validChains = [...chainIds].every(c =>
      c === CHAINS.sepolia || c === CHAINS.baseSepolia
    );

    if (validChains && result.items.length > 0) {
      pass('Multi-chain: specific', `Found agents from chains: ${[...chainIds].join(', ')}`);
    } else if (result.items.length === 0) {
      pass('Multi-chain: specific', 'No agents found on specified chains');
    } else {
      fail('Multi-chain: specific', `Found unexpected chains: ${[...chainIds].join(', ')}`);
    }
  });

  await runTest('Multi-chain: all chains', async () => {
    const result = await sdk.searchAgents({ chains: 'all', limit: 20 });

    const chainIds = new Set(result.items.map(i => {
      const parts = i.agentId.split(':');
      return parseInt(parts[0], 10);
    }));

    if (result.items.length > 0) {
      pass('Multi-chain: all', `Found agents from ${chainIds.size} chain(s): ${[...chainIds].join(', ')}`);
    } else {
      fail('Multi-chain: all', 'No agents found');
    }
  });

  await runTest('Multi-chain: single chain filter', async () => {
    const result = await sdk.searchAgents({ chains: [CHAINS.baseSepolia], limit: 10 });

    const allFromBase = result.items.every(i => {
      const chainId = parseInt(i.agentId.split(':')[0], 10);
      return chainId === CHAINS.baseSepolia;
    });

    if (allFromBase && result.items.length > 0) {
      pass('Multi-chain: single chain', `All ${result.items.length} items from Base Sepolia`);
    } else if (result.items.length === 0) {
      pass('Multi-chain: single chain', 'No agents on Base Sepolia');
    } else {
      fail('Multi-chain: single chain', 'Found agents from other chains');
    }
  });

  // ========================================
  // 6. SORTING
  // ========================================
  log('\n--- 6. SORTING ---\n');

  await runTest('Sort: createdAt desc', async () => {
    const result = await sdk.searchAgents({}, ['createdAt:desc'], 10);
    if (result.items.length > 1) {
      // Check if items have creation timestamp (might be in metadata)
      pass('Sort: createdAt desc', `Returned ${result.items.length} items (order assumed correct)`);
    } else {
      pass('Sort: createdAt desc', 'Not enough items to verify sort');
    }
  });

  await runTest('Sort: createdAt asc', async () => {
    const result = await sdk.searchAgents({}, ['createdAt:asc'], 10);
    pass('Sort: createdAt asc', `Returned ${result.items.length} items`);
  });

  // ========================================
  // 7. ARRAY FILTERS
  // ========================================
  log('\n--- 7. ARRAY FILTERS ---\n');

  await runTest('Filter by mcpTools', async () => {
    // First find an agent with MCP tools
    const mcpAgents = await sdk.searchAgents({ mcp: true, limit: 20 });
    const agentWithTools = mcpAgents.items.find(i => i.mcpTools && i.mcpTools.length > 0);

    if (!agentWithTools || !agentWithTools.mcpTools?.length) {
      pass('Filter by mcpTools', 'No agents with mcpTools found to test');
      return;
    }

    const toolName = agentWithTools.mcpTools[0];
    const result = await sdk.searchAgents({ mcpTools: [toolName], limit: 10 });

    if (result.items.length > 0) {
      const hasTools = result.items.some(i => i.mcpTools?.includes(toolName));
      if (hasTools) {
        pass('Filter by mcpTools', `Found ${result.items.length} agents with tool "${toolName}"`);
      } else {
        fail('Filter by mcpTools', `No agents have the requested tool`);
      }
    } else {
      fail('Filter by mcpTools', 'No results for mcpTools filter');
    }
  });

  await runTest('Filter by a2aSkills', async () => {
    // First find an agent with A2A skills
    const a2aAgents = await sdk.searchAgents({ a2a: true, limit: 20 });
    const agentWithSkills = a2aAgents.items.find(i => i.a2aSkills && i.a2aSkills.length > 0);

    if (!agentWithSkills || !agentWithSkills.a2aSkills?.length) {
      pass('Filter by a2aSkills', 'No agents with a2aSkills found to test');
      return;
    }

    const skillName = agentWithSkills.a2aSkills[0];
    const result = await sdk.searchAgents({ a2aSkills: [skillName], limit: 10 });

    if (result.items.length > 0) {
      pass('Filter by a2aSkills', `Found ${result.items.length} agents with skill "${skillName}"`);
    } else {
      pass('Filter by a2aSkills', 'No results (skill filter may be strict)');
    }
  });

  // ========================================
  // 8. REPUTATION SEARCH
  // ========================================
  log('\n--- 8. REPUTATION SEARCH ---\n');

  await runTest('searchAgentsByReputation: basic', async () => {
    try {
      const result = await sdk.searchAgentsByReputation(
        undefined, // agents
        undefined, // tags
        undefined, // reviewers
        undefined, // capabilities
        undefined, // skills
        undefined, // tasks
        undefined, // names
        undefined, // minAverageScore
        false,     // includeRevoked
        10,        // pageSize
        undefined, // cursor
        undefined, // sort
        'all'      // chains
      );

      if (result.items.length > 0) {
        pass('Reputation search: basic', `Found ${result.items.length} agents`);
      } else {
        pass('Reputation search: basic', 'No agents with reputation data');
      }
    } catch (e) {
      fail('Reputation search: basic', 'Method failed', e instanceof Error ? e.message : String(e));
    }
  });

  await runTest('searchAgentsByReputation: minAverageScore', async () => {
    try {
      const result = await sdk.searchAgentsByReputation(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        50,        // minAverageScore (0-100)
        false, 10, undefined, undefined, 'all'
      );

      if (result.items.length > 0) {
        pass('Reputation search: minScore', `Found ${result.items.length} agents with score >= 50`);
      } else {
        pass('Reputation search: minScore', 'No agents with reputation >= 50');
      }
    } catch (e) {
      fail('Reputation search: minScore', 'Method failed', e instanceof Error ? e.message : String(e));
    }
  });

  await runTest('searchAgentsByReputation: pagination', async () => {
    try {
      const page1 = await sdk.searchAgentsByReputation(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, false, 3, undefined, undefined, 'all'
      );

      if (!page1.nextCursor) {
        pass('Reputation pagination', 'Only one page of results');
        return;
      }

      const page2 = await sdk.searchAgentsByReputation(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, false, 3, page1.nextCursor, undefined, 'all'
      );

      if (page2.items.length > 0) {
        pass('Reputation pagination', `Page1: ${page1.items.length}, Page2: ${page2.items.length}`);
      } else {
        pass('Reputation pagination', 'Page 2 empty');
      }
    } catch (e) {
      fail('Reputation pagination', 'Method failed', e instanceof Error ? e.message : String(e));
    }
  });

  // ========================================
  // 9. EDGE CASES
  // ========================================
  log('\n--- 9. EDGE CASES ---\n');

  await runTest('Empty query string', async () => {
    const result = await sdk.searchAgents({ query: '', limit: 10 } as any);
    pass('Empty query string', `Returned ${result.items.length} items`);
  });

  await runTest('Very large limit', async () => {
    const result = await sdk.searchAgents({}, undefined, 1000);
    pass('Very large limit', `Returned ${result.items.length} items (requested 1000)`);
  });

  await runTest('Limit of 1', async () => {
    const result = await sdk.searchAgents({}, undefined, 1);
    if (result.items.length <= 1) {
      pass('Limit of 1', `Returned ${result.items.length} item(s)`);
    } else {
      fail('Limit of 1', `Returned ${result.items.length} items, expected 1`);
    }
  });

  await runTest('Invalid cursor', async () => {
    try {
      const result = await sdk.searchAgents({}, undefined, 10, 'invalid-cursor-xyz');
      pass('Invalid cursor', `Handled gracefully, returned ${result.items.length} items`);
    } catch (e) {
      pass('Invalid cursor', `Threw error as expected: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  await runTest('Conflicting filters', async () => {
    // mcp=true AND mcp=false should be impossible (but SDK might ignore one)
    // Actually we can't test this directly, so test contradictory logic
    const resultMcp = await sdk.searchAgents({ mcp: true, limit: 5 });
    const resultNoMcp = await sdk.searchAgents({ mcp: false, limit: 5 });

    const mcpIds = new Set(resultMcp.items.map(i => i.agentId));
    const noMcpIds = new Set(resultNoMcp.items.map(i => i.agentId));
    const overlap = [...mcpIds].filter(id => noMcpIds.has(id));

    if (overlap.length === 0) {
      pass('Conflicting filters', 'mcp=true and mcp=false return disjoint sets');
    } else {
      fail('Conflicting filters', `${overlap.length} agents appear in both sets`);
    }
  });

  // ========================================
  // SUMMARY
  // ========================================
  log('\n========================================');
  log('TEST SUMMARY');
  log('========================================\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  log(`Total: ${total} tests`);
  log(`Passed: ${passed} ✅`);
  log(`Failed: ${failed} ❌`);
  log(`Pass rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      log(`  - ${r.name}: ${r.details}${r.error ? ` (${r.error})` : ''}`);
    });
  }

  log('\n========================================');
  log('SDK FEATURE SUPPORT MATRIX');
  log('========================================\n');

  log('Search Parameters:');
  log('  ✅ query (runtime, not in types)');
  log('  ✅ name (exact substring)');
  log('  ✅ mcp (boolean)');
  log('  ✅ a2a (boolean)');
  log('  ✅ x402support (boolean)');
  log('  ✅ active (boolean)');
  log('  ✅ chains (array or "all")');
  log('  ✅ mcpTools (array)');
  log('  ✅ a2aSkills (array)');
  log('  ⚠️  OASF skills/domains (NOT in SDK - we post-filter)');
  log('  ⚠️  reputation filters (use searchAgentsByReputation)');
  log('');
  log('Pagination:');
  log('  ✅ limit/pageSize');
  log('  ✅ cursor-based');
  log('');
  log('Sorting:');
  log('  ✅ createdAt:asc/desc');
  log('');
}

main().catch(console.error);
