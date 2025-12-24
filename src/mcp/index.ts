/**
 * MCP Server for 8004.dev
 * Exposes agent search and exploration capabilities via Model Context Protocol
 * Uses a custom HTTP handler compatible with Cloudflare Workers
 * @module mcp
 */

import { getClassification, getClassificationsBatch } from '@/db/queries';
import { getTaxonomy } from '@/lib/oasf/taxonomy';
import { agentIdSchema, parseAgentId, parseClassificationRow } from '@/lib/utils/validation';
import { extractBearerToken, validateAccessToken } from '@/oauth/services/token-service';
import { CACHE_TTL, createCacheService } from '@/services/cache';
import { type MCPSessionService, createMCPSessionService } from '@/services/mcp-session';
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
 * Supported protocol versions
 * Per MCP spec, server must echo back client's requested version if supported
 */
const SUPPORTED_PROTOCOL_VERSIONS = [
  '2024-11-05', // Original MCP spec
  '2025-03-26', // Streamable HTTP spec
  '2025-06-18', // Claude Desktop Connectors
  '2025-11-25', // Claude.ai Web Connectors (latest)
];

const DEFAULT_PROTOCOL_VERSION = '2025-06-18'; // Claude Desktop Connectors
const LATEST_PROTOCOL_VERSION = '2025-06-18'; // Advertised in HEAD response

/**
 * Server capabilities
 */
const SERVER_INFO = {
  name: '8004-agents',
  version: '1.0.0',
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
        query: {
          type: 'string',
          description: 'Search query (e.g., "trading bot", "image generation")',
        },
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
 * Tool handler: search_agents
 */
async function toolSearchAgents(args: Record<string, unknown>, env: Env): Promise<unknown> {
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

    if (args.mcp !== undefined) {
      agents = agents.filter((a) => a.hasMcp === args.mcp);
    }
    if (args.a2a !== undefined) {
      agents = agents.filter((a) => a.hasA2a === args.a2a);
    }

    return { query, total: agents.length, agents };
  } catch {
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

/**
 * Tool handler: get_agent
 */
async function toolGetAgent(args: Record<string, unknown>, env: Env): Promise<unknown> {
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

/**
 * Tool handler: list_agents
 */
async function toolListAgents(args: Record<string, unknown>, env: Env): Promise<unknown> {
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

/**
 * Tool handler: get_chain_stats
 */
async function toolGetChainStats(env: Env): Promise<unknown> {
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

/**
 * Execute a tool by name
 */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  switch (name) {
    case 'search_agents':
      return toolSearchAgents(args, env);
    case 'get_agent':
      return toolGetAgent(args, env);
    case 'list_agents':
      return toolListAgents(args, env);
    case 'get_chain_stats':
      return toolGetChainStats(env);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Read a resource
 */
async function readResource(
  uri: string,
  env: Env
): Promise<{ contents: Array<{ uri: string; text: string; mimeType: string }> }> {
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
function getPrompt(
  name: string,
  args: Record<string, unknown>
): { messages: Array<{ role: string; content: { type: string; text: string } }> } {
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
 * Result from MCP request handler, includes optional negotiated protocol version
 */
interface MCPHandlerResult {
  response: MCPResponse;
  negotiatedVersion?: string;
}

/**
 * Handle MCP JSON-RPC request
 * Returns null for notifications (requests without id) per JSON-RPC spec
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSON-RPC dispatch requires handling multiple methods
async function handleMCPRequest(request: MCPRequest, env: Env): Promise<MCPHandlerResult | null> {
  const { id, method, params } = request;

  // Notifications (no id) should not receive a response per JSON-RPC spec
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case 'initialize': {
        // Extract client's requested protocol version
        const initParams = params as {
          protocolVersion?: string;
          capabilities?: Record<string, unknown>;
          clientInfo?: { name: string; version: string };
        };
        const requestedVersion = initParams?.protocolVersion || DEFAULT_PROTOCOL_VERSION;

        // Per MCP spec: echo back client's version if we support it
        if (SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)) {
          return {
            response: {
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: requestedVersion, // Echo back client's version
                serverInfo: {
                  name: SERVER_INFO.name,
                  version: SERVER_INFO.version,
                },
                capabilities: CAPABILITIES,
              },
            },
            negotiatedVersion: requestedVersion, // Return for use in response header
          };
        }
        // Return error with supported versions
        return {
          response: {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Unsupported protocol version',
              data: {
                supported: SUPPORTED_PROTOCOL_VERSIONS,
                requested: requestedVersion,
              },
            },
          },
        };
      }

      case 'initialized':
      case 'notifications/initialized':
        // This is a notification - no response required per JSON-RPC spec
        return null;

      case 'tools/list':
        return {
          response: {
            jsonrpc: '2.0',
            id,
            result: { tools: TOOLS },
          },
        };

      case 'tools/call': {
        const toolName = (params as { name: string })?.name;
        const toolArgs = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};
        const result = await executeTool(toolName, toolArgs, env);
        return {
          response: {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
          },
        };
      }

      case 'resources/list':
        return {
          response: {
            jsonrpc: '2.0',
            id,
            result: { resources: RESOURCES },
          },
        };

      case 'resources/read': {
        const uriInput = (params as { uri: string })?.uri;
        const uriResult = uriSchema.safeParse(uriInput);
        if (!uriResult.success) {
          throw new Error('Invalid resource URI. Must start with "8004://"');
        }
        const result = await readResource(uriResult.data, env);
        return {
          response: {
            jsonrpc: '2.0',
            id,
            result,
          },
        };
      }

      case 'prompts/list':
        return {
          response: {
            jsonrpc: '2.0',
            id,
            result: { prompts: PROMPTS },
          },
        };

      case 'prompts/get': {
        const promptName = (params as { name: string })?.name;
        const promptArgs = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};
        const result = getPrompt(promptName, promptArgs);
        return {
          response: {
            jsonrpc: '2.0',
            id,
            result,
          },
        };
      }

      default:
        // Handle any other notification methods - don't respond to notifications
        if (isNotification || method.startsWith('notifications/')) {
          return null;
        }
        return {
          response: {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          },
        };
    }
  } catch (error) {
    // Don't respond to notifications even on error
    if (isNotification) {
      return null;
    }
    return {
      response: {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      },
    };
  }
}

/**
 * Generate HTML documentation page for MCP server
 */
function generateDocsHtml(): string {
  const toolsHtml = TOOLS.map(
    (tool) => `
    <div class="card">
      <h3><code>${tool.name}</code></h3>
      <p>${tool.description}</p>
      <h4>Parameters</h4>
      <pre><code>${JSON.stringify(tool.inputSchema, null, 2)}</code></pre>
    </div>`
  ).join('\n');

  const resourcesHtml = RESOURCES.map(
    (resource) => `
    <div class="card">
      <h3><code>${resource.uri}</code></h3>
      <p><strong>${resource.name}</strong></p>
      <p>${resource.description}</p>
      <span class="badge">${resource.mimeType}</span>
    </div>`
  ).join('\n');

  const promptsHtml = PROMPTS.map(
    (prompt) => `
    <div class="card">
      <h3><code>${prompt.name}</code></h3>
      <p>${prompt.description}</p>
      ${
        prompt.arguments
          ? `<h4>Arguments</h4>
        <ul>
          ${prompt.arguments.map((arg) => `<li><code>${arg.name}</code>${arg.required ? ' (required)' : ''}: ${arg.description}</li>`).join('\n')}
        </ul>`
          : ''
      }
    </div>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>8004 MCP Server Documentation</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --card-bg: #141414;
      --border: #2a2a2a;
      --text: #e5e5e5;
      --text-muted: #888;
      --accent: #3b82f6;
      --accent-hover: #60a5fa;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-muted); font-size: 1.1rem; }
    .meta { margin-top: 1rem; display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .meta-item { color: var(--text-muted); font-size: 0.9rem; }
    .meta-item code { background: var(--card-bg); padding: 0.2rem 0.5rem; border-radius: 4px; }
    h2 { font-size: 1.5rem; margin: 2rem 0 1rem; color: var(--accent); }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .card h3 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .card h3 code { color: var(--accent); background: none; }
    .card h4 { font-size: 0.9rem; margin: 1rem 0 0.5rem; color: var(--text-muted); }
    .card p { color: var(--text-muted); margin-bottom: 0.5rem; }
    .card pre {
      background: var(--bg);
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.85rem;
    }
    .card ul { padding-left: 1.5rem; }
    .card li { color: var(--text-muted); margin: 0.25rem 0; }
    .card li code { color: var(--text); }
    .badge {
      display: inline-block;
      background: var(--accent);
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }
    .endpoints {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .endpoint {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
    }
    .endpoint code { color: var(--accent); }
    .connect-box {
      background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 1.5rem;
      margin: 2rem 0;
    }
    .connect-box h3 { margin-bottom: 1rem; }
    .connect-box pre {
      background: var(--bg);
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    footer {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      text-align: center;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { color: var(--accent-hover); }
  </style>
</head>
<body>
  <header>
    <h1>8004 MCP Server</h1>
    <p class="subtitle">Model Context Protocol server for exploring ERC-8004 AI agents</p>
    <div class="meta">
      <span class="meta-item">Version: <code>${SERVER_INFO.version}</code></span>
      <span class="meta-item">Protocol: <code>${DEFAULT_PROTOCOL_VERSION}</code></span>
      <span class="meta-item">Schema: <a href="/mcp/schema.json">/mcp/schema.json</a></span>
    </div>
  </header>

  <section>
    <h2>Endpoints</h2>
    <div class="endpoints">
      <div class="endpoint">
        <strong>JSON-RPC</strong>
        <p><code>POST /mcp</code></p>
      </div>
      <div class="endpoint">
        <strong>SSE Stream</strong>
        <p><code>GET /sse</code></p>
      </div>
      <div class="endpoint">
        <strong>Server Info</strong>
        <p><code>GET /mcp</code></p>
      </div>
      <div class="endpoint">
        <strong>JSON Schema</strong>
        <p><code>GET /mcp/schema.json</code></p>
      </div>
    </div>
  </section>

  <section class="connect-box">
    <h3>Connect with Claude Desktop</h3>
    <p style="color: var(--text-muted); margin-bottom: 1rem;">Add to your <code>claude_desktop_config.json</code>:</p>
    <pre><code>{
  "mcpServers": {
    "8004-agents": {
      "command": "npx",
      "args": ["mcp-remote", "https://api.8004.dev/sse"]
    }
  }
}</code></pre>
  </section>

  <section>
    <h2>Tools (${TOOLS.length})</h2>
    ${toolsHtml}
  </section>

  <section>
    <h2>Resources (${RESOURCES.length})</h2>
    ${resourcesHtml}
  </section>

  <section>
    <h2>Prompts (${PROMPTS.length})</h2>
    ${promptsHtml}
  </section>

  <footer>
    <p>Powered by <a href="https://8004.dev">8004.dev</a> &middot; <a href="https://modelcontextprotocol.io">Model Context Protocol</a></p>
  </footer>
</body>
</html>`;
}

/**
 * Common CORS headers for MCP responses
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
};

/**
 * Handle CORS preflight requests
 */
function handleCorsPreflightRequest(): Response {
  return new Response(null, {
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, Accept, Mcp-Session-Id, X-Request-Id',
      'Access-Control-Expose-Headers': 'MCP-Protocol-Version, Mcp-Session-Id',
    },
  });
}

/**
 * Handle DELETE requests for session termination
 */
function handleDeleteRequest(request: Request): Response {
  const sessionId = request.headers.get('Mcp-Session-Id');
  return new Response(null, {
    status: sessionId ? 200 : 400,
    headers: CORS_HEADERS,
  });
}

/**
 * Handle HEAD requests for protocol discovery
 */
function handleHeadRequest(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
      ...CORS_HEADERS,
      'Access-Control-Expose-Headers': 'MCP-Protocol-Version',
    },
  });
}

/**
 * Handle SSE endpoint requests
 */
function handleSseRequest(request: Request, url: URL): Response {
  const sessionId = request.headers.get('Mcp-Session-Id') || crypto.randomUUID();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const mcpEndpoint = `${url.protocol}//${url.host}/mcp?sessionId=${sessionId}`;
  writer.write(encoder.encode(`event: endpoint\ndata: ${mcpEndpoint}\n\n`));

  const keepAlive = setInterval(() => {
    writer.write(encoder.encode(': keepalive\n\n')).catch(() => {
      clearInterval(keepAlive);
    });
  }, 15000);

  request.signal.addEventListener('abort', () => {
    clearInterval(keepAlive);
    writer.close();
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      ...CORS_HEADERS,
      'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
      'Mcp-Session-Id': sessionId,
    },
  });
}

/**
 * Handle JSON Schema endpoint requests
 */
function handleSchemaRequest(): Response {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://api.8004.dev/mcp/schema.json',
    title: '8004 MCP Server Schema',
    description: 'JSON Schema for 8004.dev MCP server tools, resources, and prompts',
    version: SERVER_INFO.version,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    resources: RESOURCES.map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    })),
    prompts: PROMPTS.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    })),
  };

  return new Response(JSON.stringify(schema, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * Handle documentation HTML endpoint requests
 */
function handleDocsRequest(): Response {
  const html = generateDocsHtml();
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...CORS_HEADERS,
      'Cache-Control': 'public, max-age=300',
    },
  });
}

/**
 * Handle server info GET requests
 */
function handleServerInfoRequest(acceptHeader: string): Response {
  if (acceptHeader.includes('text/event-stream')) {
    return new Response(null, {
      status: 405,
      headers: {
        ...CORS_HEADERS,
        Allow: 'POST, HEAD, OPTIONS',
      },
    });
  }

  return new Response(
    JSON.stringify({
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      description: 'MCP server for exploring ERC-8004 AI agents',
      endpoints: {
        jsonRpc: '/mcp',
        sse: '/sse',
        docs: '/mcp/docs',
        schema: '/mcp/schema.json',
      },
      tools: TOOLS.map((t) => t.name),
      resources: RESOURCES.map((r) => r.uri),
      prompts: PROMPTS.map((p) => p.name),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    }
  );
}

/**
 * Create JSON-RPC error response
 */
function createJsonRpcErrorResponse(
  code: number,
  message: string,
  sessionId: string,
  status = 400
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
        'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
        'MCP-Protocol-Version': DEFAULT_PROTOCOL_VERSION,
        'Mcp-Session-Id': sessionId,
      },
    }
  );
}

/**
 * Create 401 Unauthorized response for OAuth
 */
function createUnauthorizedResponse(errorType?: string): Response {
  const wwwAuth = errorType
    ? `Bearer resource_metadata="https://api.8004.dev/.well-known/oauth-protected-resource",error="${errorType}"`
    : `Bearer resource_metadata="https://api.8004.dev/.well-known/oauth-protected-resource",scope="mcp:read mcp:write"`;

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': wwwAuth,
      ...CORS_HEADERS,
      'Access-Control-Expose-Headers': 'WWW-Authenticate',
    },
  });
}

/**
 * Handle POST requests (JSON-RPC endpoint)
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: OAuth validation and session management require multiple checks
async function handlePostRequest(
  request: Request,
  env: Env,
  sessionService: MCPSessionService
): Promise<Response> {
  const token = extractBearerToken(request);
  const sessionId = request.headers.get('Mcp-Session-Id') || crypto.randomUUID();

  let body: MCPRequest;
  try {
    body = (await request.json()) as MCPRequest;
  } catch {
    return createJsonRpcErrorResponse(-32700, 'Parse error', sessionId);
  }

  const isInitMethod = body.method === 'initialize' || body.method === 'notifications/initialized';
  const isProbeOrEmpty = !body.method;

  if (isProbeOrEmpty && !token) {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        'MCP-Protocol-Version': DEFAULT_PROTOCOL_VERSION,
      },
    });
  }

  // MCP is fully public - no token validation required
  // Tokens are accepted but not validated (OAuth flow optional)

  try {
    const result = await handleMCPRequest(body, env);

    if (result === null) {
      return new Response(null, {
        status: 202,
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
          'MCP-Protocol-Version': DEFAULT_PROTOCOL_VERSION,
          'Mcp-Session-Id': sessionId,
        },
      });
    }

    const { response, negotiatedVersion } = result;

    if (body.method === 'initialize' && !response.error) {
      const initParams = body.params as
        | { clientInfo?: { name: string; version: string } }
        | undefined;
      await sessionService.create({
        sessionId,
        protocolVersion: negotiatedVersion || DEFAULT_PROTOCOL_VERSION,
        clientInfo: initParams?.clientInfo,
        serverInfo: SERVER_INFO,
        initialized: true,
      });
    } else if (request.headers.get('Mcp-Session-Id')) {
      await sessionService.touch(sessionId);
    }

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
        'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
        'MCP-Protocol-Version': negotiatedVersion || DEFAULT_PROTOCOL_VERSION,
        'Mcp-Session-Id': sessionId,
      },
    });
  } catch {
    return createJsonRpcErrorResponse(-32700, 'Parse error', sessionId);
  }
}

/**
 * Create the MCP request handler for Cloudflare Workers
 * Supports both SSE streaming and JSON responses
 */
export function createMcp8004Handler(env: Env) {
  const sessionService = createMCPSessionService(env.CACHE);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: MCP routing requires handling multiple HTTP methods and paths
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest();
    }

    if (request.method === 'DELETE') {
      return handleDeleteRequest(request);
    }

    if (url.pathname.startsWith('/mcp/.well-known/')) {
      const wellKnownPath = url.pathname.replace('/mcp/.well-known/', '/.well-known/');
      const redirectUrl = new URL(wellKnownPath, url.origin);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    if (request.method === 'HEAD') {
      return handleHeadRequest();
    }

    if (url.pathname === '/sse' && request.method === 'GET') {
      return handleSseRequest(request, url);
    }

    if (request.method === 'POST') {
      return handlePostRequest(request, env, sessionService);
    }

    if (url.pathname === '/mcp/schema.json' && request.method === 'GET') {
      return handleSchemaRequest();
    }

    if (url.pathname === '/mcp/docs' && request.method === 'GET') {
      return handleDocsRequest();
    }

    if (request.method === 'GET') {
      return handleServerInfoRequest(request.headers.get('Accept') || '');
    }

    return new Response('Method not allowed', { status: 405 });
  };
}
