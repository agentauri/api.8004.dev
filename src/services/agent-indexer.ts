/**
 * Agent indexer service
 * Syncs agent data from SDK/on-chain to Qdrant vector store
 * @module services/agent-indexer
 */

import type { AgentPayload } from '../lib/qdrant/types';
import type { AgentSummary, Env } from '../types';
import { type EmbeddingService, formatAgentText } from './embedding';
import type { QdrantClient } from './qdrant';
import { createSDKService, type SDKService, SUPPORTED_CHAINS } from './sdk';

/**
 * Indexer configuration
 */
export interface IndexerConfig {
  /** Qdrant client */
  qdrant: QdrantClient;
  /** Embedding service */
  embedding: EmbeddingService;
  /** SDK service */
  sdk: SDKService;
  /** KV namespace for state tracking */
  cache: KVNamespace;
  /** D1 database for metadata */
  db: D1Database;
}

/**
 * Sync state for a chain
 */
export interface ChainSyncState {
  chainId: number;
  lastSyncedAt: string;
  lastAgentCount: number;
  lastError?: string;
}

/**
 * Index result
 */
export interface IndexResult {
  indexed: number;
  updated: number;
  deleted: number;
  errors: number;
  duration: number;
}

/**
 * Agent indexer class
 */
export class AgentIndexer {
  private readonly qdrant: QdrantClient;
  private readonly embedding: EmbeddingService;
  private readonly sdk: SDKService;
  private readonly cache: KVNamespace;
  private readonly db: D1Database;

  constructor(config: IndexerConfig) {
    this.qdrant = config.qdrant;
    this.embedding = config.embedding;
    this.sdk = config.sdk;
    this.cache = config.cache;
    this.db = config.db;
  }

  /**
   * Full reindex of all agents across all chains
   */
  async fullReindex(options?: {
    chainIds?: number[];
    batchSize?: number;
    onProgress?: (chainId: number, indexed: number, total: number) => void;
  }): Promise<IndexResult> {
    const startTime = Date.now();
    const chainIds = options?.chainIds ?? SUPPORTED_CHAINS.map((c) => c.chainId);
    const batchSize = options?.batchSize ?? 50;

    let totalIndexed = 0;
    let totalErrors = 0;

    for (const chainId of chainIds) {
      try {
        const result = await this.indexChain(chainId, {
          batchSize,
          onProgress: (indexed, total) => {
            options?.onProgress?.(chainId, indexed, total);
          },
        });
        totalIndexed += result.indexed;
        totalErrors += result.errors;
      } catch (error) {
        console.error(`Error indexing chain ${chainId}:`, error);
        totalErrors++;
      }
    }

    return {
      indexed: totalIndexed,
      updated: 0,
      deleted: 0,
      errors: totalErrors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Index all agents from a single chain
   */
  async indexChain(
    chainId: number,
    options?: {
      batchSize?: number;
      onProgress?: (indexed: number, total: number) => void;
    }
  ): Promise<IndexResult> {
    const startTime = Date.now();
    const batchSize = options?.batchSize ?? 50;
    let indexed = 0;
    let errors = 0;

    // Fetch all agents from SDK
    const agents: AgentSummary[] = [];
    let cursor: string | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await this.sdk.getAgents({
        chainIds: [chainId],
        limit: 100,
        cursor,
        hasRegistrationFile: true, // Only index agents with metadata
      });

      agents.push(...result.items);

      // Check if there are more pages
      if (!result.nextCursor) {
        break;
      }
      cursor = result.nextCursor;
    }

    // Process in batches
    for (let i = 0; i < agents.length; i += batchSize) {
      const batch = agents.slice(i, i + batchSize);

      try {
        await this.indexAgentBatch(batch);
        indexed += batch.length;
      } catch (error) {
        console.error(`Error indexing batch at ${i}:`, error);
        errors += batch.length;
      }

      options?.onProgress?.(Math.min(i + batchSize, agents.length), agents.length);
    }

    // Update sync state
    await this.updateSyncState(chainId, agents.length);

    return {
      indexed,
      updated: 0,
      deleted: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Index a batch of agents
   */
  async indexAgentBatch(agents: AgentSummary[]): Promise<void> {
    if (agents.length === 0) return;

    // Generate embeddings for all agents in batch
    const texts = agents.map((a) => formatAgentText(a.name, a.description));
    const embeddingResponse = await this.embedding.embed({ input: texts });

    // Prepare points for Qdrant
    const points: Array<{ id: string; vector: number[]; payload: AgentPayload }> = [];
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const vector = embeddingResponse.embeddings[i];
      if (agent && vector) {
        points.push({
          id: this.generatePointId(agent.id),
          vector,
          payload: this.agentToPayload(agent),
        });
      }
    }

    // Upsert to Qdrant
    await this.qdrant.upsertAgents(points);
  }

  /**
   * Index a single agent (for real-time updates)
   */
  async indexAgent(agent: AgentSummary): Promise<void> {
    const text = formatAgentText(agent.name, agent.description);
    const vector = await this.embedding.embedSingle(text);
    const payload = this.agentToPayload(agent);

    await this.qdrant.upsertAgent(this.generatePointId(agent.id), vector, payload);
  }

  /**
   * Delete an agent from the index
   */
  async deleteAgent(agentId: string): Promise<void> {
    await this.qdrant.delete([this.generatePointId(agentId)]);
  }

  /**
   * Check if agent needs re-indexing (name/description changed)
   */
  async needsReindex(agent: AgentSummary): Promise<boolean> {
    const existing = await this.qdrant.getById(this.generatePointId(agent.id));
    if (!existing) return true;

    // Check if name or description changed (requires re-embedding)
    return (
      existing.payload.name !== agent.name || existing.payload.description !== agent.description
    );
  }

  /**
   * Update agent metadata without re-embedding
   * Use when only non-text fields changed
   */
  async updateAgentMetadata(agent: AgentSummary): Promise<void> {
    const existing = await this.qdrant.getById(this.generatePointId(agent.id));
    if (!existing) {
      // Agent doesn't exist, do full index
      await this.indexAgent(agent);
      return;
    }

    // Get existing vector (we need to include it in upsert)
    const points = await this.qdrant.getByIds([this.generatePointId(agent.id)]);
    if (points.length === 0) {
      await this.indexAgent(agent);
      return;
    }

    // Update payload only (Qdrant doesn't have partial update, so we upsert with existing vector)
    // Note: This requires fetching the vector, which Qdrant supports
    // For simplicity, we'll just re-embed. In production, you might want to cache vectors.
    await this.indexAgent(agent);
  }

  /**
   * Convert AgentSummary to Qdrant payload
   */
  private agentToPayload(agent: AgentSummary): AgentPayload {
    return {
      agent_id: agent.id,
      chain_id: agent.chainId,
      name: agent.name,
      description: agent.description,
      active: agent.active,
      has_mcp: agent.hasMcp,
      has_a2a: agent.hasA2a,
      x402_support: agent.x402Support,
      has_registration_file: true, // We only index agents with registration files
      skills: agent.oasf?.skills.map((s) => s.slug) ?? [],
      domains: agent.oasf?.domains.map((d) => d.slug) ?? [],
      mcp_tools: [], // Will be populated from detail view
      a2a_skills: [], // Will be populated from detail view
      mcp_prompts: [], // Will be populated from detail view
      mcp_resources: [], // Will be populated from detail view
      reputation: agent.reputationScore ?? 0,
      created_at: new Date().toISOString(), // Will be populated from subgraph
      operators: agent.operators ?? [],
      ens: agent.ens ?? '',
      did: agent.did ?? '',
      image: agent.image ?? '',
      wallet_address: agent.walletAddress ?? '',
      input_modes: agent.inputModes ?? [],
      output_modes: agent.outputModes ?? [],
      token_id: agent.tokenId,
      is_reachable_a2a: false, // Will be populated from feedback data during sync
      is_reachable_mcp: false, // Will be populated from feedback data during sync
      // New fields from subgraph schema
      mcp_version: agent.mcpVersion ?? '',
      a2a_version: agent.a2aVersion ?? '',
      agent_wallet_chain_id: agent.agentWalletChainId ?? 0,
      supported_trusts: agent.supportedTrusts ?? [],
      agent_uri: '', // Will be populated from subgraph during full sync
      updated_at: '', // Will be populated from subgraph during full sync
      trust_score: 0, // Will be populated from PageRank computation
    };
  }

  /**
   * Generate Qdrant point ID from agent ID
   * Uses UUID v5 to ensure consistent IDs
   */
  private generatePointId(agentId: string): string {
    // Use agent ID directly as it's already unique (chainId:tokenId)
    // Replace colon with underscore for compatibility
    return agentId.replace(':', '_');
  }

  /**
   * Get sync state for a chain
   */
  async getSyncState(chainId: number): Promise<ChainSyncState | null> {
    const key = `indexer:sync:${chainId}`;
    const data = await this.cache.get(key);
    if (!data) return null;
    return JSON.parse(data) as ChainSyncState;
  }

  /**
   * Update sync state for a chain
   */
  private async updateSyncState(chainId: number, agentCount: number): Promise<void> {
    const state: ChainSyncState = {
      chainId,
      lastSyncedAt: new Date().toISOString(),
      lastAgentCount: agentCount,
    };
    const key = `indexer:sync:${chainId}`;
    await this.cache.put(key, JSON.stringify(state), {
      expirationTtl: 86400 * 7, // 7 days
    });
  }

  /**
   * Get sync states for all chains
   */
  async getAllSyncStates(): Promise<ChainSyncState[]> {
    const states: ChainSyncState[] = [];
    for (const chain of SUPPORTED_CHAINS) {
      const state = await this.getSyncState(chain.chainId);
      if (state) {
        states.push(state);
      }
    }
    return states;
  }

  /**
   * Reconcile index with on-chain data
   * Finds and fixes any drift between Qdrant and SDK data
   */
  async reconcile(chainId: number): Promise<{
    added: number;
    removed: number;
    updated: number;
  }> {
    // Get all agent IDs from SDK
    const sdkAgents: AgentSummary[] = [];
    let cursor: string | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await this.sdk.getAgents({
        chainIds: [chainId],
        limit: 100,
        cursor,
        hasRegistrationFile: true,
      });
      sdkAgents.push(...result.items);

      if (!result.nextCursor) {
        break;
      }
      cursor = result.nextCursor;
    }

    const sdkIds = new Set(sdkAgents.map((a) => this.generatePointId(a.id)));

    // Get all agent IDs from Qdrant for this chain
    const qdrantIds = new Set<string>();
    let qdrantCursor: string | undefined;

    do {
      const result = await this.qdrant.scroll({
        filters: { chainIds: [chainId] },
        limit: 100,
        cursor: qdrantCursor,
      });

      for (const item of result.items) {
        qdrantIds.add(item.id);
      }

      qdrantCursor = result.nextCursor;
    } while (qdrantCursor);

    // Find differences
    const toAdd = sdkAgents.filter((a) => !qdrantIds.has(this.generatePointId(a.id)));
    const toRemove = [...qdrantIds].filter((id) => !sdkIds.has(id));

    // Add missing agents
    if (toAdd.length > 0) {
      await this.indexAgentBatch(toAdd);
    }

    // Remove stale agents
    if (toRemove.length > 0) {
      await this.qdrant.delete(toRemove);
    }

    return {
      added: toAdd.length,
      removed: toRemove.length,
      updated: 0,
    };
  }
}

/**
 * Create agent indexer from environment
 */
export function createAgentIndexer(
  env: Env,
  qdrant: QdrantClient,
  embedding: EmbeddingService
): AgentIndexer {
  return new AgentIndexer({
    qdrant,
    embedding,
    sdk: createSDKService(env),
    cache: env.CACHE,
    db: env.DB,
  });
}
