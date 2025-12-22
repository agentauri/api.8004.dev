/**
 * MCP Server for 8004.dev
 * Exposes agent search and exploration capabilities via Model Context Protocol
 * Uses a custom HTTP handler compatible with Cloudflare Workers
 * @module mcp
 */

import { getClassification, getClassificationsBatch } from '@/db/queries';
import { getTaxonomy } from '@/lib/oasf/taxonomy';
import { agentIdSchema, parseAgentId, parseClassificationRow } from '@/lib/utils/validation';
import { CACHE_TTL, createCacheService } from '@/services/cache';
import { createReputationService } from '@/services/reputation';
import { createSDKService } from '@/services/sdk';
import { createSearchService } from '@/services/search';
import type { Env, TaxonomyType } from '@/types';
import { z } from 'zod';

/**
 * Validation schemas for MCP inputs
 */
const querySchema = z.string().min(1, 'Query is required').max(500, 'Query too long');
const limitSchema = z.number().int().min(1).max(50).optional().default(10);
const uriSchema = z.string().startsWith('8004://', 'Invalid resource URI');

/**
 * MCP JSON-RPC request structure
 */
interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response structure
 */
interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Tool definition for MCP
 */
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Resource definition for MCP
 */
interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Prompt definition for MCP
 */
interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

/**
 * Server capabilities
 */
const SERVER_INFO = {
  name: '8004-agents',
  version: '1.0.0',
  protocolVersion: '2024-11-05',
};

const CAPABILITIES = {
  tools: {},
  resources: {},
  prompts: {},
};

/**
 * Tool definitions
 */
const TOOLS: ToolDefinition[] = [
  {
    name: 'search_agents',
    description:
      'Search for AI agents by name, description, or capabilities. Returns agents matching the query with relevance scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "trading bot", "image generation")' },
        limit: { type: 'number', description: 'Maximum number of results (1-50)', default: 10 },
        mcp: { type: 'boolean', description: 'Filter by MCP endpoint availability' },
        a2a: { type: 'boolean', description: 'Filter by A2A endpoint availability' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_agent',
    description:
      'Get detailed information about a specific agent including its capabilities, classification, and reputation.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Agent ID in format "chainId:tokenId" (e.g., "11155111:123")',
        },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'list_agents',
    description: 'List AI agents with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        chainIds: { type: 'array', items: { type: 'number' }, description: 'Filter by chain IDs' },
        mcp: { type: 'boolean', description: 'Filter by MCP endpoint availability' },
        a2a: { type: 'boolean', description: 'Filter by A2A endpoint availability' },
        limit: { type: 'number', description: 'Maximum number of results (1-50)', default: 20 },
      },
    },
  },
  {
    name: 'get_chain_stats',
    description: 'Get statistics for all supported blockchain networks including agent counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Resource definitions
 */
const RESOURCES: ResourceDefinition[] = [
  {
    uri: '8004://taxonomy/skills',
    name: 'OASF Skills Taxonomy',
    description: 'List of all OASF skill categories for agent classification',
    mimeType: 'application/json',
  },
  {
    uri: '8004://taxonomy/domains',
    name: 'OASF Domains Taxonomy',
    description: 'List of all OASF domain categories for agent classification',
    mimeType: 'application/json',
  },
  {
    uri: '8004://stats/chains',
    name: 'Chain Statistics',
    description: 'Statistics for all supported blockchain networks',
    mimeType: 'application/json',
  },
];

/**
 * Prompt definitions
 */
const PROMPTS: PromptDefinition[] = [
  {
    name: 'find_agent_for_task',
    description: 'Help find the right agent for a specific task',
    arguments: [
      {
        name: 'task',
        description: 'Description of the task you need help with',
        required: true,
      },
    ],
  },
  {
    name: 'explore_domain',
    description: 'Explore agents in a specific domain',
    arguments: [
      {
        name: 'domain',
        description: 'The domain to explore (e.g., "finance", "healthcare")',
        required: true,
      },
    ],
  },
];

/**
 * Execute a tool
 */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  switch (name) {
    case 'search_agents': {
      const queryResult = querySchema.safeParse(args.query);
      if (!queryResult.success) {
        throw new Error(`Invalid query: ${queryResult.error.errors[0]?.message}`);
      }
      const query = queryResult.data;
      const limit = limitSchema.parse(args.limit ?? 10);

      const sdk = createSDKService(env);
      const searchResultsCache = createCacheService(env.CACHE, CACHE_TTL.SEARCH_RESULTS);
      const searchService = createSearchService(env.SEARCH_SERVICE_URL, searchResultsCache, env);

      try {
        const searchResults = await searchService.search({
          query,
          limit: limit * 2,
          minScore: 0.3,
        });

        const agentIds = searchResults.results.map((r) => r.agentId);
        const classificationsMap = await getClassificationsBatch(env.DB, agentIds);

        let agents = searchResults.results.slice(0, limit).map((result) => {
          const meta = result.metadata || {};
          const classificationRow = classificationsMap.get(result.agentId);
          const oasf = parseClassificationRow(classificationRow);

          const mcpTools = Array.isArray(meta.mcpTools) ? meta.mcpTools : [];
          const mcpPrompts = Array.isArray(meta.mcpPrompts) ? meta.mcpPrompts : [];
          const mcpResources = Array.isArray(meta.mcpResources) ? meta.mcpResources : [];
          const a2aSkills = Array.isArray(meta.a2aSkills) ? meta.a2aSkills : [];

          return {
            id: result.agentId,
            name: result.name,
            description: result.description,
            chainId: result.chainId,
            hasMcp: mcpTools.length > 0 || mcpPrompts.length > 0 || mcpResources.length > 0,
            hasA2a: a2aSkills.length > 0,
            skills: oasf?.skills?.map((s) => s.slug) ?? [],
            domains: oasf?.domains?.map((d) => d.slug) ?? [],
            searchScore: result.score,
          };
        });

        // Apply filters
        if (args.mcp !== undefined) {
          agents = agents.filter((a) => a.hasMcp === args.mcp);
        }
        if (args.a2a !== undefined) {
          agents = agents.filter((a) => a.hasA2a === args.a2a);
        }

        return { query, total: agents.length, agents };
      } catch {
        // Fallback to SDK
        const sdkResult = await sdk.search({ query, limit });
        return {
          query,
          total: sdkResult.items.length,
          agents: sdkResult.items.map((i) => ({
            id: i.agent.id,
            name: i.agent.name,
            description: i.agent.description,
            chainId: i.agent.chainId,
            hasMcp: i.agent.hasMcp,
            hasA2a: i.agent.hasA2a,
            score: i.score,
          })),
        };
      }
    }

    case 'get_agent': {
      const agentIdResult = agentIdSchema.safeParse(args.agentId);
      if (!agentIdResult.success) {
        throw new Error('Invalid agent ID format. Expected chainId:tokenId (e.g., "11155111:123")');
      }
      const agentId = agentIdResult.data;
      const { chainId, tokenId } = parseAgentId(agentId);

      const sdk = createSDKService(env);
      const agent = await sdk.getAgent(chainId, tokenId);

      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const classificationRow = await getClassification(env.DB, agentId);
      const oasf = parseClassificationRow(classificationRow);

      const reputationService = createReputationService(env.DB);
      const reputation = await reputationService.getAgentReputation(agentId);

      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        chainId: agent.chainId,
        tokenId: agent.tokenId,
        active: agent.active,
        capabilities: {
          hasMcp: agent.hasMcp,
          hasA2a: agent.hasA2a,
          x402Support: agent.x402Support,
        },
        endpoints: {
          mcp: agent.endpoints?.mcp?.url,
          a2a: agent.endpoints?.a2a?.url,
        },
        classification: oasf
          ? {
              skills: oasf.skills?.map((s) => s.slug),
              domains: oasf.domains?.map((d) => d.slug),
            }
          : null,
        reputation: reputation
          ? {
              count: reputation.count,
              averageScore: reputation.averageScore,
            }
          : null,
      };
    }

    case 'list_agents': {
      const limit = limitSchema.parse(args.limit ?? 20);
      const sdk = createSDKService(env);

      const result = await sdk.getAgents({
        chainIds: args.chainIds as number[] | undefined,
        hasMcp: args.mcp as boolean | undefined,
        hasA2a: args.a2a as boolean | undefined,
        limit,
      });

      return {
        total: result.items.length,
        agents: result.items.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          chainId: a.chainId,
          hasMcp: a.hasMcp,
          hasA2a: a.hasA2a,
        })),
      };
    }

    case 'get_chain_stats': {
      const sdk = createSDKService(env);
      const stats = await sdk.getChainStats();

      return {
        chains: stats.map((s) => ({
          chainId: s.chainId,
          name: s.name,
          totalAgents: s.totalCount,
          activeAgents: s.activeCount,
        })),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Read a resource
 */
async function readResource(uri: string, env: Env): Promise<{ contents: Array<{ uri: string; text: string; mimeType: string }> }> {
  switch (uri) {
    case '8004://taxonomy/skills': {
      const taxonomy = getTaxonomy('skill' as TaxonomyType);
      return {
        contents: [
          {
            uri,
            text: JSON.stringify(taxonomy, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    }

    case '8004://taxonomy/domains': {
      const taxonomy = getTaxonomy('domain' as TaxonomyType);
      return {
        contents: [
          {
            uri,
            text: JSON.stringify(taxonomy, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    }

    case '8004://stats/chains': {
      const sdk = createSDKService(env);
      const stats = await sdk.getChainStats();
      return {
        contents: [
          {
            uri,
            text: JSON.stringify(stats, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

/**
 * Get a prompt
 */
function getPrompt(name: string, args: Record<string, unknown>): { messages: Array<{ role: string; content: { type: string; text: string } }> } {
  switch (name) {
    case 'find_agent_for_task': {
      const task = args.task as string;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I need to find an AI agent that can help with: "${task}"

Please search for agents that match this task using the search_agents tool and recommend the best options.`,
            },
          },
        ],
      };
    }

    case 'explore_domain': {
      const domain = args.domain as string;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to explore AI agents in the "${domain}" domain.

Please use the list_agents tool with appropriate filters to find agents in this domain and summarize what's available.`,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

/**
 * Handle MCP JSON-RPC request
 */
async function handleMCPRequest(request: MCPRequest, env: Env): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: SERVER_INFO.protocolVersion,
            serverInfo: {
              name: SERVER_INFO.name,
              version: SERVER_INFO.version,
            },
            capabilities: CAPABILITIES,
          },
        };

      case 'initialized':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: TOOLS },
        };

      case 'tools/call': {
        const toolName = (params as { name: string })?.name;
        const toolArgs = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};
        const result = await executeTool(toolName, toolArgs, env);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        };
      }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { resources: RESOURCES },
        };

      case 'resources/read': {
        const uriInput = (params as { uri: string })?.uri;
        const uriResult = uriSchema.safeParse(uriInput);
        if (!uriResult.success) {
          throw new Error('Invalid resource URI. Must start with "8004://"');
        }
        const result = await readResource(uriResult.data, env);
        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      }

      case 'prompts/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { prompts: PROMPTS },
        };

      case 'prompts/get': {
        const promptName = (params as { name: string })?.name;
        const promptArgs = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};
        const result = getPrompt(promptName, promptArgs);
        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    };
  }
}

/**
 * Create the MCP request handler for Cloudflare Workers
 * Supports both SSE streaming and JSON responses
 */
export function createMcp8004Handler(env: Env) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // SSE endpoint for streaming
    if (url.pathname === '/sse' && request.method === 'GET') {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Send initial connection event
      writer.write(encoder.encode('event: open\ndata: connected\n\n'));

      // Keep connection alive
      const keepAlive = setInterval(() => {
        writer.write(encoder.encode(': keepalive\n\n'));
      }, 15000);

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        writer.close();
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // JSON-RPC endpoint
    if (request.method === 'POST') {
      try {
        const body = await request.json() as MCPRequest;
        const response = await handleMCPRequest(body, env);

        return new Response(JSON.stringify(response), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error',
            },
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
    }

    // Info endpoint
    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({
          name: SERVER_INFO.name,
          version: SERVER_INFO.version,
          protocolVersion: SERVER_INFO.protocolVersion,
          description: 'MCP server for exploring ERC-8004 AI agents',
          endpoints: {
            jsonRpc: '/mcp',
            sse: '/sse',
          },
          tools: TOOLS.map((t) => t.name),
          resources: RESOURCES.map((r) => r.uri),
          prompts: PROMPTS.map((p) => p.name),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return new Response('Method not allowed', { status: 405 });
  };
}
