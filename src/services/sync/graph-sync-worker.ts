/**
 * Graph to Qdrant Sync Worker
 *
 * Syncs agent data from The Graph subgraph to Qdrant.
 * Handles new agents, updates, and selective re-embedding.
 * Enriches agents with A2A AgentCard data (inputModes/outputModes).
 * Includes reachability status derived from feedback data.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { type EmbedFields, formatAgentText } from '@/lib/ai/formatting';
import { createWorkerLogger } from '@/lib/logger/worker-logger';
import type { AgentPayload } from '../../lib/qdrant/types';
import {
  buildAgentPayload,
  type PayloadBuilderInput,
  type PayloadEnrichment,
} from '../../lib/qdrant/payload-builder';
import { type A2AClient, createA2AClient, type ExtractedIOModes } from '../a2a-client';
import { generateEmbedding } from '../embedding';
import { createQdrantClient, type QdrantClient } from '../qdrant';
import { type AgentReachability, createReachabilityService } from '../reachability';
import { type ContentFields, computeContentHash, computeEmbedHash } from './content-hash';

// ERC-8004 spec version types
type ERC8004Version = 'v0.4' | 'v1.0';

import { buildSubgraphUrls, DEFAULT_GRAPH_API_KEY, SUBGRAPH_IDS } from '@/lib/config/graph';

// Build URLs once at module load using the default public API key
const ALL_SUBGRAPH_URLS = buildSubgraphUrls(DEFAULT_GRAPH_API_KEY);

// Graph endpoints for v1.0 (Jan 2026 update - new contracts)
// Only ETH Sepolia has v1.0 contracts deployed currently
// Other chains are pending contract deployment
const GRAPH_ENDPOINTS_V1_0: Record<number, string> = Object.fromEntries(
  Object.entries(ALL_SUBGRAPH_URLS).filter(([chainId]) => chainId === '11155111')
);

// Graph endpoints for v0.4 (pre-v1.0 - backward compatibility)
// NOTE: These subgraphs no longer exist after the v1.0 spec update
// Contracts for these chains are pending deployment
// Keep empty for now - will be populated when chains deploy v1.0 contracts
const GRAPH_ENDPOINTS_V0_4: Record<number, string> = {
  // Chains pending v1.0 contract deployment will be added here
};

// Combined endpoints (used by fetchAllAgentsFromGraph)
const GRAPH_ENDPOINTS: Record<number, string> = {
  ...GRAPH_ENDPOINTS_V1_0,
  ...GRAPH_ENDPOINTS_V0_4,
};

/**
 * Graph agent structure for v1.0 (current spec)
 * In v1.0, agentWallet is on the Agent entity (set via setAgentWallet with EIP-712)
 */
interface GraphAgentV1_0 {
  id: string;
  chainId: string;
  agentId: string;
  agentURI: string | null;
  owner: string;
  operators: string[];
  createdAt: string;
  updatedAt: string;
  /** On-chain agent wallet set via setAgentWallet() with EIP-712 signature (v1.0) */
  agentWallet: string | null;
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
    mcpVersion: string | null;
    a2aVersion: string | null;
    supportedTrusts: string[] | null;
    mcpTools?: Array<{ name: string }>;
    mcpPrompts?: Array<{ name: string }>;
    mcpResources?: Array<{ name: string }>;
    a2aSkills?: Array<{ name: string }>;
    createdAt?: string;
    // Gap 4: Declared OASF fields (v1.0)
    oasfSkills?: string[];
    oasfDomains?: string[];
    // Gap 5: New endpoint fields (v1.0)
    emailEndpoint?: string | null;
    oasfEndpoint?: string | null;
    oasfVersion?: string | null;
  } | null;
}

/**
 * Graph agent structure for v0.4 (pre-v1.0 backward compatibility)
 * In v0.4, agentWallet is inside registrationFile (off-chain)
 */
interface GraphAgentV0_4 {
  id: string;
  chainId: string;
  agentId: string;
  agentURI: string | null;
  owner: string;
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
    /** Off-chain agent wallet (v0.4 only - inside registrationFile) */
    agentWallet: string | null;
    /** Chain ID for agent wallet (v0.4 only) */
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

/** Union type for agents from any version */
type GraphAgent = GraphAgentV1_0 | GraphAgentV0_4;

/** Type guard to check if agent has v1.0 structure */
function isV1_0Agent(agent: GraphAgent): agent is GraphAgentV1_0 {
  return 'agentWallet' in agent && agent.agentWallet !== undefined;
}

export interface GraphSyncResult {
  newAgents: number;
  updatedAgents: number;
  reembedded: number;
  errors: string[];
  /** Number of agents skipped (already synced) */
  skipped?: number;
  /** Whether there are more agents to sync in the next run */
  hasMore?: boolean;
}

/**
 * Maximum agents to process per sync invocation
 * Keeps us well under Cloudflare's 1000 subrequest limit:
 * - ~10 Graph API requests
 * - ~100 A2A card fetches (for agents with A2A)
 * - ~100 embedding requests
 * - ~100 Qdrant upserts
 * Total: ~310 subrequests max
 */
const MAX_AGENTS_PER_SYNC = 100;

interface AgentToSync {
  agent: GraphAgent;
  version: ERC8004Version;
  needsEmbed: boolean;
  ioModes?: ExtractedIOModes;
}

/**
 * Build GraphQL query for v1.0 agents
 * In v1.0, agentWallet is on the Agent entity (set via setAgentWallet with EIP-712)
 */
function buildAgentQueryV1_0(): string {
  return `
    query GetAgents($first: Int!, $skip: Int!) {
      agents(first: $first, skip: $skip, orderBy: agentId) {
        id
        chainId
        agentId
        agentURI
        agentWallet
        owner
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
          mcpVersion
          a2aVersion
          supportedTrusts
          mcpTools { name }
          mcpPrompts { name }
          mcpResources { name }
          a2aSkills { name }
          createdAt
          oasfSkills
          oasfDomains
          emailEndpoint
          oasfEndpoint
          oasfVersion
        }
      }
    }
  `;
}

/**
 * Build GraphQL query for v0.4 agents (pre-v1.0 backward compatibility)
 * In v0.4, agentWallet is inside registrationFile (off-chain)
 */
function buildAgentQueryV0_4(): string {
  return `
    query GetAgents($first: Int!, $skip: Int!) {
      agents(first: $first, skip: $skip, orderBy: agentId) {
        id
        chainId
        agentId
        agentURI
        owner
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
}

/**
 * Determine which ERC-8004 version a chain uses
 */
function getChainVersion(chainId: number): ERC8004Version {
  if (chainId in GRAPH_ENDPOINTS_V1_0) {
    return 'v1.0';
  }
  if (chainId in GRAPH_ENDPOINTS_V0_4) {
    return 'v0.4';
  }
  // Default to v1.0 for unknown chains
  return 'v1.0';
}

/**
 * Fetch all agents from a single chain's Graph endpoint
 */
async function fetchAgentsFromGraph(
  chainId: number,
  graphApiKey?: string,
  first = 1000,
  skip = 0
): Promise<{ agents: GraphAgent[]; version: ERC8004Version }> {
  const endpoint = GRAPH_ENDPOINTS[chainId];
  if (!endpoint) {
    throw new Error(`No Graph endpoint for chain ${chainId}`);
  }

  const version = getChainVersion(chainId);
  const query = version === 'v1.0' ? buildAgentQueryV1_0() : buildAgentQueryV0_4();

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

  return { agents: data.data?.agents ?? [], version };
}

/** Agent with version metadata */
interface AgentWithVersion {
  agent: GraphAgent;
  version: ERC8004Version;
}

/**
 * Fetch all agents from all chains with version tracking
 */
async function fetchAllAgentsFromGraph(
  graphApiKey?: string
): Promise<AgentWithVersion[]> {
  const allAgents: AgentWithVersion[] = [];

  for (const chainId of Object.keys(GRAPH_ENDPOINTS)) {
    const chain = Number(chainId);
    let skip = 0;
    const first = 1000;

    while (true) {
      const { agents: batch, version } = await fetchAgentsFromGraph(chain, graphApiKey, first, skip);
      if (batch.length === 0) break;

      // Add version metadata to each agent
      for (const agent of batch) {
        allAgents.push({ agent, version });
      }
      skip += first;

      // Safety limit
      if (skip > 10000) break;
    }
  }

  return allAgents;
}

/**
 * Convert Graph agent to Qdrant payload
 * Uses centralized payload builder for consistent payload structure
 *
 * @param agent - Graph agent data
 * @param version - ERC-8004 spec version
 * @param ioModes - Optional IO modes from A2A AgentCard
 * @param reachability - Optional reachability status from feedback
 */
function agentToPayload(
  agent: GraphAgent,
  version: ERC8004Version,
  ioModes?: ExtractedIOModes,
  reachability?: AgentReachability
): AgentPayload {
  const reg = agent.registrationFile;
  const hasReg = !!reg;

  // Handle agentWallet differently based on version:
  // - v1.0: agentWallet is on Agent entity (on-chain verified)
  // - v0.4: agentWallet is in registrationFile (off-chain)
  let walletAddress = '';
  let agentWalletChainId = 0;

  if (version === 'v1.0' && isV1_0Agent(agent)) {
    // v1.0: agentWallet is on the agent entity
    walletAddress = agent.agentWallet ?? '';
  } else if (version === 'v0.4' && reg) {
    // v0.4: agentWallet is inside registrationFile
    const regV04 = reg as GraphAgentV0_4['registrationFile'];
    walletAddress = regV04?.agentWallet ?? '';
    agentWalletChainId = regV04?.agentWalletChainId
      ? Number.parseInt(regV04.agentWalletChainId, 10)
      : 0;
  }

  // Extract v1.0 specific fields if available
  const regV1 = version === 'v1.0' && reg ? (reg as GraphAgentV1_0['registrationFile']) : null;

  // Build input from Graph agent
  const input: PayloadBuilderInput = {
    agentId: `${agent.chainId}:${agent.agentId}`,
    chainId: Number(agent.chainId),
    tokenId: agent.agentId,
    name: reg?.name ?? (hasReg ? '' : `Agent #${agent.agentId}`),
    description: reg?.description ?? '',
    image: reg?.image ?? undefined,
    active: reg?.active ?? false,
    mcpEndpoint: reg?.mcpEndpoint ?? undefined,
    a2aEndpoint: reg?.a2aEndpoint ?? undefined,
    x402Support: reg?.x402support ?? false,
    hasRegistrationFile: hasReg,
    ens: reg?.ens ?? undefined,
    did: reg?.did ?? undefined,
    walletAddress,
    owner: agent.owner ?? '',
    operators: agent.operators ?? [],
    mcpTools: reg?.mcpTools?.map((t) => t.name),
    mcpPrompts: reg?.mcpPrompts?.map((p) => p.name),
    mcpResources: reg?.mcpResources?.map((r) => r.name),
    a2aSkills: reg?.a2aSkills?.map((s) => s.name),
    createdAt: reg?.createdAt,
    mcpVersion: reg?.mcpVersion ?? undefined,
    a2aVersion: reg?.a2aVersion ?? undefined,
    supportedTrusts: reg?.supportedTrusts ?? undefined,
    agentUri: agent.agentURI ?? undefined,
    updatedAt: agent.updatedAt
      ? new Date(Number.parseInt(agent.updatedAt, 10) * 1000).toISOString()
      : undefined,
    agentWalletChainId,
    erc8004Version: version,
    // Gap 4: Declared OASF fields (v1.0 only)
    oasfSkills: regV1?.oasfSkills ?? undefined,
    oasfDomains: regV1?.oasfDomains ?? undefined,
    // Gap 5: New endpoint fields (v1.0 only)
    emailEndpoint: regV1?.emailEndpoint ?? undefined,
    oasfEndpoint: regV1?.oasfEndpoint ?? undefined,
    oasfVersion: regV1?.oasfVersion ?? undefined,
  };

  // Build enrichment from IO modes and reachability
  const enrichment: PayloadEnrichment = {
    inputModes: ioModes?.inputModes,
    outputModes: ioModes?.outputModes,
    isReachableA2a: reachability?.a2a,
    isReachableMcp: reachability?.mcp,
    // skills, domains, reputation, trustScore will be populated from D1 sync
  };

  return buildAgentPayload(input, enrichment);
}

/**
 * Get embed fields from Graph agent
 * @param agent - Graph agent data
 * @param ioModes - Optional IO modes from A2A AgentCard
 */
function getEmbedFields(agent: GraphAgent, ioModes?: ExtractedIOModes): EmbedFields {
  const reg = agent.registrationFile;
  // Use placeholder name if name is missing/null/empty - ensures we always have text for embedding
  const name = reg?.name || `Agent #${agent.agentId}`;
  return {
    name,
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
    owner: payload.owner,
    hasRegistrationFile: payload.has_registration_file,
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
 * Sync agents from Graph to Qdrant
 * Processes agents incrementally to stay under Cloudflare's subrequest limit
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
  const logger = createWorkerLogger('graph-sync');
  const qdrant = createQdrantClient(env);
  const a2aClient = createA2AClient({ timeoutMs: 5000 });
  const reachabilityService = createReachabilityService(db);
  const result: GraphSyncResult = {
    newAgents: 0,
    updatedAgents: 0,
    reembedded: 0,
    errors: [],
    skipped: 0,
    hasMore: false,
  };

  logger.start('Fetching agents from Graph');

  // Fetch all agents from Graph (including those without registrationFile)
  const agentsWithVersions = await fetchAllAgentsFromGraph(env.GRAPH_API_KEY);
  const agentsWithReg = agentsWithVersions.filter((a) => a.agent.registrationFile);
  const agentsWithoutReg = agentsWithVersions.length - agentsWithReg.length;

  // Count agents by version
  const v1Count = agentsWithVersions.filter((a) => a.version === 'v1.0').length;
  const v04Count = agentsWithVersions.filter((a) => a.version === 'v0.4').length;
  logger.progress('Fetched agents from Graph', {
    total: agentsWithVersions.length,
    withRegistration: agentsWithReg.length,
    withoutRegistration: agentsWithoutReg,
    v1Count,
    v04Count,
  });

  // Get existing sync metadata for all agents (to identify which need syncing)
  const agentIds = agentsWithVersions.map((a) => `${a.agent.chainId}:${a.agent.agentId}`);

  // Query existing metadata in batches
  const existingMetadata = new Map<string, { content_hash: string; embed_hash: string }>();
  const BATCH_SIZE = 95;
  for (let i = 0; i < agentIds.length; i += BATCH_SIZE) {
    const batch = agentIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const rows = await db
      .prepare(
        `SELECT agent_id, content_hash, embed_hash FROM agent_sync_metadata WHERE agent_id IN (${placeholders})`
      )
      .bind(...batch)
      .all<{ agent_id: string; content_hash: string; embed_hash: string }>();
    for (const row of rows.results ?? []) {
      existingMetadata.set(row.agent_id, {
        content_hash: row.content_hash,
        embed_hash: row.embed_hash,
      });
    }
  }
  logger.progress('Found existing sync metadata', { existingSynced: existingMetadata.size });

  // Identify agents that need syncing (new or changed)
  // Process ALL agents (with or without registrationFile)
  const toSync: AgentToSync[] = [];
  let skipped = 0;
  let contentChanged = 0;

  for (const { agent, version } of agentsWithVersions) {
    if (toSync.length >= MAX_AGENTS_PER_SYNC) {
      result.hasMore = true;
      break;
    }

    const agentId = `${agent.chainId}:${agent.agentId}`;
    const existing = existingMetadata.get(agentId);

    if (!existing) {
      // New agent - needs full index with embedding
      toSync.push({ agent, version, needsEmbed: true });
    } else {
      // Existing agent - check if content changed (e.g., owner field added, registrationFile added)
      // Compute content hash from Graph fields to compare (use async SHA-256 to match stored hashes)
      const quickContentFields: ContentFields = {
        agentId,
        name: agent.registrationFile?.name ?? '',
        description: agent.registrationFile?.description ?? '',
        active: agent.registrationFile?.active ?? false,
        hasMcp: Boolean(agent.registrationFile?.mcpEndpoint),
        hasA2a: Boolean(agent.registrationFile?.a2aEndpoint),
        skills: [], // D1 fields - use empty for Graph-only comparison
        domains: [], // D1 fields - use empty for Graph-only comparison
        reputation: 0, // D1 field - use 0 for Graph-only comparison
        owner: (agent.owner ?? '').toLowerCase(),
        hasRegistrationFile: !!agent.registrationFile,
      };
      const newHash = await computeContentHash(quickContentFields);

      // If hash differs, content changed - needs payload update (no re-embedding)
      // Note: After adding owner field to hash, all old agents will have different hashes
      if (newHash !== existing.content_hash) {
        toSync.push({ agent, version, needsEmbed: false });
        contentChanged++;
      } else {
        skipped++;
      }
    }
  }

  result.skipped = skipped;
  const newCount = toSync.filter((a) => a.needsEmbed).length;
  logger.progress('Identified agents to sync', {
    toSync: toSync.length,
    newAgents: newCount,
    contentChanged,
    unchanged: skipped,
  });

  if (toSync.length === 0) {
    logger.skip('No agents need syncing');
    return result;
  }

  // Fetch A2A IO modes only for agents we're going to sync
  const agentsToFetchA2A = toSync.filter((a) => a.agent.registrationFile?.a2aEndpoint);
  logger.progress('Fetching A2A AgentCards', { count: agentsToFetchA2A.length });
  const ioModesMap = await fetchA2AIOModes(
    agentsToFetchA2A.map((a) => a.agent),
    a2aClient
  );
  logger.progress('Fetched A2A AgentCards', { fetched: ioModesMap.size });

  // Update toSync with IO modes
  for (const item of toSync) {
    const agentId = `${item.agent.chainId}:${item.agent.agentId}`;
    item.ioModes = ioModesMap.get(agentId);
  }

  // Fetch reachability status only for agents we're syncing
  const syncAgentIds = toSync.map((a) => `${a.agent.chainId}:${a.agent.agentId}`);
  logger.progress('Fetching reachability status', { agentCount: syncAgentIds.length });
  const reachabilityMap = await reachabilityService.getAgentReachabilitiesBatch(syncAgentIds);
  logger.progress('Fetched reachability status', { fetched: reachabilityMap.size });

  logger.progress('Processing agents', { count: toSync.length });

  // Process agents that need syncing
  for (const { agent, version, needsEmbed, ioModes } of toSync) {
    const agentId = `${agent.chainId}:${agent.agentId}`;

    try {
      // Get reachability status for this agent
      const reachability = reachabilityMap.get(agentId);
      const payload = agentToPayload(agent, version, ioModes, reachability);
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

  logger.complete({
    newAgents: result.newAgents,
    updatedAgents: result.updatedAgents,
    reembedded: result.reembedded,
    errors: result.errors.length,
    hasMore: result.hasMore,
  });

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
