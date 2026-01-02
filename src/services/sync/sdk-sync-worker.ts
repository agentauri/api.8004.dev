/**
 * SDK to Qdrant Sync Worker
 *
 * Syncs agent data from agent0-sdk (RPC) to Qdrant.
 * Alternative to Graph sync that doesn't require The Graph API key.
 */

import { formatAgentText } from '@/lib/ai/formatting';
import type { AgentPayload } from '../../lib/qdrant/types';
import { generateEmbedding } from '../embedding';
import { createQdrantClient } from '../qdrant';
import {
  type SubgraphRawAgent,
  createSDKService,
  fetchAllAgentsFromSubgraph,
} from '../sdk';
import type { Env } from '../../types';

// Supported chains for direct subgraph queries
const SYNC_CHAINS = [11155111, 84532, 80002]; // Sepolia, Base Sepolia, Polygon Amoy

/**
 * Generate a deterministic UUID v5-like ID from an agent ID
 * This creates a consistent ID that Qdrant accepts
 * Format: 8-4-4-4-12 hex chars = 32 hex chars total
 */
function agentIdToUUID(agentId: string): string {
  // Simple hash function for string -> hex
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    const char = agentId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Create deterministic hex from agentId
  // We'll pad/repeat the agentId to get enough chars
  const base = agentId.replace(':', '').padEnd(32, '0');
  const hex = base.split('').map((c, i) => {
    const code = c.charCodeAt(0) + i + Math.abs(hash);
    return (code % 16).toString(16);
  }).join('').slice(0, 32);

  // Format as UUID: 8-4-4-4-12
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export interface SDKSyncResult {
  newAgents: number;
  updatedAgents: number;
  errors: string[];
}

/**
 * Convert SubgraphRawAgent to Qdrant payload
 * Used when fetching agents directly from subgraph (bypassing SDK)
 */
function subgraphAgentToPayload(agent: SubgraphRawAgent): AgentPayload {
  const chainId = Number.parseInt(agent.chainId, 10);
  const tokenId = agent.agentId;
  const agentId = agent.id;
  const regFile = agent.registrationFile;

  if (!regFile) {
    // Agent without registration file - create minimal payload
    return {
      agent_id: agentId,
      chain_id: chainId,
      token_id: tokenId,
      name: `Agent ${tokenId}`,
      description: '',
      image: '',
      active: true, // Default to active
      has_mcp: false,
      has_a2a: false,
      x402_support: false,
      has_registration_file: false,
      ens: '',
      did: '',
      wallet_address: '',
      operators: agent.operators ?? [],
      mcp_tools: [],
      mcp_prompts: [],
      mcp_resources: [],
      a2a_skills: [],
      input_modes: [],
      output_modes: [],
      created_at: agent.createdAt
        ? new Date(Number.parseInt(agent.createdAt, 10) * 1000).toISOString()
        : new Date().toISOString(),
      is_reachable_a2a: false,
      is_reachable_mcp: false,
      mcp_version: '',
      a2a_version: '',
      agent_wallet_chain_id: 0,
      skills: [],
      domains: [],
      reputation: 0,
      supported_trusts: [],
      agent_uri: agent.agentURI ?? '',
      updated_at: agent.updatedAt
        ? new Date(Number.parseInt(agent.updatedAt, 10) * 1000).toISOString()
        : '',
      trust_score: 0,
    };
  }

  // Agent with registration file - full payload
  return {
    agent_id: agentId,
    chain_id: chainId,
    token_id: tokenId,
    name: regFile.name || `Agent ${tokenId}`,
    description: regFile.description || '',
    image: regFile.image ?? '',
    active: regFile.active,
    has_mcp: !!regFile.mcpEndpoint,
    has_a2a: !!regFile.a2aEndpoint,
    x402_support: regFile.x402support,
    has_registration_file: true,
    ens: regFile.ens ?? '',
    did: regFile.did ?? '',
    wallet_address: regFile.agentWallet ?? '',
    operators: agent.operators ?? [],
    mcp_tools: regFile.mcpTools?.map((t) => t.name) ?? [],
    mcp_prompts: regFile.mcpPrompts?.map((p) => p.name) ?? [],
    mcp_resources: regFile.mcpResources?.map((r) => r.name) ?? [],
    a2a_skills: regFile.a2aSkills?.map((s) => s.name) ?? [],
    input_modes: [],
    output_modes: [],
    created_at: regFile.createdAt
      ? new Date(Number.parseInt(regFile.createdAt, 10) * 1000).toISOString()
      : agent.createdAt
        ? new Date(Number.parseInt(agent.createdAt, 10) * 1000).toISOString()
        : new Date().toISOString(),
    is_reachable_a2a: false,
    is_reachable_mcp: false,
    mcp_version: regFile.mcpVersion ?? '',
    a2a_version: regFile.a2aVersion ?? '',
    agent_wallet_chain_id: regFile.agentWalletChainId
      ? Number.parseInt(regFile.agentWalletChainId, 10)
      : 0,
    skills: [],
    domains: [],
    reputation: 0,
    supported_trusts: regFile.supportedTrusts ?? (regFile.x402support ? ['x402'] : []),
    agent_uri: agent.agentURI ?? '',
    updated_at: agent.updatedAt
      ? new Date(Number.parseInt(agent.updatedAt, 10) * 1000).toISOString()
      : '',
    trust_score: 0,
  };
}

/**
 * SDK sync options
 */
export interface SDKSyncOptions {
  /** Maximum agents to sync (default: 5000) */
  limit?: number;
  /** Batch size for processing (default: 10) */
  batchSize?: number;
  /** Skip fetching existing IDs from Qdrant */
  skipExistingCheck?: boolean;
  /** Include agents without registration files (default: false) */
  includeAll?: boolean;
}

/**
 * Sync agents from SDK to Qdrant
 *
 * When includeAll=true, uses direct subgraph queries to fetch ALL agents
 * (including those without registration files). This bypasses the SDK which
 * hardcodes registrationFile_not: null in its searchAgents method.
 */
export async function syncFromSDK(
  env: Env,
  qdrantEnv: {
    QDRANT_URL: string;
    QDRANT_API_KEY: string;
    QDRANT_COLLECTION?: string;
    VENICE_API_KEY: string;
  },
  options: SDKSyncOptions = {}
): Promise<SDKSyncResult> {
  const { limit = 5000, batchSize = 10, skipExistingCheck = false, includeAll = false } = options;

  const qdrant = createQdrantClient(qdrantEnv);
  const result: SDKSyncResult = {
    newAgents: 0,
    updatedAgents: 0,
    errors: [],
  };

  console.info(`SDK sync: fetching up to ${limit} agents (batch size: ${batchSize}, includeAll: ${includeAll})...`);

  // Determine which approach to use:
  // - includeAll=true: Direct subgraph query (gets ALL agents including those without reg files)
  // - includeAll=false: SDK (only gets agents WITH registration files - SDK limitation)

  let allAgents: SubgraphRawAgent[] = [];

  if (includeAll) {
    // Use direct subgraph queries to get ALL agents
    console.info('SDK sync: using direct subgraph queries (includeAll=true)');

    const perChainLimit = Math.ceil(limit / SYNC_CHAINS.length);

    for (const chainId of SYNC_CHAINS) {
      try {
        const chainAgents = await fetchAllAgentsFromSubgraph(chainId, {
          withRegistrationFileOnly: false, // Get ALL agents
          limit: perChainLimit,
        });
        allAgents.push(...chainAgents);
        console.info(`SDK sync: chain ${chainId} returned ${chainAgents.length} agents`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Chain ${chainId} fetch failed: ${errMsg}`);
      }
    }

    console.info(`SDK sync: fetched ${allAgents.length} agents from direct subgraph queries`);
  } else {
    // Use SDK (only gets agents WITH registration files)
    const sdk = createSDKService(env);
    const agentsResult = await sdk.getAgents({ limit });

    // Convert SDK agents to SubgraphRawAgent format for unified processing
    // Note: SDK only returns agents WITH registration files
    allAgents = agentsResult.items.map((agent) => ({
      id: agent.id,
      chainId: String(agent.chainId),
      agentId: agent.tokenId,
      agentURI: null, // Not available from SDK summary
      operators: agent.operators ?? [],
      createdAt: '', // Not available from SDK summary
      updatedAt: '',
      registrationFile: {
        name: agent.name,
        description: agent.description ?? '',
        image: agent.image ?? null,
        active: agent.active,
        mcpEndpoint: agent.hasMcp ? 'unknown' : null,
        a2aEndpoint: agent.hasA2a ? 'unknown' : null,
        x402support: agent.x402Support,
        ens: agent.ens ?? null,
        did: agent.did ?? null,
        agentWallet: agent.walletAddress ?? null,
        agentWalletChainId: null,
        mcpVersion: null,
        a2aVersion: null,
        supportedTrusts: null,
        mcpTools: [],
        mcpPrompts: [],
        mcpResources: [],
        a2aSkills: [],
      },
    }));

    console.info(`SDK sync: fetched ${allAgents.length} agents from SDK`);
  }

  // Get existing agent IDs from Qdrant (optional)
  const existingIds = new Set<string>();
  if (!skipExistingCheck) {
    try {
      const scrollResult = await qdrant.scroll({
        limit: 10000,
      });
      for (const item of scrollResult.items) {
        existingIds.add(item.id);
      }
      console.info(`SDK sync: ${existingIds.size} existing agents in Qdrant`);
    } catch (error) {
      console.warn('SDK sync: could not fetch existing IDs:', error);
    }
  }

  // Process agents in batches (now using unified SubgraphRawAgent array)
  for (let i = 0; i < allAgents.length; i += batchSize) {
    const batch = allAgents.slice(i, i + batchSize);
    const points: Array<{ id: string; vector: number[]; payload: AgentPayload }> = [];

    for (const rawAgent of batch) {
      try {
        // Convert to payload using unified converter
        const payload = subgraphAgentToPayload(rawAgent);

        // Generate embedding text based on whether agent has registration file
        let text: string;
        if (payload.has_registration_file && payload.name && payload.name !== `Agent ${payload.token_id}`) {
          // Full text for agents with registration files
          text = formatAgentText({
            name: payload.name,
            description: payload.description,
            mcpTools: payload.mcp_tools,
            mcpPrompts: payload.mcp_prompts,
            mcpResources: payload.mcp_resources,
            a2aSkills: payload.a2a_skills,
            inputModes: payload.input_modes,
            outputModes: payload.output_modes,
          });
        } else {
          // Minimal text for agents without registration files
          text = `Agent ${payload.chain_id}:${payload.token_id}`;
        }

        // Skip if text is empty
        if (!text.trim()) {
          text = `Agent ${payload.chain_id}:${payload.token_id}`;
        }

        const vector = await generateEmbedding(text, qdrantEnv.VENICE_API_KEY);

        // Generate UUID from agent ID for Qdrant
        const pointId = agentIdToUUID(payload.agent_id);

        const isNew = !existingIds.has(pointId);
        if (isNew) {
          result.newAgents++;
        } else {
          result.updatedAgents++;
        }

        points.push({
          id: pointId,
          vector,
          payload,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Agent ${rawAgent.id}: ${errMsg}`);
      }
    }

    // Upsert batch to Qdrant
    if (points.length > 0) {
      try {
        await qdrant.upsert(points);
        console.info(`SDK sync: upserted batch ${Math.floor(i / batchSize) + 1}, ${points.length} agents`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Batch upsert failed: ${errMsg}`);
      }
    }
  }

  return result;
}
