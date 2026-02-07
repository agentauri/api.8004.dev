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
import { executeWithChainKey, SUBGRAPH_IDS } from '@/lib/config/graph';
import { createWorkerLogger } from '@/lib/logger/worker-logger';
import {
  buildAgentPayload,
  type PayloadBuilderInput,
  type PayloadEnrichment,
} from '../../lib/qdrant/payload-builder';
import type { AgentPayload } from '../../lib/qdrant/types';
import { type A2AClient, createA2AClient, type ExtractedIOModes } from '../a2a-client';
import { generateEmbedding } from '../embedding';
import { createQdrantClient, type QdrantClient } from '../qdrant';
import { type AgentReachability, createReachabilityService } from '../reachability';
import { type ContentFields, computeContentHash, computeEmbedHash } from './content-hash';

// Supported chain IDs with deployed v1.0 contracts and subgraphs
// Updated February 2026 with all deployed chains
export const SUPPORTED_CHAIN_IDS: number[] = [
  // Mainnets
  1, // Ethereum Mainnet
  137, // Polygon Mainnet
  8453, // Base Mainnet
  56, // BSC Mainnet
  143, // Monad Mainnet
  // Testnets
  11155111, // Ethereum Sepolia
  84532, // Base Sepolia
  97, // BSC Testnet
  10143, // Monad Testnet
];

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

/** Graph agent type alias */
type GraphAgent = GraphAgentV1_0;

export interface GraphSyncResult {
  newAgents: number;
  updatedAgents: number;
  reembedded: number;
  errors: string[];
  /** Number of agents skipped (already synced) */
  skipped?: number;
  /** Whether there are more agents to sync in the next run */
  hasMore?: boolean;
  /** Chain ID that was processed in this invocation */
  chainId?: number;
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
 * Fetch all agents from a single chain's Graph endpoint
 * Uses chain-specific API keys with optional user key fallback
 */
async function fetchAgentsFromGraph(
  chainId: number,
  userKey: string | undefined,
  first = 1000,
  skip = 0
): Promise<GraphAgent[]> {
  // Check if chain has a subgraph deployment
  if (!(chainId in SUBGRAPH_IDS)) {
    throw new Error(`No Graph subgraph for chain ${chainId}`);
  }

  const query = buildAgentQueryV1_0();

  // Use chain-specific key with user key fallback
  return executeWithChainKey(chainId, userKey, async (endpoint) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { first, skip } }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      data?: { agents: GraphAgent[] };
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) {
      throw new Error(`Graph query error: ${data.errors[0]?.message}`);
    }

    return data.data?.agents ?? [];
  });
}

/**
 * Fetch all agents from a single chain, paginating through all results.
 * @param chainId - Chain to fetch from
 * @param userKey - Optional Graph API key
 * @returns All agents on that chain
 */
async function fetchAllAgentsFromChain(
  chainId: number,
  userKey: string | undefined
): Promise<GraphAgent[]> {
  const allAgents: GraphAgent[] = [];
  let skip = 0;
  const first = 1000;

  while (true) {
    const batch = await fetchAgentsFromGraph(chainId, userKey, first, skip);
    if (batch.length === 0) break;

    allAgents.push(...batch);
    skip += first;

    // Safety limit
    if (skip > 50000) break;
  }

  return allAgents;
}

/**
 * Get the next chain ID to sync using round-robin.
 * Reads `last_graph_sync_chain_id` from D1, returns the next chain in the list.
 * On first run (NULL), starts with chain index 0 (Ethereum Mainnet).
 * If the stored chain ID is no longer in SUPPORTED_CHAIN_IDS, wraps to index 0.
 */
export async function getNextChainId(db: D1Database): Promise<number> {
  const firstChain = SUPPORTED_CHAIN_IDS[0] as number;

  const row = await db
    .prepare('SELECT last_graph_sync_chain_id FROM qdrant_sync_state WHERE id = ?')
    .bind('global')
    .first<{ last_graph_sync_chain_id: number | null }>();

  const lastChainId = row?.last_graph_sync_chain_id ?? null;

  if (lastChainId === null) {
    return firstChain;
  }

  const lastIndex = SUPPORTED_CHAIN_IDS.indexOf(lastChainId);
  if (lastIndex === -1) {
    return firstChain;
  }

  const nextIndex = (lastIndex + 1) % SUPPORTED_CHAIN_IDS.length;
  return SUPPORTED_CHAIN_IDS[nextIndex] as number;
}

/**
 * Update D1 sync state after processing a chain.
 * Advances the round-robin pointer and updates per-chain timestamps.
 */
async function updateChainSyncState(
  db: D1Database,
  chainId: number,
  stats: { synced: number; embedded: number }
): Promise<void> {
  const now = new Date().toISOString();

  // Read current per-chain timestamps
  const row = await db
    .prepare('SELECT graph_sync_chain_timestamps FROM qdrant_sync_state WHERE id = ?')
    .bind('global')
    .first<{ graph_sync_chain_timestamps: string | null }>();

  let timestamps: Record<string, string> = {};
  try {
    timestamps = JSON.parse(row?.graph_sync_chain_timestamps || '{}') as Record<string, string>;
  } catch {
    timestamps = {};
  }
  timestamps[String(chainId)] = now;

  await db
    .prepare(
      `UPDATE qdrant_sync_state
       SET last_graph_sync = ?,
           last_graph_sync_chain_id = ?,
           graph_sync_chain_timestamps = ?,
           agents_synced = agents_synced + ?,
           embeddings_generated = embeddings_generated + ?,
           updated_at = datetime('now')
       WHERE id = 'global'`
    )
    .bind(now, chainId, JSON.stringify(timestamps), stats.synced, stats.embedded)
    .run();
}

/**
 * Convert Graph agent to Qdrant payload
 * Uses centralized payload builder for consistent payload structure
 *
 * @param agent - Graph agent data (v1.0)
 * @param ioModes - Optional IO modes from A2A AgentCard
 * @param reachability - Optional reachability status from feedback
 */
function agentToPayload(
  agent: GraphAgent,
  ioModes?: ExtractedIOModes,
  reachability?: AgentReachability
): AgentPayload {
  const reg = agent.registrationFile;
  const hasReg = !!reg;

  // v1.0: agentWallet is on Agent entity (on-chain verified via EIP-712)
  const walletAddress = agent.agentWallet ?? '';

  // Build input from Graph agent
  // Use placeholder name when name is null/empty (consistent with getEmbedFields)
  const input: PayloadBuilderInput = {
    agentId: `${agent.chainId}:${agent.agentId}`,
    chainId: Number(agent.chainId),
    tokenId: agent.agentId,
    name: reg?.name || `Agent #${agent.agentId}`,
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
    createdAt: reg?.createdAt
      ? new Date(Number.parseInt(reg.createdAt, 10) * 1000).toISOString()
      : agent.createdAt
        ? new Date(Number.parseInt(agent.createdAt, 10) * 1000).toISOString()
        : undefined,
    mcpVersion: reg?.mcpVersion ?? undefined,
    a2aVersion: reg?.a2aVersion ?? undefined,
    supportedTrusts: reg?.supportedTrusts ?? undefined,
    agentUri: agent.agentURI ?? undefined,
    updatedAt: agent.updatedAt
      ? new Date(Number.parseInt(agent.updatedAt, 10) * 1000).toISOString()
      : undefined,
    erc8004Version: 'v1.0',
    // Declared OASF fields
    oasfSkills: reg?.oasfSkills ?? undefined,
    oasfDomains: reg?.oasfDomains ?? undefined,
    // New endpoint fields
    emailEndpoint: reg?.emailEndpoint ?? undefined,
    oasfEndpoint: reg?.oasfEndpoint ?? undefined,
    oasfVersion: reg?.oasfVersion ?? undefined,
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
 * Get content fields from payload for hash comparison.
 * IMPORTANT: Must use same fields as quickContentFields to ensure hashes match.
 * D1 fields (skills, domains, reputation) are excluded because:
 * 1. They are managed by D1 sync worker, not Graph sync
 * 2. Including them causes hash mismatch since quickContentFields uses empty values
 * 3. This was causing infinite sync loops where agents were never "caught up"
 */
function getContentFields(payload: AgentPayload): ContentFields {
  return {
    agentId: payload.agent_id,
    name: payload.name,
    description: payload.description,
    active: payload.active,
    hasMcp: payload.has_mcp,
    hasA2a: payload.has_a2a,
    // Use empty arrays for D1 fields to match quickContentFields
    // D1 data changes are tracked separately by D1 sync worker
    skills: [],
    domains: [],
    reputation: 0,
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
 * Sync agents from Graph to Qdrant — one chain per invocation (round-robin).
 *
 * Each cron invocation picks the next chain via round-robin, fetches all agents
 * for that chain, then processes up to MAX_AGENTS_PER_SYNC that are new or changed.
 * This stays well under Cloudflare's ~1000 subrequest limit even for large chains
 * like Ethereum Mainnet (11K+ agents).
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

  // 1. Determine which chain to sync this invocation
  const chainId = await getNextChainId(db);
  result.chainId = chainId;

  logger.start(`Syncing chain ${chainId} (round-robin)`);

  // 2. Fetch all agents for this single chain
  let allAgents: GraphAgent[];
  try {
    allAgents = await fetchAllAgentsFromChain(chainId, env.GRAPH_API_KEY);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`Fetch chain ${chainId}: ${message}`);

    // Advance the chain pointer even on failure so we don't get stuck
    await updateChainSyncState(db, chainId, { synced: 0, embedded: 0 });

    logger.complete({
      chainId,
      error: message,
      note: 'Advanced chain pointer despite fetch failure',
    });

    return result;
  }

  const agentsWithReg = allAgents.filter((a) => a.registrationFile);
  const agentsWithoutReg = allAgents.length - agentsWithReg.length;

  logger.progress(`Fetched agents from chain ${chainId}`, {
    total: allAgents.length,
    withRegistration: agentsWithReg.length,
    withoutRegistration: agentsWithoutReg,
  });

  // 3. Get existing sync metadata for this chain's agents
  const agentIds = allAgents.map((a) => `${a.chainId}:${a.agentId}`);
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

  // 4. Identify agents that need syncing (new or changed)
  const toSync: AgentToSync[] = [];
  let skipped = 0;
  let contentChanged = 0;

  for (const agent of allAgents) {
    if (toSync.length >= MAX_AGENTS_PER_SYNC) {
      result.hasMore = true;
      break;
    }

    const agentId = `${agent.chainId}:${agent.agentId}`;
    const existing = existingMetadata.get(agentId);

    if (!existing) {
      toSync.push({ agent, needsEmbed: true });
    } else {
      const quickContentFields: ContentFields = {
        agentId,
        name: agent.registrationFile?.name || `Agent #${agent.agentId}`,
        description: agent.registrationFile?.description ?? '',
        active: agent.registrationFile?.active ?? false,
        hasMcp: Boolean(agent.registrationFile?.mcpEndpoint),
        hasA2a: Boolean(agent.registrationFile?.a2aEndpoint),
        skills: [],
        domains: [],
        reputation: 0,
        owner: (agent.owner ?? '').toLowerCase(),
        hasRegistrationFile: !!agent.registrationFile,
      };
      const newHash = await computeContentHash(quickContentFields);

      if (newHash !== existing.content_hash) {
        toSync.push({ agent, needsEmbed: false });
        contentChanged++;
      } else {
        skipped++;
      }
    }
  }

  result.skipped = skipped;
  const newCount = toSync.filter((a) => a.needsEmbed).length;
  logger.progress('Identified agents to sync', {
    chainId,
    toSync: toSync.length,
    newAgents: newCount,
    contentChanged,
    unchanged: skipped,
  });

  if (toSync.length === 0) {
    // No work needed, but still advance the chain pointer
    await updateChainSyncState(db, chainId, { synced: 0, embedded: 0 });
    logger.skip(`No agents need syncing on chain ${chainId}`);
    return result;
  }

  // 5. Fetch A2A IO modes only for agents we're going to sync
  const agentsToFetchA2A = toSync.filter((a) => a.agent.registrationFile?.a2aEndpoint);
  logger.progress('Fetching A2A AgentCards', { count: agentsToFetchA2A.length });
  const ioModesMap = await fetchA2AIOModes(
    agentsToFetchA2A.map((a) => a.agent),
    a2aClient
  );
  logger.progress('Fetched A2A AgentCards', { fetched: ioModesMap.size });

  for (const item of toSync) {
    const agentId = `${item.agent.chainId}:${item.agent.agentId}`;
    item.ioModes = ioModesMap.get(agentId);
  }

  // 6. Fetch reachability status only for agents we're syncing
  const syncAgentIds = toSync.map((a) => `${a.agent.chainId}:${a.agent.agentId}`);
  logger.progress('Fetching reachability status', { agentCount: syncAgentIds.length });
  const reachabilityMap = await reachabilityService.getAgentReachabilitiesBatch(syncAgentIds);
  logger.progress('Fetched reachability status', { fetched: reachabilityMap.size });

  logger.progress('Processing agents', { count: toSync.length });

  // 7. Process agents that need syncing
  for (const { agent, needsEmbed, ioModes } of toSync) {
    const agentId = `${agent.chainId}:${agent.agentId}`;

    try {
      const reachability = reachabilityMap.get(agentId);
      const payload = agentToPayload(agent, ioModes, reachability);
      const embedFields = getEmbedFields(agent, ioModes);
      const contentFields = getContentFields(payload);

      if (needsEmbed) {
        const text = formatAgentText(embedFields);
        const vector = await generateEmbedding(text, env.VENICE_API_KEY);

        await qdrant.upsertAgent(agentId, vector, payload);
        result.reembedded++;

        if (!(await agentExistsInQdrant(qdrant, agentId))) {
          result.newAgents++;
        } else {
          result.updatedAgents++;
        }
      } else {
        await qdrant.setPayloadByAgentId(agentId, payload);
        result.updatedAgents++;
      }

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

  // 8. Update chain sync state (advances round-robin pointer)
  await updateChainSyncState(db, chainId, {
    synced: result.newAgents + result.updatedAgents,
    embedded: result.reembedded,
  });

  logger.complete({
    chainId,
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
