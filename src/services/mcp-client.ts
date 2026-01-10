/**
 * MCP (Model Context Protocol) Client
 *
 * Fetches MCP capabilities from agent endpoints using JSON-RPC:
 * - tools/list: Available tools with descriptions and input schemas
 * - prompts/list: Available prompts with descriptions and arguments
 * - resources/list: Available resources with descriptions and MIME types
 *
 * @see https://modelcontextprotocol.io/specification
 * @module services/mcp-client
 */

import { fetchWithTimeout, validateUrlForSSRF } from '../lib/utils/fetch';

/**
 * MCP Tool with full details
 */
export interface McpToolDetailed {
  /** Tool name (identifier) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP Prompt argument
 */
export interface McpPromptArgument {
  /** Argument name */
  name: string;
  /** Argument description */
  description?: string;
  /** Whether this argument is required */
  required?: boolean;
}

/**
 * MCP Prompt with full details
 */
export interface McpPromptDetailed {
  /** Prompt name (identifier) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Prompt arguments */
  arguments?: McpPromptArgument[];
}

/**
 * MCP Resource with full details
 */
export interface McpResourceDetailed {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** MIME type of the resource content */
  mimeType?: string;
}

/**
 * Full MCP capabilities fetched from an endpoint
 */
export interface McpCapabilities {
  /** Available tools */
  tools: McpToolDetailed[];
  /** Available prompts */
  prompts: McpPromptDetailed[];
  /** Available resources */
  resources: McpResourceDetailed[];
  /** When capabilities were fetched (ISO timestamp) */
  fetchedAt: string;
  /** Error message if fetch partially or fully failed */
  error?: string;
}

/**
 * MCP Client configuration
 */
export interface McpClientConfig {
  /** Request timeout in ms per call (default: 5000) */
  timeoutMs?: number;
  /** User agent string */
  userAgent?: string;
}

/**
 * Default timeout for MCP fetches (5 seconds)
 */
const DEFAULT_MCP_TIMEOUT_MS = 5_000;

/**
 * JSON-RPC 2.0 request structure
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response structure
 */
interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP tools/list response
 */
interface ToolsListResult {
  tools?: Array<{
    name?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

/**
 * MCP prompts/list response
 */
interface PromptsListResult {
  prompts?: Array<{
    name?: string;
    description?: string;
    arguments?: Array<{
      name?: string;
      description?: string;
      required?: boolean;
    }>;
  }>;
}

/**
 * MCP resources/list response
 */
interface ResourcesListResult {
  resources?: Array<{
    uri?: string;
    name?: string;
    description?: string;
    mimeType?: string;
  }>;
}

/**
 * Validate MCP endpoint URL
 * Uses shared SSRF protection, adds MCP-specific validation
 */
function isValidMcpEndpoint(url: string): boolean {
  try {
    validateUrlForSSRF(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize MCP endpoint URL
 * Ensures URL is properly formatted for JSON-RPC requests
 */
function normalizeMcpEndpoint(endpoint: string): string | null {
  if (!endpoint) return null;

  // Remove trailing slash
  let normalized = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;

  // Ensure HTTPS
  if (!normalized.startsWith('https://')) {
    if (normalized.startsWith('http://')) {
      // Upgrade to HTTPS
      normalized = normalized.replace('http://', 'https://');
    } else {
      normalized = `https://${normalized}`;
    }
  }

  if (!isValidMcpEndpoint(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Make a JSON-RPC 2.0 call to an MCP endpoint
 */
async function jsonRpcCall<T>(
  endpoint: string,
  method: string,
  timeoutMs: number,
  userAgent: string
): Promise<T | null> {
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params: {},
  };

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': userAgent,
        },
        body: JSON.stringify(request),
      },
      timeoutMs
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as JsonRpcResponse<T>;

    if (data.error) {
      console.warn(`MCP RPC error for ${method}: ${data.error.message}`);
      return null;
    }

    return data.result ?? null;
  } catch (error) {
    console.warn(
      `MCP RPC call failed for ${method}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Parse tools from MCP response
 */
function parseTools(result: ToolsListResult | null): McpToolDetailed[] {
  if (!result?.tools || !Array.isArray(result.tools)) {
    return [];
  }

  return result.tools
    .filter((t) => t && typeof t === 'object' && typeof t.name === 'string' && t.name)
    .map((t) => ({
      name: t.name as string,
      description: typeof t.description === 'string' ? t.description : undefined,
      inputSchema:
        t.inputSchema && typeof t.inputSchema === 'object'
          ? (t.inputSchema as Record<string, unknown>)
          : undefined,
    }));
}

/**
 * Parse prompts from MCP response
 */
function parsePrompts(result: PromptsListResult | null): McpPromptDetailed[] {
  if (!result?.prompts || !Array.isArray(result.prompts)) {
    return [];
  }

  return result.prompts
    .filter((p) => p && typeof p === 'object' && typeof p.name === 'string' && p.name)
    .map((p) => ({
      name: p.name as string,
      description: typeof p.description === 'string' ? p.description : undefined,
      arguments: Array.isArray(p.arguments)
        ? p.arguments
            .filter((a) => a && typeof a === 'object' && typeof a.name === 'string')
            .map((a) => ({
              name: a.name as string,
              description: typeof a.description === 'string' ? a.description : undefined,
              required: typeof a.required === 'boolean' ? a.required : undefined,
            }))
        : undefined,
    }));
}

/**
 * Parse resources from MCP response
 */
function parseResources(result: ResourcesListResult | null): McpResourceDetailed[] {
  if (!result?.resources || !Array.isArray(result.resources)) {
    return [];
  }

  return result.resources
    .filter(
      (r) =>
        r &&
        typeof r === 'object' &&
        typeof r.uri === 'string' &&
        r.uri &&
        typeof r.name === 'string' &&
        r.name
    )
    .map((r) => ({
      uri: r.uri as string,
      name: r.name as string,
      description: typeof r.description === 'string' ? r.description : undefined,
      mimeType: typeof r.mimeType === 'string' ? r.mimeType : undefined,
    }));
}

/**
 * MCP Client interface
 */
export interface McpClient {
  /**
   * Fetch full MCP capabilities from an endpoint
   * @param mcpEndpoint - The MCP endpoint URL
   * @param agentId - Agent ID for logging
   * @returns MCP capabilities or partial result on failure
   */
  fetchCapabilities(mcpEndpoint: string, agentId: string): Promise<McpCapabilities>;

  /**
   * Fetch only tool names (quick check)
   * @param mcpEndpoint - The MCP endpoint URL
   * @returns Array of tool names
   */
  fetchToolNames(mcpEndpoint: string): Promise<string[]>;
}

/**
 * Create MCP client instance
 */
export function createMcpClient(config: McpClientConfig = {}): McpClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
  const userAgent = config.userAgent ?? '8004-backend/1.0';

  return {
    async fetchCapabilities(mcpEndpoint: string, agentId: string): Promise<McpCapabilities> {
      const emptyResult: McpCapabilities = {
        tools: [],
        prompts: [],
        resources: [],
        fetchedAt: new Date().toISOString(),
      };

      if (!mcpEndpoint) {
        return { ...emptyResult, error: 'No MCP endpoint provided' };
      }

      const endpoint = normalizeMcpEndpoint(mcpEndpoint);
      if (!endpoint) {
        return { ...emptyResult, error: 'Invalid or blocked MCP endpoint' };
      }

      const errors: string[] = [];

      // Fetch all three lists in parallel
      const [toolsResult, promptsResult, resourcesResult] = await Promise.all([
        jsonRpcCall<ToolsListResult>(endpoint, 'tools/list', timeoutMs, userAgent).catch((e) => {
          errors.push(`tools: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        }),
        jsonRpcCall<PromptsListResult>(endpoint, 'prompts/list', timeoutMs, userAgent).catch(
          (e) => {
            errors.push(`prompts: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }
        ),
        jsonRpcCall<ResourcesListResult>(endpoint, 'resources/list', timeoutMs, userAgent).catch(
          (e) => {
            errors.push(`resources: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }
        ),
      ]);

      const tools = parseTools(toolsResult);
      const prompts = parsePrompts(promptsResult);
      const resources = parseResources(resourcesResult);

      const result: McpCapabilities = {
        tools,
        prompts,
        resources,
        fetchedAt: new Date().toISOString(),
      };

      // Add error if all fetches failed
      if (tools.length === 0 && prompts.length === 0 && resources.length === 0) {
        if (errors.length > 0) {
          result.error = `All fetches failed: ${errors.join('; ')}`;
        } else {
          result.error = 'No capabilities returned from endpoint';
        }
      } else if (errors.length > 0) {
        // Partial success
        result.error = `Partial fetch: ${errors.join('; ')}`;
      }

      return result;
    },

    async fetchToolNames(mcpEndpoint: string): Promise<string[]> {
      const endpoint = normalizeMcpEndpoint(mcpEndpoint);
      if (!endpoint) return [];

      const result = await jsonRpcCall<ToolsListResult>(endpoint, 'tools/list', timeoutMs, userAgent);
      return parseTools(result).map((t) => t.name);
    },
  };
}

/**
 * Batch fetch MCP capabilities for multiple agents
 * @param agents - Array of {agentId, mcpEndpoint} objects
 * @param config - MCP client config
 * @param concurrency - Max concurrent fetches (default: 10)
 * @returns Map of agentId to McpCapabilities
 */
export async function batchFetchMcpCapabilities(
  agents: Array<{ agentId: string; mcpEndpoint: string }>,
  config: McpClientConfig = {},
  concurrency = 10
): Promise<Map<string, McpCapabilities>> {
  const client = createMcpClient(config);
  const results = new Map<string, McpCapabilities>();

  // Process in batches
  for (let i = 0; i < agents.length; i += concurrency) {
    const batch = agents.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async ({ agentId, mcpEndpoint }) => {
        const capabilities = await client.fetchCapabilities(mcpEndpoint, agentId);
        return { agentId, capabilities };
      })
    );

    for (const { agentId, capabilities } of batchResults) {
      results.set(agentId, capabilities);
    }
  }

  return results;
}
