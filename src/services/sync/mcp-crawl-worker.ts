/**
 * MCP Capabilities Crawl Worker
 *
 * Crawls MCP endpoints to fetch detailed tool/prompt/resource information.
 * Runs on a separate schedule from Graph sync to avoid subrequest budget issues.
 *
 * Features:
 * - Fetches full MCP capabilities (tools, prompts, resources with descriptions)
 * - Updates Qdrant payloads without re-embedding
 * - Batch processing with configurable concurrency
 * - Graceful error handling (keeps previous data on failure)
 *
 * @module services/sync/mcp-crawl-worker
 */

import type {
  AgentPayload,
  McpPromptPayload,
  McpResourcePayload,
  McpToolPayload,
  QdrantFilter,
} from '../../lib/qdrant/types';
import {
  type McpCapabilities,
  type McpClientConfig,
  createMcpClient,
} from '../mcp-client';
import { type QdrantClient, createQdrantClient } from '../qdrant';

/**
 * Environment bindings required for MCP crawl worker
 */
export interface McpCrawlEnv {
  QDRANT_URL: string;
  QDRANT_API_KEY: string;
  QDRANT_COLLECTION?: string;
}

/**
 * Result of MCP crawl operation
 */
export interface McpCrawlResult {
  /** Number of agents with MCP endpoint found */
  agentsWithMcp: number;
  /** Number of agents successfully crawled */
  crawledSuccessfully: number;
  /** Number of agents with fetch errors */
  crawlErrors: number;
  /** Number of agents updated in Qdrant */
  updated: number;
  /** Error messages */
  errors: string[];
}

/**
 * Configuration for MCP crawl worker
 */
export interface McpCrawlConfig {
  /** Maximum agents to process per run (default: 50) */
  maxAgents?: number;
  /** Concurrent fetch limit (default: 10) */
  concurrency?: number;
  /** How old capabilities must be before re-crawl in hours (default: 24) */
  staleHours?: number;
  /** MCP client timeout in ms (default: 5000) */
  timeoutMs?: number;
}

/** Default configuration */
const DEFAULT_CONFIG: Required<McpCrawlConfig> = {
  maxAgents: 50,
  concurrency: 10,
  staleHours: 24,
  timeoutMs: 5000,
};

/**
 * Convert MCP client types to Qdrant payload types
 */
function toPayloadTypes(capabilities: McpCapabilities): {
  tools: McpToolPayload[];
  prompts: McpPromptPayload[];
  resources: McpResourcePayload[];
} {
  return {
    tools: capabilities.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    prompts: capabilities.prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments?.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required,
      })),
    })),
    resources: capabilities.resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  };
}

/**
 * Check if capabilities are stale and need re-fetching
 */
function isStale(fetchedAt: string | undefined, staleHours: number): boolean {
  if (!fetchedAt) return true;

  try {
    const fetchedTime = new Date(fetchedAt).getTime();
    const now = Date.now();
    const staleMs = staleHours * 60 * 60 * 1000;
    return now - fetchedTime > staleMs;
  } catch {
    return true;
  }
}

/**
 * Fetch agents with MCP endpoints that need capability crawling
 */
async function getAgentsToCrawl(
  qdrant: QdrantClient,
  maxAgents: number,
  staleHours: number
): Promise<Array<{ agentId: string; mcpEndpoint: string }>> {
  const agents: Array<{ agentId: string; mcpEndpoint: string }> = [];
  let cursor: string | undefined;

  // Filter: has_mcp = true
  const filter: QdrantFilter = {
    must: [{ key: 'has_mcp', match: { value: true } }],
  };

  // Fetch agents with MCP endpoints
  while (agents.length < maxAgents) {
    const result = await qdrant.scroll({
      limit: 100,
      cursor,
      qdrantFilter: filter,
    });

    for (const item of result.items) {
      const payload = item.payload as AgentPayload;

      // Skip if no MCP endpoint URL
      if (!payload.mcp_endpoint) continue;

      // Check if capabilities are stale
      if (!isStale(payload.mcp_capabilities_fetched_at, staleHours)) {
        continue;
      }

      agents.push({
        agentId: payload.agent_id,
        mcpEndpoint: payload.mcp_endpoint,
      });

      if (agents.length >= maxAgents) break;
    }

    cursor = result.nextCursor;
    if (!result.hasMore) break;
  }

  return agents;
}

/**
 * Run MCP capabilities crawl
 *
 * @param env - Environment bindings
 * @param config - Crawl configuration
 * @returns Crawl result with statistics
 */
export async function crawlMcpCapabilities(
  env: McpCrawlEnv,
  config: McpCrawlConfig = {}
): Promise<McpCrawlResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const result: McpCrawlResult = {
    agentsWithMcp: 0,
    crawledSuccessfully: 0,
    crawlErrors: 0,
    updated: 0,
    errors: [],
  };

  // Create clients
  const qdrant = createQdrantClient({
    QDRANT_URL: env.QDRANT_URL,
    QDRANT_API_KEY: env.QDRANT_API_KEY,
    QDRANT_COLLECTION: env.QDRANT_COLLECTION ?? 'agents',
  });

  const mcpClientConfig: McpClientConfig = {
    timeoutMs: cfg.timeoutMs,
  };
  const mcpClient = createMcpClient(mcpClientConfig);

  // Get agents to crawl
  const agentsToCrawl = await getAgentsToCrawl(qdrant, cfg.maxAgents, cfg.staleHours);
  result.agentsWithMcp = agentsToCrawl.length;

  if (agentsToCrawl.length === 0) {
    console.info('MCP crawl: No agents with stale MCP capabilities found');
    return result;
  }

  console.info(`MCP crawl: Processing ${agentsToCrawl.length} agents...`);

  // Process in batches for concurrency control
  for (let i = 0; i < agentsToCrawl.length; i += cfg.concurrency) {
    const batch = agentsToCrawl.slice(i, i + cfg.concurrency);

    const batchResults = await Promise.all(
      batch.map(async ({ agentId, mcpEndpoint }) => {
        try {
          const capabilities = await mcpClient.fetchCapabilities(mcpEndpoint, agentId);

          if (capabilities.error && capabilities.tools.length === 0) {
            // Complete failure
            return { agentId, success: false, error: capabilities.error };
          }

          // Convert to payload types
          const payloadTypes = toPayloadTypes(capabilities);

          // Update Qdrant payload (partial update, no re-embedding)
          await qdrant.setPayloadByAgentId(agentId, {
            mcp_tools_detailed: payloadTypes.tools,
            mcp_prompts_detailed: payloadTypes.prompts,
            mcp_resources_detailed: payloadTypes.resources,
            mcp_capabilities_fetched_at: capabilities.fetchedAt,
            mcp_capabilities_error: capabilities.error,
          });

          return { agentId, success: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return { agentId, success: false, error: errorMsg };
        }
      })
    );

    // Aggregate results
    for (const r of batchResults) {
      if (r.success) {
        result.crawledSuccessfully++;
        result.updated++;
      } else {
        result.crawlErrors++;
        if (r.error) {
          result.errors.push(`${r.agentId}: ${r.error}`);
        }
      }
    }
  }

  console.info(
    `MCP crawl complete: ${result.crawledSuccessfully} crawled, ${result.crawlErrors} errors`
  );

  return result;
}

/**
 * Alternative: Crawl MCP capabilities for agents with known endpoints
 * This version takes explicit agent/endpoint pairs
 */
export async function crawlMcpCapabilitiesForAgents(
  env: McpCrawlEnv,
  agents: Array<{ agentId: string; mcpEndpoint: string }>,
  config: McpCrawlConfig = {}
): Promise<McpCrawlResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const result: McpCrawlResult = {
    agentsWithMcp: agents.length,
    crawledSuccessfully: 0,
    crawlErrors: 0,
    updated: 0,
    errors: [],
  };

  if (agents.length === 0) {
    return result;
  }

  const qdrant = createQdrantClient({
    QDRANT_URL: env.QDRANT_URL,
    QDRANT_API_KEY: env.QDRANT_API_KEY,
    QDRANT_COLLECTION: env.QDRANT_COLLECTION ?? 'agents',
  });

  const mcpClient = createMcpClient({ timeoutMs: cfg.timeoutMs });

  console.info(`MCP crawl: Processing ${agents.length} agents with known endpoints...`);

  // Process in batches
  for (let i = 0; i < agents.length; i += cfg.concurrency) {
    const batch = agents.slice(i, i + cfg.concurrency);

    const batchResults = await Promise.all(
      batch.map(async ({ agentId, mcpEndpoint }) => {
        try {
          const capabilities = await mcpClient.fetchCapabilities(mcpEndpoint, agentId);

          // Even on partial failure, update what we got
          const payloadTypes = toPayloadTypes(capabilities);

          await qdrant.setPayloadByAgentId(agentId, {
            mcp_tools_detailed: payloadTypes.tools,
            mcp_prompts_detailed: payloadTypes.prompts,
            mcp_resources_detailed: payloadTypes.resources,
            mcp_capabilities_fetched_at: capabilities.fetchedAt,
            mcp_capabilities_error: capabilities.error,
          });

          return {
            agentId,
            success: !capabilities.error || capabilities.tools.length > 0,
            error: capabilities.error,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return { agentId, success: false, error: errorMsg };
        }
      })
    );

    for (const r of batchResults) {
      if (r.success) {
        result.crawledSuccessfully++;
        result.updated++;
      } else {
        result.crawlErrors++;
        if (r.error) {
          result.errors.push(`${r.agentId}: ${r.error}`);
        }
      }
    }
  }

  console.info(
    `MCP crawl complete: ${result.crawledSuccessfully} crawled, ${result.crawlErrors} errors`
  );

  return result;
}
