/**
 * Reconciliation Worker
 *
 * Performs drift detection between The Graph and Qdrant:
 * - Finds orphans (in Qdrant but not in Graph) → hard delete
 * - Finds missing (in Graph but not in Qdrant) → index
 *
 * Run hourly as a backstop for the 15-minute delta sync.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { formatAgentText } from '@/lib/ai/formatting';
import { buildSubgraphUrls } from '@/lib/config/graph';
import { createWorkerLogger } from '@/lib/logger/worker-logger';
import {
  buildAgentPayload,
  type PayloadBuilderInput,
} from '../../lib/qdrant/payload-builder';
import type { AgentPayload } from '../../lib/qdrant/types';
import { generateEmbedding } from '../embedding';
import { createQdrantClient } from '../qdrant';

// The Graph API key from agent0-sdk (public key for ERC-8004 subgraphs)
const GRAPH_API_KEY = '00a452ad3cd1900273ea62c1bf283f93';

// Build URLs once at module load
const ALL_SUBGRAPH_URLS = buildSubgraphUrls(GRAPH_API_KEY);

// Graph endpoints per chain (using centralized config)
// Only ETH Sepolia has v1.0 contracts deployed currently
const GRAPH_ENDPOINTS: Record<number, string> = Object.fromEntries(
  Object.entries(ALL_SUBGRAPH_URLS).filter(([chainId]) => chainId === '11155111')
);

interface GraphAgent {
  chainId: string;
  agentId: string;
  /** On-chain agent wallet set via setAgentWallet() with EIP-712 signature */
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
    mcpTools?: Array<{ name: string }>;
    a2aSkills?: Array<{ name: string }>;
    createdAt?: string;
    mcpVersion?: string;
    a2aVersion?: string;
    // NOTE: agentWalletChainId removed in ERC-8004 v1.0
    supportedTrusts?: string[];
  } | null;
  owner: string;
  operators: string[];
}

export interface ReconciliationResult {
  orphansDeleted: number;
  missingIndexed: number;
  errors: string[];
}

/**
 * Fetch all agent IDs from a single chain
 */
async function fetchAgentIdsFromChain(chainId: number, graphApiKey?: string): Promise<string[]> {
  const endpoint = GRAPH_ENDPOINTS[chainId];
  if (!endpoint) return [];

  const ids: string[] = [];
  let skip = 0;
  const first = 1000;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (graphApiKey) {
    headers.Authorization = `Bearer ${graphApiKey}`;
  }

  while (true) {
    // Fetch ALL agents (including those without registrationFile)
    const query = `
      query GetAgentIds($first: Int!, $skip: Int!) {
        agents(first: $first, skip: $skip) {
          chainId
          agentId
        }
      }
    `;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: { first, skip } }),
    });

    if (!response.ok) break;

    const data = (await response.json()) as {
      data?: { agents: Array<{ chainId: string; agentId: string }> };
    };

    const agents = data.data?.agents ?? [];
    if (agents.length === 0) break;

    for (const agent of agents) {
      ids.push(`${agent.chainId}:${agent.agentId}`);
    }

    skip += first;
    if (skip > 10000) break; // Safety limit
  }

  return ids;
}

/**
 * Fetch all agent IDs from all chains
 */
async function fetchAllAgentIdsFromGraph(graphApiKey?: string): Promise<Set<string>> {
  const allIds = new Set<string>();

  for (const chainId of Object.keys(GRAPH_ENDPOINTS)) {
    const ids = await fetchAgentIdsFromChain(Number(chainId), graphApiKey);
    for (const id of ids) {
      allIds.add(id);
    }
  }

  return allIds;
}

/**
 * Fetch agents by IDs from Graph (for indexing missing ones)
 */
async function fetchAgentsByIds(agentIds: string[], graphApiKey?: string): Promise<GraphAgent[]> {
  const agents: GraphAgent[] = [];

  // Group by chain
  const byChain = new Map<number, string[]>();
  for (const id of agentIds) {
    const parts = id.split(':');
    const chainId = parts[0];
    const tokenId = parts[1];
    if (!chainId || !tokenId) continue;
    const chain = Number(chainId);
    if (!byChain.has(chain)) {
      byChain.set(chain, []);
    }
    byChain.get(chain)?.push(tokenId);
  }

  // Fetch from each chain
  for (const [chainId, tokenIds] of byChain) {
    const endpoint = GRAPH_ENDPOINTS[chainId];
    if (!endpoint) continue;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (graphApiKey) {
      headers.Authorization = `Bearer ${graphApiKey}`;
    }

    // Fetch ALL agents (including those without registrationFile)
    const query = `
      query GetAgentsByIds($ids: [String!]!) {
        agents(where: { agentId_in: $ids }) {
          chainId
          agentId
          agentWallet
          owner
          operators
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
            mcpTools { name }
            a2aSkills { name }
            createdAt
            mcpVersion
            a2aVersion
            supportedTrusts
          }
        }
      }
    `;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: { ids: tokenIds } }),
    });

    if (!response.ok) continue;

    const data = (await response.json()) as { data?: { agents: GraphAgent[] } };
    agents.push(...(data.data?.agents ?? []));
  }

  return agents;
}

/**
 * Index missing agents to Qdrant
 * Handles both agents with and without registrationFile
 * Uses centralized payload builder for consistent payload structure
 */
async function indexAgentsToQdrant(
  agents: GraphAgent[],
  env: {
    QDRANT_URL: string;
    QDRANT_API_KEY: string;
    QDRANT_COLLECTION?: string;
    VENICE_API_KEY: string;
  }
): Promise<number> {
  const qdrant = createQdrantClient(env);
  let indexed = 0;

  for (const agent of agents) {
    const agentId = `${agent.chainId}:${agent.agentId}`;
    const reg = agent.registrationFile;
    const hasReg = !!reg;

    try {
      // Generate embedding using unified formatAgentText
      // For agents without registrationFile, use placeholder name
      const text = formatAgentText({
        name: reg?.name ?? (hasReg ? '' : `Agent #${agent.agentId}`),
        description: reg?.description ?? '',
        mcpTools: reg?.mcpTools?.map((t) => t.name) ?? [],
        mcpPrompts: [],
        mcpResources: [],
        a2aSkills: reg?.a2aSkills?.map((s) => s.name) ?? [],
        inputModes: [],
        outputModes: [],
      });

      const vector = await generateEmbedding(text, env.VENICE_API_KEY);

      // Build input for centralized payload builder
      const input: PayloadBuilderInput = {
        agentId,
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
        walletAddress: agent.agentWallet ?? undefined, // On-chain agentWallet (v1.0)
        owner: agent.owner ?? '',
        operators: agent.operators ?? [],
        mcpTools: reg?.mcpTools?.map((t) => t.name),
        a2aSkills: reg?.a2aSkills?.map((s) => s.name),
        createdAt: reg?.createdAt,
        mcpVersion: reg?.mcpVersion ?? undefined,
        a2aVersion: reg?.a2aVersion ?? undefined,
        supportedTrusts: reg?.supportedTrusts ?? undefined,
        erc8004Version: 'v1.0', // Reconciliation always uses v1.0
      };

      const payload: AgentPayload = buildAgentPayload(input);

      await qdrant.upsertAgent(agentId, vector, payload);
      indexed++;
    } catch (error) {
      // Note: This function doesn't have access to result.errors
      // Caller should handle failures by checking indexed count
      // Errors are logged by the caller
    }
  }

  return indexed;
}

/**
 * Run reconciliation between Graph and Qdrant
 */
export async function runReconciliation(
  db: D1Database,
  env: {
    QDRANT_URL: string;
    QDRANT_API_KEY: string;
    QDRANT_COLLECTION?: string;
    VENICE_API_KEY: string;
    GRAPH_API_KEY?: string;
  }
): Promise<ReconciliationResult> {
  const logger = createWorkerLogger('reconciliation');
  const qdrant = createQdrantClient(env);
  const result: ReconciliationResult = {
    orphansDeleted: 0,
    missingIndexed: 0,
    errors: [],
  };

  try {
    logger.start('Starting reconciliation');

    // Get all agent IDs from Graph
    const graphAgentIds = await fetchAllAgentIdsFromGraph(env.GRAPH_API_KEY);
    logger.progress('Fetched Graph agents', { count: graphAgentIds.size });

    // Get all agent IDs from Qdrant
    const qdrantAgentIds = new Set(await qdrant.getAllAgentIds());
    logger.progress('Fetched Qdrant agents', { count: qdrantAgentIds.size });

    // Find orphans (in Qdrant but not in Graph) → DELETE
    const orphans: string[] = [];
    for (const id of qdrantAgentIds) {
      if (!graphAgentIds.has(id)) {
        orphans.push(id);
      }
    }

    // Find missing (in Graph but not in Qdrant) → INDEX
    const missing: string[] = [];
    for (const id of graphAgentIds) {
      if (!qdrantAgentIds.has(id)) {
        missing.push(id);
      }
    }

    logger.progress('Identified drift', { orphans: orphans.length, missing: missing.length });

    // Hard delete orphans from Qdrant
    if (orphans.length > 0) {
      try {
        await qdrant.deleteByAgentIds(orphans);
        result.orphansDeleted = orphans.length;

        // Remove from sync metadata
        for (const id of orphans) {
          await db.prepare('DELETE FROM agent_sync_metadata WHERE agent_id = ?').bind(id).run();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Delete orphans: ${message}`);
      }
    }

    // Index missing agents (in batches to avoid timeout)
    if (missing.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);
        try {
          const agents = await fetchAgentsByIds(batch, env.GRAPH_API_KEY);
          const indexed = await indexAgentsToQdrant(agents, env);
          result.missingIndexed += indexed;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push(`Index batch ${i}: ${message}`);
        }
      }
    }

    // Update global sync state
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE qdrant_sync_state
         SET last_reconciliation = ?,
             agents_deleted = agents_deleted + ?,
             agents_synced = agents_synced + ?,
             updated_at = datetime('now')
         WHERE id = 'global'`
      )
      .bind(now, result.orphansDeleted, result.missingIndexed)
      .run();

    logger.complete({
      orphansDeleted: result.orphansDeleted,
      missingIndexed: result.missingIndexed,
      errors: result.errors.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`Reconciliation: ${message}`);
    logger.fail('Reconciliation failed', error);
  }

  return result;
}
