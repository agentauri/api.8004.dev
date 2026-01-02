/**
 * Graph to Qdrant Sync Worker
 *
 * Syncs agent data from The Graph subgraph to Qdrant.
 * Handles new agents, updates, and selective re-embedding.
 * Enriches agents with A2A AgentCard data (inputModes/outputModes).
 * Includes reachability status derived from feedback data.
 */

import { type EmbedFields, formatAgentText } from '@/lib/ai/formatting';
import type { D1Database } from '@cloudflare/workers-types';
import type { AgentPayload } from '../../lib/qdrant/types';
import { type A2AClient, type ExtractedIOModes, createA2AClient } from '../a2a-client';
import { generateEmbedding } from '../embedding';
import { type QdrantClient, createQdrantClient } from '../qdrant';
import {
  type AgentReachability,
  type ReachabilityService,
  createReachabilityService,
} from '../reachability';
import { type ContentFields, computeContentHash, computeEmbedHash } from './content-hash';

// Graph endpoints per chain (using gateway.thegraph.com with subgraph IDs)
const GRAPH_ENDPOINTS: Record<number, string> = {
  11155111:
    'https://gateway.thegraph.com/api/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT',
  84532:
    'https://gateway.thegraph.com/api/subgraphs/id/GjQEDgEKqoh5Yc8MUgxoQoRATEJdEiH7HbocfR1aFiHa',
  80002:
    'https://gateway.thegraph.com/api/subgraphs/id/2A1JB18r1mF2VNP4QBH4mmxd74kbHoM6xLXC8ABAKf7j',
};

interface GraphAgent {
  id: string;
  chainId: string;
  agentId: string;
  agentURI: string | null;
  operators: string[];
  createdAt: string;
  updatedAt: string;
  registrationFile: {
    name: string;
    description: string;
    image: string | null;
    active: boolean;
    mcpEndpoint: string | null;
    a2aEndpoint: string | null;
    x402support: boolean;
    ens: string | null;
    did: string | null;
    agentWallet: string | null;
    agentWalletChainId: string | null;
    mcpVersion: string | null;
    a2aVersion: string | null;
    supportedTrusts: string[] | null;
    mcpTools?: Array<{ name: string }>;
    mcpPrompts?: Array<{ name: string }>;
    mcpResources?: Array<{ name: string }>;
    a2aSkills?: Array<{ name: string }>;
    createdAt?: string;
  } | null;
}

export interface GraphSyncResult {
  newAgents: number;
  updatedAgents: number;
  reembedded: number;
  errors: string[];
}

interface AgentToSync {
  agent: GraphAgent;
  needsEmbed: boolean;
  ioModes?: ExtractedIOModes;
}

/**
 * Fetch all agents from a single chain's Graph endpoint
 */
async function fetchAgentsFromGraph(
  chainId: number,
  graphApiKey?: string,
  first = 1000,
  skip = 0
): Promise<GraphAgent[]> {
  const endpoint = GRAPH_ENDPOINTS[chainId];
  if (!endpoint) {
    throw new Error(`No Graph endpoint for chain ${chainId}`);
  }

  const query = `
    query GetAgents($first: Int!, $skip: Int!) {
      agents(first: $first, skip: $skip, orderBy: agentId, where: { registrationFile_not: null }) {
        id
        chainId
        agentId
        agentURI
        operators
        createdAt
        updatedAt
        registrationFile {
          name
          description
          image
          active
          mcpEndpoint
          a2aEndpoint
          x402support
          ens
          did
          agentWallet
          agentWalletChainId
          mcpVersion
          a2aVersion
          supportedTrusts
          mcpTools { name }
          mcpPrompts { name }
          mcpResources { name }
          a2aSkills { name }
          createdAt
        }
      }
    }
  `;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (graphApiKey) {
    headers.Authorization = `Bearer ${graphApiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: { first, skip } }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API error: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as {
    data?: { agents: GraphAgent[] };
    errors?: Array<{ message: string }>;
  };

  if (data.errors?.length) {
    throw new Error(`Graph query error: ${data.errors[0]?.message}`);
  }

  return data.data?.agents ?? [];
}

/**
 * Fetch all agents from all chains
 */
async function fetchAllAgentsFromGraph(graphApiKey?: string): Promise<GraphAgent[]> {
  const allAgents: GraphAgent[] = [];

  for (const chainId of Object.keys(GRAPH_ENDPOINTS)) {
    const chain = Number(chainId);
    let skip = 0;
    const first = 1000;

    while (true) {
      const batch = await fetchAgentsFromGraph(chain, graphApiKey, first, skip);
      if (batch.length === 0) break;

      allAgents.push(...batch);
      skip += first;

      // Safety limit
      if (skip > 10000) break;
    }
  }

  return allAgents;
}

/**
 * Convert Graph agent to Qdrant payload
 * @param agent - Graph agent data
 * @param ioModes - Optional IO modes from A2A AgentCard
 * @param reachability - Optional reachability status from feedback
 */
function agentToPayload(
  agent: GraphAgent,
  ioModes?: ExtractedIOModes,
  reachability?: AgentReachability
): AgentPayload {
  const reg = agent.registrationFile;
  if (!reg) {
    throw new Error(`Agent ${agent.id} has no registration file`);
  }

  // Parse agentWalletChainId from BigInt string to number
  let agentWalletChainId = 0;
  if (reg.agentWalletChainId) {
    const parsed = Number.parseInt(reg.agentWalletChainId, 10);
    if (!Number.isNaN(parsed)) {
      agentWalletChainId = parsed;
    }
  }

  return {
    agent_id: `${agent.chainId}:${agent.agentId}`,
    chain_id: Number(agent.chainId),
    token_id: agent.agentId,
    name: reg.name ?? '',
    description: reg.description ?? '',
    image: reg.image ?? '',
    active: reg.active ?? false,
    has_mcp: !!reg.mcpEndpoint,
    has_a2a: !!reg.a2aEndpoint,
    x402_support: reg.x402support ?? false,
    has_registration_file: true,
    ens: reg.ens ?? '',
    did: reg.did ?? '',
    wallet_address: reg.agentWallet ?? '',
    operators: agent.operators ?? [],
    mcp_tools: reg.mcpTools?.map((t) => t.name) ?? [],
    mcp_prompts: reg.mcpPrompts?.map((p) => p.name) ?? [],
    mcp_resources: reg.mcpResources?.map((r) => r.name) ?? [],
    a2a_skills: reg.a2aSkills?.map((s) => s.name) ?? [],
    skills: [], // Will be populated from D1
    domains: [], // Will be populated from D1
    reputation: 0, // Will be populated from D1
    input_modes: ioModes?.inputModes ?? [],
    output_modes: ioModes?.outputModes ?? [],
    created_at: reg.createdAt ?? new Date().toISOString(),
    is_reachable_a2a: reachability?.a2a ?? false,
    is_reachable_mcp: reachability?.mcp ?? false,
    // New fields from subgraph schema
    mcp_version: reg.mcpVersion ?? '',
    a2a_version: reg.a2aVersion ?? '',
    agent_wallet_chain_id: agentWalletChainId,
    supported_trusts: reg.supportedTrusts ?? [],
    agent_uri: agent.agentURI ?? '',
    updated_at: agent.updatedAt
      ? new Date(Number.parseInt(agent.updatedAt, 10) * 1000).toISOString()
      : '',
    trust_score: 0,
  };
}

/**
 * Get embed fields from Graph agent
 * @param agent - Graph agent data
 * @param ioModes - Optional IO modes from A2A AgentCard
 */
function getEmbedFields(agent: GraphAgent, ioModes?: ExtractedIOModes): EmbedFields {
  const reg = agent.registrationFile;
  return {
    name: reg?.name ?? '',
    description: reg?.description ?? '',
    mcpTools: reg?.mcpTools?.map((t) => t.name) ?? [],
    mcpPrompts: reg?.mcpPrompts?.map((p) => p.name) ?? [],
    mcpResources: reg?.mcpResources?.map((r) => r.name) ?? [],
    a2aSkills: reg?.a2aSkills?.map((s) => s.name) ?? [],
    inputModes: ioModes?.inputModes ?? [],
    outputModes: ioModes?.outputModes ?? [],
  };
}

/**
 * Get content fields from payload
 */
function getContentFields(payload: AgentPayload): ContentFields {
  return {
    agentId: payload.agent_id,
    name: payload.name,
    description: payload.description,
    active: payload.active,
    hasMcp: payload.has_mcp,
    hasA2a: payload.has_a2a,
    skills: payload.skills,
    domains: payload.domains,
    reputation: payload.reputation,
  };
}

/**
 * Fetch A2A IO modes for agents with A2A endpoints
 * @param agents - Agents to fetch IO modes for
 * @param a2aClient - A2A client instance
 * @returns Map of agentId to IO modes
 */
async function fetchA2AIOModes(
  agents: GraphAgent[],
  a2aClient: A2AClient
): Promise<Map<string, ExtractedIOModes>> {
  const ioModesMap = new Map<string, ExtractedIOModes>();

  // Filter agents with A2A endpoints
  const a2aAgents = agents.filter((a) => a.registrationFile?.a2aEndpoint);

  // Fetch in parallel with concurrency limit
  const BATCH_SIZE = 10;
  for (let i = 0; i < a2aAgents.length; i += BATCH_SIZE) {
    const batch = a2aAgents.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (agent) => {
        const agentId = `${agent.chainId}:${agent.agentId}`;
        const endpoint = agent.registrationFile?.a2aEndpoint;
        if (!endpoint) return null;

        const ioModes = await a2aClient.fetchIOModes(endpoint, agentId);
        if (ioModes.success) {
          return { agentId, ioModes };
        }
        return null;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        ioModesMap.set(result.value.agentId, result.value.ioModes);
      }
    }
  }

  return ioModesMap;
}

/**
 * Fetch reachability status for all agents
 * @param agents - Agents to fetch reachability for
 * @param reachabilityService - Reachability service instance
 * @returns Map of agentId to reachability status
 */
async function fetchReachabilityBatch(
  agents: GraphAgent[],
  reachabilityService: ReachabilityService
): Promise<Map<string, AgentReachability>> {
  const agentIds = agents.filter((a) => a.registrationFile).map((a) => `${a.chainId}:${a.agentId}`);

  return reachabilityService.getAgentReachabilitiesBatch(agentIds);
}

/**
 * Sync agents from Graph to Qdrant
 */
export async function syncFromGraph(
  db: D1Database,
  env: {
    QDRANT_URL: string;
    QDRANT_API_KEY: string;
    QDRANT_COLLECTION?: string;
    VENICE_API_KEY: string;
    GRAPH_API_KEY?: string;
  }
): Promise<GraphSyncResult> {
  const qdrant = createQdrantClient(env);
  const a2aClient = createA2AClient({ timeoutMs: 5000 });
  const reachabilityService = createReachabilityService(db);
  const result: GraphSyncResult = {
    newAgents: 0,
    updatedAgents: 0,
    reembedded: 0,
    errors: [],
  };

  // Fetch all agents from Graph
  const agents = await fetchAllAgentsFromGraph(env.GRAPH_API_KEY);
  console.info(`Graph sync: fetched ${agents.length} agents`);

  // Fetch A2A IO modes for agents with A2A endpoints
  console.info('Graph sync: fetching A2A AgentCards...');
  const ioModesMap = await fetchA2AIOModes(agents, a2aClient);
  console.info(`Graph sync: fetched ${ioModesMap.size} A2A AgentCards with IO modes`);

  // Fetch reachability status for all agents
  console.info('Graph sync: fetching reachability status...');
  const reachabilityMap = await fetchReachabilityBatch(agents, reachabilityService);
  console.info(`Graph sync: fetched reachability for ${reachabilityMap.size} agents`);

  // Process each agent
  const toSync: AgentToSync[] = [];

  for (const agent of agents) {
    if (!agent.registrationFile) continue;

    const agentId = `${agent.chainId}:${agent.agentId}`;
    const ioModes = ioModesMap.get(agentId);

    try {
      // Get existing sync metadata
      const existing = await db
        .prepare('SELECT content_hash, embed_hash FROM agent_sync_metadata WHERE agent_id = ?')
        .bind(agentId)
        .first<{ content_hash: string; embed_hash: string }>();

      const embedFields = getEmbedFields(agent, ioModes);
      const newEmbedHash = await computeEmbedHash(embedFields);

      // Get reachability for content hash calculation
      const reachability = reachabilityMap.get(agentId);
      const payload = agentToPayload(agent, ioModes, reachability);
      const contentFields = getContentFields(payload);
      const newContentHash = await computeContentHash(contentFields);

      if (!existing) {
        // New agent - needs full index with embedding
        toSync.push({ agent, needsEmbed: true, ioModes });
      } else if (existing.embed_hash !== newEmbedHash) {
        // Embedding fields changed - need to re-embed
        toSync.push({ agent, needsEmbed: true, ioModes });
      } else if (existing.content_hash !== newContentHash) {
        // Only metadata changed - update without re-embed
        toSync.push({ agent, needsEmbed: false, ioModes });
      }
      // else: no changes, skip
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Check ${agentId}: ${message}`);
    }
  }

  console.info(`Graph sync: ${toSync.length} agents to sync`);

  // Process agents that need syncing
  for (const { agent, needsEmbed, ioModes } of toSync) {
    const agentId = `${agent.chainId}:${agent.agentId}`;

    try {
      // Get reachability status for this agent
      const reachability = reachabilityMap.get(agentId);
      const payload = agentToPayload(agent, ioModes, reachability);
      const embedFields = getEmbedFields(agent, ioModes);
      const contentFields = getContentFields(payload);

      if (needsEmbed) {
        // Generate new embedding
        const text = formatAgentText(embedFields);
        const vector = await generateEmbedding(text, env.VENICE_API_KEY);

        // Upsert to Qdrant with new embedding
        await qdrant.upsertAgent(agentId, vector, payload);
        result.reembedded++;

        if (!(await agentExistsInQdrant(qdrant, agentId))) {
          result.newAgents++;
        } else {
          result.updatedAgents++;
        }
      } else {
        // Just update payload without re-embedding
        await qdrant.setPayloadByAgentId(agentId, payload);
        result.updatedAgents++;
      }

      // Update sync metadata
      const embedHash = await computeEmbedHash(embedFields);
      const contentHash = await computeContentHash(contentFields);

      await db
        .prepare(
          `INSERT INTO agent_sync_metadata (agent_id, content_hash, embed_hash, qdrant_synced_at, sync_status)
           VALUES (?, ?, ?, datetime('now'), 'synced')
           ON CONFLICT(agent_id) DO UPDATE SET
             content_hash = excluded.content_hash,
             embed_hash = excluded.embed_hash,
             qdrant_synced_at = excluded.qdrant_synced_at,
             sync_status = 'synced',
             needs_reembed = 0,
             updated_at = datetime('now')`
        )
        .bind(agentId, contentHash, embedHash)
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Sync ${agentId}: ${message}`);

      // Mark as error in sync metadata
      await db
        .prepare(
          `INSERT INTO agent_sync_metadata (agent_id, content_hash, sync_status, last_error)
           VALUES (?, '', 'error', ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             sync_status = 'error',
             last_error = excluded.last_error,
             updated_at = datetime('now')`
        )
        .bind(agentId, message)
        .run();
    }
  }

  // Update global sync state
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE qdrant_sync_state
       SET last_graph_sync = ?,
           agents_synced = agents_synced + ?,
           embeddings_generated = embeddings_generated + ?,
           updated_at = datetime('now')
       WHERE id = 'global'`
    )
    .bind(now, result.newAgents + result.updatedAgents, result.reembedded)
    .run();

  console.info(
    `Graph sync complete: ${result.newAgents} new, ${result.updatedAgents} updated, ${result.reembedded} reembedded`
  );

  return result;
}

/**
 * Check if agent exists in Qdrant
 */
async function agentExistsInQdrant(qdrant: QdrantClient, agentId: string): Promise<boolean> {
  const result = await qdrant.countWithFilter({
    must: [{ key: 'agent_id', match: { value: agentId } }],
  });
  return result > 0;
}

// formatAgentText is imported from @/lib/ai/formatting (single source of truth)
