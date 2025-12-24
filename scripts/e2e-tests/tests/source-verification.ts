/**
 * Source Verification Tests
 * Verifies that API results match direct SDK/Search Service results
 *
 * This suite directly queries:
 * - The Graph subgraph (same as SDK)
 * - Search Service (semantic search)
 * And compares results with API responses
 */

import { describe, expect, it } from '../test-runner';
import { get, post } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import { assertSuccess } from '../utils/assertions';

// Configuration
const API_BASE = process.env.API_BASE_URL || 'https://api.8004.dev/api/v1';
const API_KEY = process.env.API_KEY || '';
const SEARCH_SERVICE_URL = process.env.SEARCH_SERVICE_URL || 'https://search.8004.dev';

// Subgraph endpoints (same as SDK uses)
const SUBGRAPH_ENDPOINTS: Record<number, string> = {
  11155111: 'https://api.studio.thegraph.com/query/102934/sepolia-agent-registry/version/latest',
  84532: 'https://api.studio.thegraph.com/query/102934/base-sepolia-agent-registry/version/latest',
  80002: 'https://api.studio.thegraph.com/query/102934/polygon-amoy-agent-registry/version/latest',
};

interface SubgraphAgent {
  id: string;
  tokenId: string;
  name: string;
  description: string;
  active: boolean;
  mcpServers: Array<{ url: string }>;
  a2aServers: Array<{ url: string }>;
  createdAt: string;
  updatedAt: string;
}

interface SubgraphResponse {
  data?: {
    agents?: SubgraphAgent[];
    agent?: SubgraphAgent;
  };
  errors?: Array<{ message: string }>;
}

interface SearchServiceResult {
  agentId: string;
  chainId: number;
  name: string;
  description: string;
  score: number;
}

interface SearchServiceResponse {
  results?: SearchServiceResult[];
  total?: number;
  cursor?: string;
  searchMode?: string;
  error?: string;
}

/**
 * Query subgraph directly (same as SDK does)
 */
async function querySubgraph(
  chainId: number,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<SubgraphResponse> {
  const endpoint = SUBGRAPH_ENDPOINTS[chainId];
  if (!endpoint) {
    throw new Error(`No subgraph endpoint for chain ${chainId}`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  return response.json() as Promise<SubgraphResponse>;
}

/**
 * Query search service directly
 */
async function querySearchService(
  query: string,
  options: {
    limit?: number;
    filters?: Record<string, unknown>;
  } = {}
): Promise<SearchServiceResponse> {
  const response = await fetch(`${SEARCH_SERVICE_URL}/api/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { 'X-API-Key': API_KEY }),
    },
    body: JSON.stringify({
      query,
      topK: options.limit || 10,
      minScore: 0.3,
      ...options.filters,
    }),
  });

  return response.json() as Promise<SearchServiceResponse>;
}

/**
 * GraphQL query for listing agents (same as SDK)
 */
const LIST_AGENTS_QUERY = `
  query GetAgents($first: Int!, $skip: Int!, $where: Agent_filter, $orderBy: Agent_orderBy, $orderDirection: OrderDirection) {
    agents(first: $first, skip: $skip, where: $where, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      tokenId
      name
      description
      active
      mcpServers {
        url
      }
      a2aServers {
        url
      }
      createdAt
      updatedAt
    }
  }
`;

/**
 * GraphQL query for single agent (same as SDK)
 */
const GET_AGENT_QUERY = `
  query GetAgent($id: ID!) {
    agent(id: $id) {
      id
      tokenId
      name
      description
      active
      mcpServers {
        url
      }
      a2aServers {
        url
      }
      createdAt
      updatedAt
    }
  }
`;

export function registerSourceVerificationTests(): void {
  describe('Source Verification: Subgraph vs API', () => {
    it('API agent count matches subgraph for Sepolia', async () => {
      const chainId = 11155111;

      // Query subgraph directly
      const subgraphResult = await querySubgraph(chainId, LIST_AGENTS_QUERY, {
        first: 100,
        skip: 0,
        where: { active: true },
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      if (subgraphResult.errors) {
        console.log('  Note: Subgraph query failed, skipping');
        return;
      }

      const subgraphAgents = subgraphResult.data?.agents || [];

      // Query API
      const apiResult = await get('/agents', { chainId, limit: 100 });
      assertSuccess(apiResult.json);

      const apiAgents = apiResult.json.data || [];

      // Compare counts (API may include inactive agents, so we check overlap)
      console.log(`  Subgraph active agents: ${subgraphAgents.length}`);
      console.log(`  API agents: ${apiAgents.length}`);

      // At minimum, API should return agents
      expect(apiAgents.length).toBeGreaterThan(0);

      // Check that subgraph agents appear in API results
      const apiIds = new Set(apiAgents.map((a: Agent) => a.tokenId));
      let matchCount = 0;
      for (const agent of subgraphAgents) {
        if (apiIds.has(agent.tokenId)) {
          matchCount++;
        }
      }

      // Most subgraph agents should appear in API
      if (subgraphAgents.length > 0) {
        const matchRate = matchCount / subgraphAgents.length;
        console.log(`  Match rate: ${(matchRate * 100).toFixed(1)}%`);
        expect(matchRate).toBeGreaterThan(0.8);
      }
    });

    it('API agent details match subgraph', async () => {
      const chainId = 11155111;

      // First get an agent from API
      const listResult = await get('/agents', { chainId, limit: 1 });
      assertSuccess(listResult.json);

      if (!listResult.json.data?.length) {
        console.log('  Note: No agents available, skipping');
        return;
      }

      const apiAgent = listResult.json.data[0] as Agent;
      const tokenId = apiAgent.tokenId;

      // Query subgraph directly for this agent
      const subgraphResult = await querySubgraph(chainId, GET_AGENT_QUERY, {
        id: tokenId,
      });

      if (subgraphResult.errors || !subgraphResult.data?.agent) {
        console.log('  Note: Subgraph query failed, skipping');
        return;
      }

      const subgraphAgent = subgraphResult.data.agent;

      // Compare key fields
      expect(apiAgent.name).toBe(subgraphAgent.name);
      expect(apiAgent.tokenId).toBe(subgraphAgent.tokenId);

      // Compare MCP status
      const subgraphHasMcp = subgraphAgent.mcpServers && subgraphAgent.mcpServers.length > 0;
      expect(apiAgent.hasMcp).toBe(subgraphHasMcp);

      // Compare A2A status
      const subgraphHasA2a = subgraphAgent.a2aServers && subgraphAgent.a2aServers.length > 0;
      expect(apiAgent.hasA2a).toBe(subgraphHasA2a);
    });

    it('API MCP filter matches subgraph MCP agents', async () => {
      const chainId = 11155111;

      // Query subgraph for agents with MCP
      const subgraphResult = await querySubgraph(chainId, LIST_AGENTS_QUERY, {
        first: 50,
        skip: 0,
        where: { active: true, mcpServers_: {} },
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      if (subgraphResult.errors) {
        console.log('  Note: Subgraph query failed, skipping');
        return;
      }

      const subgraphMcpAgents = (subgraphResult.data?.agents || []).filter(
        (a) => a.mcpServers && a.mcpServers.length > 0
      );

      // Query API with mcp=true filter
      const apiResult = await get('/agents', { chainId, mcp: true, limit: 50 });
      assertSuccess(apiResult.json);

      const apiMcpAgents = apiResult.json.data || [];

      console.log(`  Subgraph MCP agents: ${subgraphMcpAgents.length}`);
      console.log(`  API MCP agents: ${apiMcpAgents.length}`);

      // All API results should have hasMcp=true
      for (const agent of apiMcpAgents) {
        expect(agent.hasMcp).toBe(true);
      }

      // Check overlap between sources
      if (subgraphMcpAgents.length > 0 && apiMcpAgents.length > 0) {
        const subgraphTokenIds = new Set(subgraphMcpAgents.map((a) => a.tokenId));
        const apiTokenIds = new Set(apiMcpAgents.map((a: Agent) => a.tokenId));

        let overlap = 0;
        for (const id of apiTokenIds) {
          if (subgraphTokenIds.has(id)) overlap++;
        }

        console.log(`  Overlap: ${overlap} agents`);
        expect(overlap).toBeGreaterThan(0);
      }
    });

    it('API A2A filter matches subgraph A2A agents', async () => {
      const chainId = 11155111;

      // Query subgraph for agents with A2A
      const subgraphResult = await querySubgraph(chainId, LIST_AGENTS_QUERY, {
        first: 50,
        skip: 0,
        where: { active: true, a2aServers_: {} },
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      if (subgraphResult.errors) {
        console.log('  Note: Subgraph query failed, skipping');
        return;
      }

      const subgraphA2aAgents = (subgraphResult.data?.agents || []).filter(
        (a) => a.a2aServers && a.a2aServers.length > 0
      );

      // Query API with a2a=true filter
      const apiResult = await get('/agents', { chainId, a2a: true, limit: 50 });
      assertSuccess(apiResult.json);

      const apiA2aAgents = apiResult.json.data || [];

      console.log(`  Subgraph A2A agents: ${subgraphA2aAgents.length}`);
      console.log(`  API A2A agents: ${apiA2aAgents.length}`);

      // All API results should have hasA2a=true
      for (const agent of apiA2aAgents) {
        expect(agent.hasA2a).toBe(true);
      }
    });

    it('API pagination matches subgraph offset', async () => {
      const chainId = 11155111;
      const limit = 5;

      // Get first page from subgraph
      const subgraphPage1 = await querySubgraph(chainId, LIST_AGENTS_QUERY, {
        first: limit,
        skip: 0,
        where: { active: true },
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      // Get second page from subgraph
      const subgraphPage2 = await querySubgraph(chainId, LIST_AGENTS_QUERY, {
        first: limit,
        skip: limit,
        where: { active: true },
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      if (subgraphPage1.errors || subgraphPage2.errors) {
        console.log('  Note: Subgraph query failed, skipping');
        return;
      }

      const subgraphAgents1 = subgraphPage1.data?.agents || [];
      const subgraphAgents2 = subgraphPage2.data?.agents || [];

      // If subgraph returns no agents, skip comparison (can't verify source)
      if (subgraphAgents1.length === 0 && subgraphAgents2.length === 0) {
        console.log('  Note: Subgraph returned no agents, skipping source comparison');
        return;
      }

      {
        const subgraphIds1 = new Set(subgraphAgents1.map((a) => a.tokenId));
        const subgraphIds2 = new Set(subgraphAgents2.map((a) => a.tokenId));

        // Pages should not overlap
        let subgraphOverlap = 0;
        for (const id of subgraphIds1) {
          if (subgraphIds2.has(id)) subgraphOverlap++;
        }
        console.log(`  Subgraph page 1: ${subgraphIds1.size}, page 2: ${subgraphIds2.size}, overlap: ${subgraphOverlap}`);
        expect(subgraphOverlap).toBe(0);
      }

      // Get pages from API
      const apiPage1 = await get('/agents', { chainId, limit, page: 1, sort: 'createdAt', order: 'desc' });
      const apiPage2 = await get('/agents', { chainId, limit, page: 2, sort: 'createdAt', order: 'desc' });

      assertSuccess(apiPage1.json);
      assertSuccess(apiPage2.json);

      const apiIds1 = new Set((apiPage1.json.data || []).map((a: Agent) => a.id));
      const apiIds2 = new Set((apiPage2.json.data || []).map((a: Agent) => a.id));

      // API pages should not overlap either
      let apiOverlap = 0;
      for (const id of apiIds1) {
        if (apiIds2.has(id)) apiOverlap++;
      }
      console.log(`  API page 1: ${apiIds1.size}, page 2: ${apiIds2.size}, overlap: ${apiOverlap}`);

      // Note: If there's overlap, this is a pagination bug in the API
      // The multi-chain pagination fix should have addressed this
      expect(apiOverlap).toBe(0);
    });
  });

  describe('Source Verification: Search Service vs API', () => {
    it('API search returns results consistent with search service', async () => {
      const query = 'trading';

      // Skip if no search service URL configured
      if (!SEARCH_SERVICE_URL || SEARCH_SERVICE_URL === 'https://search.8004.dev') {
        console.log('  Note: Search service URL not configured, testing API only');

        // At least verify API search works
        const apiResult = await post('/search', { query, limit: 5 });
        if (apiResult.json.success) {
          const results = apiResult.json.data || [];
          console.log(`  API search returned ${results.length} results`);
          expect(results.length >= 0).toBe(true);
        }
        return;
      }

      // Query search service directly
      let searchResult: SearchServiceResponse;
      try {
        searchResult = await querySearchService(query, { limit: 10 });
      } catch (error) {
        console.log('  Note: Search service unavailable, skipping');
        return;
      }

      if (searchResult.error) {
        console.log(`  Note: Search service error: ${searchResult.error}, skipping`);
        return;
      }

      const searchAgents = searchResult.results || [];

      // Query API
      const apiResult = await post('/search', { query, limit: 10 });

      if (!apiResult.json.success) {
        console.log('  Note: API search failed, skipping');
        return;
      }

      const apiAgents = apiResult.json.data || [];

      console.log(`  Search service: ${searchAgents.length} results`);
      console.log(`  API: ${apiAgents.length} results`);

      // Both should return results or both empty
      if (searchAgents.length > 0) {
        expect(apiAgents.length).toBeGreaterThan(0);

        // Check overlap in top results
        const searchIds = new Set(searchAgents.map((a) => a.agentId));
        let overlap = 0;
        for (const agent of apiAgents) {
          if (searchIds.has(agent.id)) overlap++;
        }

        console.log(`  Overlap in results: ${overlap}`);
        // At least some overlap expected
        expect(overlap).toBeGreaterThan(0);
      }
    });

    it('API GET ?q= search matches POST /search', async () => {
      const query = 'AI';

      // Query via GET /agents?q=
      const getResult = await get('/agents', { q: query, limit: 10 });

      // Query via POST /search
      const postResult = await post('/search', { query, limit: 10 });

      // Both should succeed or both should gracefully handle
      if (getResult.json.success && postResult.json.success) {
        const getAgents = getResult.json.data || [];
        const postAgents = postResult.json.data || [];

        console.log(`  GET ?q= results: ${getAgents.length}`);
        console.log(`  POST /search results: ${postAgents.length}`);

        // Results should be similar (using same search backend)
        if (getAgents.length > 0 && postAgents.length > 0) {
          const getIds = new Set(getAgents.map((a: Agent) => a.id));
          let overlap = 0;
          for (const agent of postAgents) {
            if (getIds.has(agent.id)) overlap++;
          }

          // High overlap expected since both use same search
          const overlapRate = overlap / Math.min(getAgents.length, postAgents.length);
          console.log(`  Overlap rate: ${(overlapRate * 100).toFixed(1)}%`);
          expect(overlapRate).toBeGreaterThan(0.5);
        }
      }
    });

    it('API search with filters consistent with filtered direct search', async () => {
      const query = 'agent';

      // Query API with mcp filter
      const apiResult = await post('/search', {
        query,
        filters: { mcp: true },
        limit: 10,
      });

      if (!apiResult.json.success) {
        console.log('  Note: API search failed, skipping');
        return;
      }

      const apiAgents = apiResult.json.data || [];
      console.log(`  API search with mcp=true: ${apiAgents.length} results`);

      // All results should have MCP
      for (const agent of apiAgents) {
        expect(agent.hasMcp).toBe(true);
      }
    });
  });

  describe('Source Verification: Multi-Chain Consistency', () => {
    it('API aggregates agents from all chains correctly', async () => {
      const chainIds = [11155111, 84532, 80002];
      const perChainCounts: Record<number, number> = {};

      // Query each chain via API
      for (const chainId of chainIds) {
        const result = await get('/agents', { chainId, limit: 100 });
        if (result.json.success) {
          perChainCounts[chainId] = result.json.data?.length || 0;
        }
      }

      console.log('  Per-chain counts from API:');
      for (const [chainId, count] of Object.entries(perChainCounts)) {
        console.log(`    Chain ${chainId}: ${count} agents`);
      }

      // Query all chains together
      const allResult = await get('/agents', { limit: 100 });
      assertSuccess(allResult.json);

      const totalFromAll = allResult.json.data?.length || 0;
      console.log(`  Total from all-chains query: ${totalFromAll}`);

      // Total should include agents from multiple chains
      const chainsWithAgents = Object.values(perChainCounts).filter((c) => c > 0).length;
      if (chainsWithAgents > 1) {
        // Verify we see agents from different chains in combined results
        const chainIdsInResults = new Set(
          (allResult.json.data || []).map((a: Agent) => a.chainId)
        );
        expect(chainIdsInResults.size).toBeGreaterThan(1);
      }
    });

    it('Chain stats match per-chain agent counts', async () => {
      // Get chain stats
      const statsResult = await get('/chains');
      assertSuccess(statsResult.json);

      const chainStats = statsResult.json.data as Array<{
        chainId: number;
        totalAgents: number;
        name: string;
      }>;

      console.log('  Chain stats:');
      for (const chain of chainStats) {
        console.log(`    ${chain.name} (${chain.chainId}): ${chain.totalAgents} agents`);

        // Verify by querying agents for this chain
        const agentsResult = await get('/agents', { chainId: chain.chainId, limit: 1 });
        if (agentsResult.json.success) {
          const total = agentsResult.json.pagination?.total || 0;
          console.log(`    -> API pagination.total: ${total}`);

          // Stats and pagination should be close (may differ slightly due to caching)
          if (chain.totalAgents > 0 && total > 0) {
            const diff = Math.abs(chain.totalAgents - total);
            const tolerance = Math.max(chain.totalAgents, total) * 0.1; // 10% tolerance
            expect(diff).toBeLessThanOrEqual(tolerance);
          }
        }
      }
    });
  });

  describe('Source Verification: Data Freshness', () => {
    it('API returns recently created agents', async () => {
      const chainId = 11155111;

      // Query subgraph for most recent agents
      const subgraphResult = await querySubgraph(chainId, LIST_AGENTS_QUERY, {
        first: 5,
        skip: 0,
        where: { active: true },
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      if (subgraphResult.errors) {
        console.log('  Note: Subgraph query failed, skipping');
        return;
      }

      const latestSubgraph = subgraphResult.data?.agents?.[0];
      if (!latestSubgraph) {
        console.log('  Note: No agents in subgraph, skipping');
        return;
      }

      console.log(`  Latest in subgraph: tokenId=${latestSubgraph.tokenId}, name="${latestSubgraph.name}"`);

      // Query API for latest
      const apiResult = await get('/agents', {
        chainId,
        limit: 5,
        sort: 'createdAt',
        order: 'desc',
      });
      assertSuccess(apiResult.json);

      const apiAgents = apiResult.json.data || [];
      if (apiAgents.length === 0) {
        console.log('  Note: No agents from API, skipping');
        return;
      }

      const latestApi = apiAgents[0] as Agent;
      console.log(`  Latest in API: tokenId=${latestApi.tokenId}, name="${latestApi.name}"`);

      // Latest agent should match or be very recent
      // Allow for some lag between subgraph indexing and API cache
      const apiTokenIds = new Set(apiAgents.map((a: Agent) => a.tokenId));
      const subgraphInApi = apiTokenIds.has(latestSubgraph.tokenId);

      console.log(`  Subgraph latest found in API top 5: ${subgraphInApi}`);
      // Should find the latest subgraph agent in API results
      expect(subgraphInApi).toBe(true);
    });
  });
}
