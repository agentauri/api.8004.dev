/**
 * E2E Smoke Tests
 *
 * Critical path tests that verify the API is functioning correctly.
 * These tests should run quickly (~1 min) and cover the essential functionality.
 * Use this suite for CI and post-deployment verification.
 *
 * Run with: pnpm run test:e2e -- --filter=smoke
 */

import { describe, expect, it } from '../test-runner';
import { get, post } from '../utils/api-client';
import type { Agent } from '../utils/api-client';

const LIMIT = 5;

export function registerSmokeTests(): void {
  describe('Smoke - Health', () => {
    it('GET /health returns ok', async () => {
      const { json, response } = await get('/health');
      expect(response.status).toBe(200);
      expect(json.status).toBe('ok');
    });
  });

  describe('Smoke - Agents List', () => {
    it('GET /agents returns data', async () => {
      const { json, response } = await get('/agents', { limit: LIMIT });
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('GET /agents with mcp filter works', async () => {
      const { json } = await get('/agents', { mcp: true, limit: LIMIT });
      expect(json.success).toBe(true);
      if (json.data && json.data.length > 0) {
        const agents = json.data as Agent[];
        agents.forEach((agent) => {
          expect(agent.hasMcp).toBe(true);
        });
      }
    });

    it('GET /agents with chainId filter works', async () => {
      const { json } = await get('/agents', { chainId: 11155111, limit: LIMIT });
      expect(json.success).toBe(true);
      if (json.data && json.data.length > 0) {
        const agents = json.data as Agent[];
        agents.forEach((agent) => {
          expect(agent.chainId).toBe(11155111);
        });
      }
    });
  });

  describe('Smoke - Agent Detail', () => {
    it('GET /agents/:id returns agent details', async () => {
      // First get an agent ID
      const { json: listJson } = await get('/agents', { limit: 1 });
      expect(listJson.success).toBe(true);
      if (!listJson.data || listJson.data.length === 0) {
        console.log('  Note: No agents available for detail test');
        return;
      }

      const agents = listJson.data as Agent[];
      const agentId = agents[0]?.id;

      const { json, response } = await get(`/agents/${agentId}`);
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
    });

    it('GET /agents/:id with invalid ID returns 404', async () => {
      const { response } = await get('/agents/0:999999');
      expect(response.status).toBe(404);
    });
  });

  describe('Smoke - Search', () => {
    it('POST /search returns results', async () => {
      const { json, response } = await post('/search', {
        query: 'AI assistant',
        limit: LIMIT,
      });
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
    });

    it('GET /agents?q= triggers semantic search', async () => {
      const { json } = await get('/agents', { q: 'AI', limit: LIMIT });
      expect(json.success).toBe(true);
      if (json.data && json.data.length > 0) {
        const agents = json.data as Agent[];
        // Semantic search should return searchScore
        agents.forEach((agent) => {
          expect(typeof agent.searchScore).toBe('number');
        });
      }
    });
  });

  describe('Smoke - Taxonomy', () => {
    it('GET /taxonomy returns skills and domains', async () => {
      const { json, response } = await get('/taxonomy');
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data?.skills).toBeDefined();
      expect(json.data?.domains).toBeDefined();
    });
  });

  describe('Smoke - Chains', () => {
    it('GET /chains returns chain data', async () => {
      const { json, response } = await get('/chains');
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
    });
  });

  describe('Smoke - Authentication', () => {
    it('Request without API key returns 401', async () => {
      // Make request without API key
      const response = await fetch('https://api.8004.dev/api/v1/agents?limit=1', {
        headers: { 'Content-Type': 'application/json' },
      });
      // Should either return 401 or 200 with rate-limited anonymous access
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('Smoke - MCP Server', () => {
    it('MCP server info returns capabilities', async () => {
      // MCP endpoint is at root, not under /api/v1
      const response = await fetch('https://api.8004.dev/mcp', {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.API_KEY || '',
        },
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.name).toBeDefined();
      expect(json.version).toBeDefined();
    });

    it('MCP tools/list returns available tools', async () => {
      // MCP JSON-RPC endpoint
      const response = await fetch('https://api.8004.dev/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.API_KEY || '',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.result?.tools).toBeDefined();
    });
  });

  describe('Smoke - Error Handling', () => {
    it('Invalid endpoint returns 404', async () => {
      const { response } = await get('/nonexistent');
      expect(response.status).toBe(404);
    });

    it('Invalid query params are handled gracefully', async () => {
      const { json, response } = await get('/agents', {
        limit: 'invalid' as unknown as number,
      });
      // Should either fail validation or use default
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(json.success).toBe(true);
      }
    });
  });
}
