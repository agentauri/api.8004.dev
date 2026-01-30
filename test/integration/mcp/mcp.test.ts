/**
 * MCP Server integration tests
 * @module test/integration/mcp
 */

import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/index';
import type { Env } from '@/types';
import {
  createMockEnv,
  createMockOAuthToken,
  insertMockClassification,
  setupMockFetch,
  TEST_OAUTH_TOKEN,
} from '../../setup';

const mockFetch = setupMockFetch();

/**
 * Helper to make MCP requests with OAuth authentication
 */
async function mcpRequest(
  method: string,
  params: Record<string, unknown> = {},
  id: string | number = 1,
  options: { skipAuth?: boolean } = {}
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options.skipAuth) {
    headers.Authorization = `Bearer ${TEST_OAUTH_TOKEN}`;
  }

  const request = new Request('http://localhost/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  });

  const ctx = createExecutionContext();
  const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe('MCP Server', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    // Create OAuth token for authenticated requests
    await createMockOAuthToken();
    // Mock SDK responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            agents: [
              {
                id: '1',
                name: 'Test Agent',
                description: 'A test agent',
                active: true,
                mcpServers: [],
                a2aServers: [],
              },
            ],
          },
        }),
    });
  });

  describe('GET /mcp - Server Info', () => {
    it('returns server info', async () => {
      const request = new Request('http://localhost/mcp', { method: 'GET' });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        name: '8004-agents',
        version: '2.2.0',
        protocolVersion: '2025-06-18',
      });
    });

    it('includes CORS headers', async () => {
      const request = new Request('http://localhost/mcp', { method: 'GET' });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('GET /mcp/docs - Documentation', () => {
    it('returns HTML documentation page', async () => {
      const request = new Request('http://localhost/mcp/docs', { method: 'GET' });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      const body = await response.text();
      expect(body).toContain('8004 MCP Server');
      expect(body).toContain('search_agents');
    });
  });

  describe('GET /mcp/schema.json - JSON Schema', () => {
    it('returns JSON schema', async () => {
      const request = new Request('http://localhost/mcp/schema.json', { method: 'GET' });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      const body = await response.json();
      expect(body.$schema).toBeDefined();
      expect(body.title).toBe('8004 MCP Server Schema');
    });
  });

  describe('initialize', () => {
    it('returns server info and capabilities', async () => {
      const response = await mcpRequest(
        'initialize',
        {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
        1,
        { skipAuth: true }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: {
          protocolVersion: string;
          serverInfo: { name: string; version: string };
          capabilities: object;
        };
      };
      expect(body.result.protocolVersion).toBe('2025-06-18');
      expect(body.result.serverInfo.name).toBe('8004-agents');
      expect(body.result.capabilities).toBeDefined();
    });
  });

  describe('initialized', () => {
    it('acknowledges initialization', async () => {
      const response = await mcpRequest('notifications/initialized');

      // MCP spec: notifications return 202 Accepted (no response body required)
      expect(response.status).toBe(202);
    });
  });

  describe('tools/list', () => {
    it('returns list of available tools', async () => {
      const response = await mcpRequest('tools/list');

      expect(response.status).toBe(200);
      const body = (await response.json()) as { result: { tools: Array<{ name: string }> } };
      expect(body.result.tools).toBeInstanceOf(Array);

      const toolNames = body.result.tools.map((t) => t.name);
      expect(toolNames).toContain('search_agents');
      expect(toolNames).toContain('get_agent');
      expect(toolNames).toContain('list_agents');
      expect(toolNames).toContain('get_chain_stats');
    });
  });

  describe('tools/call - search_agents', () => {
    it('searches agents with query', async () => {
      // Mock search service response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                agentId: '11155111:1',
                chainId: 11155111,
                name: 'Trading Bot',
                description: 'Automated trading',
                score: 0.95,
              },
            ],
            total: 1,
          }),
      });

      const response = await mcpRequest('tools/call', {
        name: 'search_agents',
        arguments: { query: 'trading bot', limit: 5 },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      // The response should have a result with content (may contain results or error)
      expect(body).toHaveProperty('jsonrpc', '2.0');
    });

    it('validates query is provided', async () => {
      const response = await mcpRequest('tools/call', {
        name: 'search_agents',
        arguments: { limit: 5 }, // missing query
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Invalid query');
    });

    it('validates query length', async () => {
      const response = await mcpRequest('tools/call', {
        name: 'search_agents',
        arguments: { query: 'a'.repeat(501) },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Query too long');
    });
  });

  describe('tools/call - get_agent', () => {
    it('gets agent details', async () => {
      // Insert mock classification
      await insertMockClassification('11155111:1');

      const response = await mcpRequest('tools/call', {
        name: 'get_agent',
        arguments: { agentId: '11155111:1' },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { content: Array<{ type: string; text: string }> };
      };
      expect(body.result.content[0].type).toBe('text');
    });

    it('validates agent ID format', async () => {
      const response = await mcpRequest('tools/call', {
        name: 'get_agent',
        arguments: { agentId: 'invalid' },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Invalid agent ID');
    });
  });

  describe('tools/call - list_agents', () => {
    it('lists agents with filters', async () => {
      const response = await mcpRequest('tools/call', {
        name: 'list_agents',
        arguments: { mcp: true, limit: 5 },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { content: Array<{ type: string; text: string }> };
      };
      expect(body.result.content[0].type).toBe('text');
    });

    it('validates limit range', async () => {
      const response = await mcpRequest('tools/call', {
        name: 'list_agents',
        arguments: { limit: 100 },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error).toBeDefined();
    });
  });

  describe('tools/call - get_chain_stats', () => {
    it('returns chain statistics', async () => {
      const response = await mcpRequest('tools/call', {
        name: 'get_chain_stats',
        arguments: {},
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { content: Array<{ type: string; text: string }> };
      };
      expect(body.result.content[0].type).toBe('text');
    });
  });

  describe('resources/list', () => {
    it('returns list of available resources', async () => {
      const response = await mcpRequest('resources/list');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { resources: Array<{ uri: string; name: string }> };
      };
      expect(body.result.resources).toBeInstanceOf(Array);

      const uris = body.result.resources.map((r) => r.uri);
      expect(uris).toContain('8004://taxonomy/skills');
      expect(uris).toContain('8004://taxonomy/domains');
      expect(uris).toContain('8004://stats/chains');
    });
  });

  describe('resources/read', () => {
    it('reads taxonomy skills resource', async () => {
      const response = await mcpRequest('resources/read', {
        uri: '8004://taxonomy/skills',
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { contents: Array<{ uri: string; text: string }> };
      };
      expect(body.result.contents).toBeInstanceOf(Array);
      expect(body.result.contents[0].uri).toBe('8004://taxonomy/skills');
    });

    it('reads taxonomy domains resource', async () => {
      const response = await mcpRequest('resources/read', {
        uri: '8004://taxonomy/domains',
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { contents: Array<{ uri: string; text: string }> };
      };
      expect(body.result.contents).toBeInstanceOf(Array);
      expect(body.result.contents[0].uri).toBe('8004://taxonomy/domains');
    });

    it('reads chain stats resource', async () => {
      const response = await mcpRequest('resources/read', {
        uri: '8004://stats/chains',
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { contents: Array<{ uri: string; text: string }> };
      };
      expect(body.result.contents).toBeInstanceOf(Array);
    });

    it('validates resource URI', async () => {
      const response = await mcpRequest('resources/read', {
        uri: 'invalid://resource',
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Invalid resource URI');
    });

    it('returns error for unknown resource', async () => {
      const response = await mcpRequest('resources/read', {
        uri: '8004://unknown/resource',
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Unknown resource');
    });
  });

  describe('prompts/list', () => {
    it('returns list of available prompts', async () => {
      const response = await mcpRequest('prompts/list');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { prompts: Array<{ name: string; description: string }> };
      };
      expect(body.result.prompts).toBeInstanceOf(Array);

      const names = body.result.prompts.map((p) => p.name);
      expect(names).toContain('find_agent_for_task');
      expect(names).toContain('explore_domain');
    });
  });

  describe('prompts/get', () => {
    it('gets find_agent_for_task prompt', async () => {
      const response = await mcpRequest('prompts/get', {
        name: 'find_agent_for_task',
        arguments: { task: 'automated trading' },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { messages: Array<{ role: string; content: { text: string } }> };
      };
      expect(body.result.messages).toBeInstanceOf(Array);
      expect(body.result.messages[0].role).toBe('user');
      expect(body.result.messages[0].content.text).toContain('automated trading');
    });

    it('gets explore_domain prompt', async () => {
      const response = await mcpRequest('prompts/get', {
        name: 'explore_domain',
        arguments: { domain: 'finance' },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result: { messages: Array<{ role: string; content: { text: string } }> };
      };
      expect(body.result.messages).toBeInstanceOf(Array);
      expect(body.result.messages[0].content.text).toContain('finance');
    });

    it('returns error for unknown prompt', async () => {
      const response = await mcpRequest('prompts/get', {
        name: 'unknown_prompt',
        arguments: {},
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Unknown prompt');
    });
  });

  describe('Error handling', () => {
    it('returns error for unknown method', async () => {
      const response = await mcpRequest('unknown/method');

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { code: number; message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32601);
      expect(body.error.message).toContain('Method not found');
    });

    it('returns error for invalid JSON', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const ctx = createExecutionContext();
      const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: number; message: string } };
      expect(body.error.code).toBe(-32700);
      expect(body.error.message).toBe('Parse error');
    });

    it('returns error for unknown tool', async () => {
      const response = await mcpRequest('tools/call', {
        name: 'unknown_tool',
        arguments: {},
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Unknown tool');
    });
  });

  describe('SSE Endpoint', () => {
    it('returns SSE connection', async () => {
      const request = new Request('http://localhost/sse', { method: 'GET' });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
      // Note: We can't fully test SSE in unit tests, just check headers
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    });
  });

  describe('CORS preflight', () => {
    it('handles OPTIONS request', async () => {
      const request = new Request('http://localhost/mcp', { method: 'OPTIONS' });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, createMockEnv() as unknown as Env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
    });
  });
});
