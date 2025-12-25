/**
 * MCP Server E2E Tests
 * Tests for MCP server endpoints and JSON-RPC methods
 */

import { describe, expect, it } from '../test-runner';

const MCP_BASE = process.env.API_BASE_URL?.replace('/api/v1', '') || 'https://api.8004.dev';
const API_KEY = process.env.API_KEY || '';

interface McpJsonRpcResponse {
  jsonrpc: string;
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface McpServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

/**
 * Make a JSON-RPC request to the MCP endpoint
 */
async function mcpRequest(
  method: string,
  params: Record<string, unknown> = {},
  id: string | number = 1
): Promise<{ response: Response; json: McpJsonRpcResponse; duration: number }> {
  const start = Date.now();
  const response = await fetch(`${MCP_BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { 'X-API-Key': API_KEY }),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  });
  const duration = Date.now() - start;
  const json = (await response.json()) as McpJsonRpcResponse;
  return { response, json, duration };
}

/**
 * Get MCP server info (GET /mcp)
 */
async function mcpServerInfo(): Promise<{ response: Response; json: McpServerInfo; duration: number }> {
  const start = Date.now();
  const response = await fetch(`${MCP_BASE}/mcp`, {
    method: 'GET',
    headers: {
      ...(API_KEY && { 'X-API-Key': API_KEY }),
    },
  });
  const duration = Date.now() - start;
  const json = (await response.json()) as McpServerInfo;
  return { response, json, duration };
}

export function registerMcpTests(): void {
  describe('MCP Server Info', () => {
    it('GET /mcp returns server info', async () => {
      const { response, json } = await mcpServerInfo();
      expect(response.status).toBe(200);
      expect(json.name).toBe('8004-agents');
      expect(json.version).toBe('1.0.0');
      expect(json.protocolVersion).toBe('2025-06-18');
    });

    it('GET /mcp includes CORS headers', async () => {
      const { response } = await mcpServerInfo();
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('MCP Documentation', () => {
    it('GET /mcp/docs returns HTML', async () => {
      const response = await fetch(`${MCP_BASE}/mcp/docs`);
      expect(response.status).toBe(200);
      const contentType = response.headers.get('Content-Type') || '';
      expect(contentType.includes('text/html')).toBe(true);
      const text = await response.text();
      expect(text.includes('8004 MCP Server')).toBe(true);
    });

    it('GET /mcp/schema.json returns JSON schema', async () => {
      const response = await fetch(`${MCP_BASE}/mcp/schema.json`);
      expect(response.status).toBe(200);
      const contentType = response.headers.get('Content-Type') || '';
      expect(contentType.includes('application/json')).toBe(true);
      const json = (await response.json()) as { $schema?: string };
      expect(json.$schema).toBeDefined();
    });
  });

  describe('MCP Initialize', () => {
    it('initialize returns server capabilities', async () => {
      const { response, json } = await mcpRequest('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '1.0.0' },
      });
      expect(response.status).toBe(200);
      expect(json.result).toBeDefined();
      const result = json.result as {
        protocolVersion: string;
        serverInfo: { name: string; version: string };
        capabilities: object;
      };
      expect(result.protocolVersion).toBe('2025-06-18');
      expect(result.serverInfo.name).toBe('8004-agents');
      expect(result.capabilities).toBeDefined();
    });

    it('initialized acknowledges correctly', async () => {
      // initialized is a notification (no id field), not a request
      // Per JSON-RPC spec, notifications should not receive a response body
      const response = await fetch(`${MCP_BASE}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY && { 'X-API-Key': API_KEY }),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          // NO id field - this makes it a notification per JSON-RPC spec
          method: 'initialized',
        }),
      });
      // Notifications receive 202 Accepted with no body
      expect(response.status).toBe(202);
    });
  });

  describe('MCP Tools', () => {
    it('tools/list returns available tools', async () => {
      const { response, json } = await mcpRequest('tools/list');
      expect(response.status).toBe(200);
      expect(json.result).toBeDefined();
      const result = json.result as { tools: Array<{ name: string; description: string }> };
      expect(Array.isArray(result.tools)).toBe(true);
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames.includes('search_agents')).toBe(true);
      expect(toolNames.includes('get_agent')).toBe(true);
      expect(toolNames.includes('list_agents')).toBe(true);
      expect(toolNames.includes('get_chain_stats')).toBe(true);
    });

    it('tools/call search_agents works', async () => {
      const { response, json } = await mcpRequest('tools/call', {
        name: 'search_agents',
        arguments: { query: 'AI', limit: 5 },
      });
      expect(response.status).toBe(200);
      // Result should have content array
      const result = json.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('tools/call list_agents works', async () => {
      const { response, json } = await mcpRequest('tools/call', {
        name: 'list_agents',
        arguments: { mcp: true, limit: 5 },
      });
      expect(response.status).toBe(200);
      const result = json.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('tools/call get_chain_stats works', async () => {
      const { response, json } = await mcpRequest('tools/call', {
        name: 'get_chain_stats',
        arguments: {},
      });
      expect(response.status).toBe(200);
      const result = json.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
    });

    it('tools/call with invalid tool returns error', async () => {
      const { response, json } = await mcpRequest('tools/call', {
        name: 'unknown_tool',
        arguments: {},
      });
      expect(response.status).toBe(200);
      expect(json.error).toBeDefined();
      expect(json.error?.message.includes('Unknown tool')).toBe(true);
    });

    it('tools/call search_agents validates query', async () => {
      const { response, json } = await mcpRequest('tools/call', {
        name: 'search_agents',
        arguments: { limit: 5 }, // missing query
      });
      expect(response.status).toBe(200);
      expect(json.error).toBeDefined();
    });
  });

  describe('MCP Resources', () => {
    it('resources/list returns available resources', async () => {
      const { response, json } = await mcpRequest('resources/list');
      expect(response.status).toBe(200);
      const result = json.result as { resources: Array<{ uri: string; name: string }> };
      expect(Array.isArray(result.resources)).toBe(true);
      const uris = result.resources.map((r) => r.uri);
      expect(uris.includes('8004://taxonomy/skills')).toBe(true);
      expect(uris.includes('8004://taxonomy/domains')).toBe(true);
      expect(uris.includes('8004://stats/chains')).toBe(true);
    });

    it('resources/read taxonomy/skills works', async () => {
      const { response, json } = await mcpRequest('resources/read', {
        uri: '8004://taxonomy/skills',
      });
      expect(response.status).toBe(200);
      const result = json.result as { contents: Array<{ uri: string; text: string }> };
      expect(Array.isArray(result.contents)).toBe(true);
      expect(result.contents[0].uri).toBe('8004://taxonomy/skills');
    });

    it('resources/read taxonomy/domains works', async () => {
      const { response, json } = await mcpRequest('resources/read', {
        uri: '8004://taxonomy/domains',
      });
      expect(response.status).toBe(200);
      const result = json.result as { contents: Array<{ uri: string; text: string }> };
      expect(result.contents[0].uri).toBe('8004://taxonomy/domains');
    });

    it('resources/read stats/chains works', async () => {
      const { response, json } = await mcpRequest('resources/read', {
        uri: '8004://stats/chains',
      });
      expect(response.status).toBe(200);
      const result = json.result as { contents: Array<{ uri: string; text: string }> };
      expect(result.contents).toBeDefined();
    });

    it('resources/read with invalid URI returns error', async () => {
      const { response, json } = await mcpRequest('resources/read', {
        uri: 'invalid://resource',
      });
      expect(response.status).toBe(200);
      expect(json.error).toBeDefined();
    });
  });

  describe('MCP Prompts', () => {
    it('prompts/list returns available prompts', async () => {
      const { response, json } = await mcpRequest('prompts/list');
      expect(response.status).toBe(200);
      const result = json.result as { prompts: Array<{ name: string; description: string }> };
      expect(Array.isArray(result.prompts)).toBe(true);
      const names = result.prompts.map((p) => p.name);
      expect(names.includes('find_agent_for_task')).toBe(true);
      expect(names.includes('explore_domain')).toBe(true);
    });

    it('prompts/get find_agent_for_task works', async () => {
      const { response, json } = await mcpRequest('prompts/get', {
        name: 'find_agent_for_task',
        arguments: { task: 'automated trading' },
      });
      expect(response.status).toBe(200);
      const result = json.result as {
        messages: Array<{ role: string; content: { text: string } }>;
      };
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages[0].content.text.includes('automated trading')).toBe(true);
    });

    it('prompts/get explore_domain works', async () => {
      const { response, json } = await mcpRequest('prompts/get', {
        name: 'explore_domain',
        arguments: { domain: 'finance' },
      });
      expect(response.status).toBe(200);
      const result = json.result as {
        messages: Array<{ role: string; content: { text: string } }>;
      };
      expect(result.messages[0].content.text.includes('finance')).toBe(true);
    });

    it('prompts/get with unknown prompt returns error', async () => {
      const { response, json } = await mcpRequest('prompts/get', {
        name: 'unknown_prompt',
        arguments: {},
      });
      expect(response.status).toBe(200);
      expect(json.error).toBeDefined();
    });
  });

  describe('MCP Error Handling', () => {
    it('unknown method returns -32601 error', async () => {
      const { response, json } = await mcpRequest('unknown/method');
      expect(response.status).toBe(200);
      expect(json.error).toBeDefined();
      expect(json.error?.code).toBe(-32601);
    });

    it('invalid JSON returns parse error', async () => {
      const response = await fetch(`${MCP_BASE}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });
      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: { code: number } };
      expect(json.error.code).toBe(-32700);
    });
  });
}
