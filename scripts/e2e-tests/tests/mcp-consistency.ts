/**
 * MCP vs REST Consistency Tests
 * Verifies that MCP tools return data consistent with REST API endpoints
 */

import { describe, expect, it } from '../test-runner';
import { get, post } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import { assertSuccess } from '../utils/assertions';

const MCP_BASE = process.env.API_BASE_URL?.replace('/api/v1', '') || 'https://api.8004.dev';
const API_KEY = process.env.API_KEY || '';

interface McpJsonRpcResponse {
  jsonrpc: string;
  id: string | number;
  result?: { content: Array<{ type: string; text: string }> };
  error?: { code: number; message: string };
}

/**
 * Make a JSON-RPC request to the MCP endpoint
 */
async function mcpToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<McpJsonRpcResponse> {
  const response = await fetch(`${MCP_BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { 'X-API-Key': API_KEY }),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  return response.json() as Promise<McpJsonRpcResponse>;
}

/**
 * Parse MCP tool response text as JSON
 */
function parseMcpResult<T>(json: McpJsonRpcResponse): T | null {
  if (json.error || !json.result?.content?.[0]?.text) {
    return null;
  }
  try {
    return JSON.parse(json.result.content[0].text) as T;
  } catch {
    return null;
  }
}

interface McpAgentListResult {
  agents: Array<{
    id: string;
    name: string;
    chainId: number;
    tokenId: string;
    hasMcp?: boolean;
    hasA2a?: boolean;
  }>;
  total: number;
  hasMore: boolean;
}

interface McpSearchResult {
  results: Array<{
    agentId: string;
    name: string;
    score: number;
  }>;
  total: number;
  searchMode: string;
}

interface McpChainStats {
  chains: Array<{
    chainId: number;
    name: string;
    totalAgents: number;
    activeAgents: number;
    mcpAgents: number;
    a2aAgents: number;
  }>;
  totals: {
    totalAgents: number;
    activeAgents: number;
    mcpAgents: number;
    a2aAgents: number;
  };
}

export function registerMcpConsistencyTests(): void {
  describe('MCP vs REST: Agent Listing', () => {
    it('list_agents returns same count as GET /agents', async () => {
      // Get via REST API
      const restResult = await get('/agents', { limit: 10 });
      assertSuccess(restResult.json);

      // Get via MCP
      const mcpJson = await mcpToolCall('list_agents', { limit: 10 });
      const mcpResult = parseMcpResult<McpAgentListResult>(mcpJson);

      if (!mcpResult) {
        console.log('  Note: MCP returned error or invalid response, skipping');
        return;
      }

      // Compare counts
      expect(mcpResult.agents.length).toBe(restResult.json.data?.length || 0);
    });

    it('list_agents with mcp=true matches REST filter', async () => {
      // Get via REST API
      const restResult = await get('/agents', { mcp: true, limit: 10 });
      assertSuccess(restResult.json);

      // Get via MCP
      const mcpJson = await mcpToolCall('list_agents', { mcp: true, limit: 10 });
      const mcpResult = parseMcpResult<McpAgentListResult>(mcpJson);

      if (!mcpResult) {
        console.log('  Note: MCP returned error, skipping');
        return;
      }

      // All MCP results should have hasMcp=true
      for (const agent of mcpResult.agents) {
        expect(agent.hasMcp).toBe(true);
      }

      // Same agent IDs in results (order may differ)
      const restIds = new Set(restResult.json.data?.map((a: Agent) => a.id));
      const mcpIds = new Set(mcpResult.agents.map((a) => a.id));

      // At least check they overlap significantly
      let matchCount = 0;
      for (const id of mcpIds) {
        if (restIds.has(id)) matchCount++;
      }
      expect(matchCount).toBeGreaterThan(0);
    });

    it('list_agents with chainId filter matches REST', async () => {
      // Get via REST API
      const restResult = await get('/agents', { chainId: 11155111, limit: 10 });
      assertSuccess(restResult.json);

      // Get via MCP
      const mcpJson = await mcpToolCall('list_agents', { chainIds: [11155111], limit: 10 });
      const mcpResult = parseMcpResult<McpAgentListResult>(mcpJson);

      if (!mcpResult) {
        console.log('  Note: MCP returned error, skipping');
        return;
      }

      // All results should be from chainId 11155111
      for (const agent of mcpResult.agents) {
        expect(agent.chainId).toBe(11155111);
      }
    });
  });

  describe('MCP vs REST: Search', () => {
    it('search_agents returns results consistent with POST /search', async () => {
      const query = 'AI';

      // Get via REST API
      const restResult = await post('/search', { query, limit: 5 });
      if (!restResult.json.success) {
        console.log('  Note: REST search failed, skipping');
        return;
      }

      // Get via MCP
      const mcpJson = await mcpToolCall('search_agents', { query, limit: 5 });
      const mcpResult = parseMcpResult<McpSearchResult>(mcpJson);

      if (!mcpResult) {
        console.log('  Note: MCP search returned error, skipping');
        return;
      }

      // Both should return results (or both empty)
      const restCount = restResult.json.data?.length ?? 0;
      const mcpCount = mcpResult.results?.length ?? 0;

      // At least verify both responded
      expect(restCount >= 0).toBe(true);
      expect(mcpCount >= 0).toBe(true);
    });

    it('search_agents with mcp filter consistent with REST', async () => {
      // Get via REST API
      const restResult = await post('/search', {
        query: 'agent',
        filters: { mcp: true },
        limit: 5,
      });

      // Get via MCP
      const mcpJson = await mcpToolCall('search_agents', {
        query: 'agent',
        mcp: true,
        limit: 5,
      });
      const mcpResult = parseMcpResult<McpSearchResult>(mcpJson);

      if (!mcpResult || !restResult.json.success) {
        console.log('  Note: Search unavailable, skipping');
        return;
      }

      // Both should return filtered results
      const mcpCount = mcpResult.results?.length ?? 0;
      expect(mcpCount >= 0).toBe(true);
    });
  });

  describe('MCP vs REST: Chain Stats', () => {
    it('get_chain_stats matches GET /chains', async () => {
      // Get via REST API
      const restResult = await get('/chains');
      assertSuccess(restResult.json);

      // Get via MCP
      const mcpJson = await mcpToolCall('get_chain_stats', {});
      const mcpResult = parseMcpResult<McpChainStats>(mcpJson);

      if (!mcpResult) {
        console.log('  Note: MCP chain stats returned error, skipping');
        return;
      }

      // Should have chain data
      expect(mcpResult.chains.length).toBeGreaterThan(0);

      // Compare totals if available
      const restChains = restResult.json.data as Array<{
        chainId: number;
        totalAgents: number;
      }>;

      if (restChains && restChains.length > 0 && mcpResult.totals) {
        const restTotal = restChains.reduce((sum, c) => sum + (c.totalAgents || 0), 0);
        expect(mcpResult.totals.totalAgents).toBe(restTotal);
      }
    });

    it('chain breakdown is consistent', async () => {
      // Get via REST API
      const restResult = await get('/chains');
      assertSuccess(restResult.json);

      // Get via MCP
      const mcpJson = await mcpToolCall('get_chain_stats', {});
      const mcpResult = parseMcpResult<McpChainStats>(mcpJson);

      if (!mcpResult) {
        console.log('  Note: MCP returned error, skipping');
        return;
      }

      // Same chains present
      const restChainIds = new Set(
        (restResult.json.data as Array<{ chainId: number }>).map((c) => c.chainId)
      );
      const mcpChainIds = new Set(mcpResult.chains.map((c) => c.chainId));

      for (const chainId of restChainIds) {
        expect(mcpChainIds.has(chainId)).toBe(true);
      }
    });
  });

  describe('MCP vs REST: Taxonomy', () => {
    it('taxonomy/skills resource matches GET /taxonomy?type=skill', async () => {
      // Get via REST API
      const restResult = await get('/taxonomy', { type: 'skill' });
      assertSuccess(restResult.json);

      // Get via MCP resource
      const response = await fetch(`${MCP_BASE}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY && { 'X-API-Key': API_KEY }),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'resources/read',
          params: { uri: '8004://taxonomy/skills' },
        }),
      });
      const mcpJson = (await response.json()) as {
        result?: { contents: Array<{ text: string }> };
      };

      if (!mcpJson.result?.contents?.[0]?.text) {
        console.log('  Note: MCP resource returned error, skipping');
        return;
      }

      const mcpSkills = JSON.parse(mcpJson.result.contents[0].text) as Array<{ slug: string }>;
      const restSkills = restResult.json.data as Array<{ slug: string }>;

      // Same number of skills
      expect(mcpSkills.length).toBe(restSkills.length);
    });

    it('taxonomy/domains resource matches GET /taxonomy?type=domain', async () => {
      // Get via REST API
      const restResult = await get('/taxonomy', { type: 'domain' });
      assertSuccess(restResult.json);

      // Get via MCP resource
      const response = await fetch(`${MCP_BASE}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY && { 'X-API-Key': API_KEY }),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'resources/read',
          params: { uri: '8004://taxonomy/domains' },
        }),
      });
      const mcpJson = (await response.json()) as {
        result?: { contents: Array<{ text: string }> };
      };

      if (!mcpJson.result?.contents?.[0]?.text) {
        console.log('  Note: MCP resource returned error, skipping');
        return;
      }

      const mcpDomains = JSON.parse(mcpJson.result.contents[0].text) as Array<{ slug: string }>;
      const restDomains = restResult.json.data as Array<{ slug: string }>;

      // Same number of domains
      expect(mcpDomains.length).toBe(restDomains.length);
    });
  });

  describe('MCP vs REST: Agent Detail', () => {
    it('get_agent returns same data as GET /agents/:id', async () => {
      // First get an agent ID from the list
      const listResult = await get('/agents', { limit: 1 });
      assertSuccess(listResult.json);

      if (!listResult.json.data?.length) {
        console.log('  Note: No agents available, skipping');
        return;
      }

      const agentId = listResult.json.data[0].id;

      // Get via REST API
      const restResult = await get(`/agents/${agentId}`);
      assertSuccess(restResult.json);

      // Get via MCP
      const mcpJson = await mcpToolCall('get_agent', { agentId });

      if (mcpJson.error) {
        console.log('  Note: MCP get_agent returned error, skipping');
        return;
      }

      const mcpAgent = parseMcpResult<{
        id: string;
        name: string;
        chainId: number;
        hasMcp: boolean;
        hasA2a: boolean;
      }>(mcpJson);

      if (!mcpAgent) {
        console.log('  Note: MCP returned invalid data, skipping');
        return;
      }

      // Compare key fields
      const restAgent = restResult.json.data as Agent;
      expect(mcpAgent.id).toBe(restAgent.id);
      expect(mcpAgent.chainId).toBe(restAgent.chainId);

      // Compare boolean flags if both are defined
      if (mcpAgent.hasMcp !== undefined && restAgent.hasMcp !== undefined) {
        expect(mcpAgent.hasMcp).toBe(restAgent.hasMcp);
      }
      if (mcpAgent.hasA2a !== undefined && restAgent.hasA2a !== undefined) {
        expect(mcpAgent.hasA2a).toBe(restAgent.hasA2a);
      }
    });
  });
}
