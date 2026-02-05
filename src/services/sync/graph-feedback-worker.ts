/**
 * Graph Feedback Sync Worker
 *
 * Syncs agent feedback from The Graph subgraph (ERC-8004 Reputation Registry)
 * to the D1 database. Handles deduplication and reputation aggregation.
 *
 * The Graph subgraph provides Feedback entities with:
 * - id: Unique identifier in format "chainId-feedbackIndex"
 * - agent: Agent entity reference with id "chainId-tokenId"
 * - clientAddress: Address that submitted the feedback
 * - score: Feedback score (0-100)
 * - tag1: Primary tag (e.g., "reachability_a2a", "reachability_mcp")
 * - tag2: Secondary tag (optional)
 * - endpoint: Service endpoint reference (ERC-8004 v1.0)
 * - feedbackIndex: Per-client feedback index (ERC-8004 v1.0)
 * - isRevoked: Whether the feedback has been revoked
 * - createdAt: Unix timestamp when feedback was created
 *
 * @module services/sync/graph-feedback-worker
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { NewFeedback } from '@/db/schema';
import { fetchWithTimeout } from '@/lib/utils/fetch';
import type { ReputationService } from '../reputation';
import { createReputationService } from '../reputation';
import { createQdrantClient, type QdrantClient } from '../qdrant';

import {
  executeWithChainKey,
  SUBGRAPH_IDS,
} from '@/lib/config/graph';

/**
 * Supported chain IDs with deployed v1.0 contracts and subgraphs
 * Updated February 2026 with all deployed chains
 */
const SUPPORTED_CHAIN_IDS: number[] = [
  // Mainnets
  1,        // Ethereum Mainnet
  137,      // Polygon Mainnet
  8453,     // Base Mainnet
  56,       // BSC Mainnet
  143,      // Monad Mainnet
  // Testnets
  11155111, // Ethereum Sepolia
  84532,    // Base Sepolia
  97,       // BSC Testnet
  10143,    // Monad Testnet
];

/**
 * Raw Feedback entity from The Graph
 * ERC-8004 v1.0 (Jan 26) fields: endpoint, feedbackIndex, feedbackURI, feedbackHash
 * ERC-8004 v1.0 (Mainnet Readiness): value replaces score (BigDecimal computed from int128 + uint8)
 */
interface GraphFeedback {
  id: string;
  agent: {
    id: string;
    chainId: string;
    agentId: string;
  };
  clientAddress: string;
  /**
   * Feedback value as BigDecimal string.
   * The subgraph computes this from raw value (int128) and valueDecimals (uint8).
   * Typically in 0-100 range for backward compatibility.
   */
  value: string;
  tag1: string | null;
  tag2: string | null;
  /** Service endpoint reference (ERC-8004 v1.0) */
  endpoint: string | null;
  /** Per-client feedback index (ERC-8004 v1.0) */
  feedbackIndex: string | null;
  /** URI to off-chain feedback content (IPFS or HTTPS) */
  feedbackURI: string | null;
  /** KECCAK-256 hash of feedback content */
  feedbackHash: string | null;
  isRevoked: boolean;
  createdAt: string;
}

/**
 * Result of a feedback sync operation
 */
export interface GraphFeedbackSyncResult {
  success: boolean;
  feedbackProcessed: number;
  newFeedbackCount: number;
  revokedCount: number;
  lastCreatedAt: string | null;
  error?: string;
}

/**
 * Sync state for graph feedback
 */
interface GraphFeedbackSyncState {
  last_graph_feedback_sync: string | null;
  last_feedback_created_at: string | null;
  feedback_synced: number;
}

/**
 * GraphQL query for v1.0 feedback (includes endpoint, feedbackIndex, feedbackURI, feedbackHash)
 * ERC-8004 Mainnet Readiness: Uses `value` (BigDecimal) instead of deprecated `score` field
 */
const FEEDBACK_QUERY_V1_0 = `
  query GetFeedback($first: Int!, $skip: Int!, $createdAtGt: BigInt!) {
    feedbacks(
      first: $first
      skip: $skip
      orderBy: createdAt
      orderDirection: asc
      where: {
        createdAt_gt: $createdAtGt
        isRevoked: false
      }
    ) {
      id
      agent {
        id
        chainId
        agentId
      }
      clientAddress
      value
      tag1
      tag2
      endpoint
      feedbackIndex
      feedbackURI
      feedbackHash
      isRevoked
      createdAt
    }
  }
`;

/**
 * Fetch feedback from The Graph with pagination
 * Uses chain-specific API keys with optional user key fallback
 * @param chainId - Chain ID to fetch feedback for
 * @param userKey - Optional user-provided API key for fallback
 * @param first - Number of items to fetch
 * @param skip - Number of items to skip
 * @param createdAtGt - Minimum createdAt timestamp
 */
async function fetchFeedbackFromGraph(
  chainId: number,
  userKey: string | undefined,
  first: number,
  skip: number,
  createdAtGt: number
): Promise<GraphFeedback[]> {
  // Check if chain has a subgraph deployment
  if (!(chainId in SUBGRAPH_IDS)) {
    console.warn(`No Graph subgraph for chain ${chainId}, skipping feedback sync`);
    return [];
  }

  // Use chain-specific key with user key fallback
  return executeWithChainKey(chainId, userKey, async (endpoint) => {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: FEEDBACK_QUERY_V1_0,
          variables: {
            first,
            skip,
            createdAtGt: createdAtGt.toString(),
          },
        }),
      },
      30_000 // 30 second timeout
    );

    if (!response.ok) {
      throw new Error(`Graph API error ${response.status} for chain ${chainId}: ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: { feedbacks: GraphFeedback[] };
      errors?: Array<{ message: string }>;
    };

    if (result.errors?.length) {
      const firstError = result.errors[0];
      throw new Error(`Graph query error for chain ${chainId}: ${firstError?.message ?? 'Unknown error'}`);
    }

    return result.data?.feedbacks ?? [];
  });
}

/**
 * Convert Graph feedback ID to a unique identifier for deduplication
 * Format: "graph:{chainId}-{feedbackIndex}"
 */
function toGraphFeedbackUid(graphId: string): string {
  return `graph:${graphId}`;
}

/**
 * Parse agent ID from Graph agent entity
 * Graph format: "chainId-tokenId" -> Our format: "chainId:tokenId"
 */
function parseAgentId(agent: GraphFeedback['agent']): { agentId: string; chainId: number } {
  const chainId = Number.parseInt(agent.chainId, 10);
  const tokenId = agent.agentId;
  return {
    agentId: `${chainId}:${tokenId}`,
    chainId,
  };
}

/**
 * Convert Graph feedback value to 0-100 range
 * ERC-8004 Mainnet Readiness: The subgraph now provides `value` as BigDecimal
 * (computed from int128 value and uint8 valueDecimals on the contract).
 * The value is typically in 0-100 range for backward compatibility.
 *
 * @param value - BigDecimal string from subgraph (e.g., "85", "85.5", "100.0")
 * @returns Normalized integer score in 0-100 range
 */
function normalizeValue(value: string): number {
  // Parse as float to handle BigDecimal format
  const numValue = Number.parseFloat(value);

  // Handle NaN (invalid input)
  if (Number.isNaN(numValue)) {
    console.warn(`normalizeValue: Invalid value "${value}", defaulting to 0`);
    return 0;
  }

  // Round to nearest integer and clamp to 0-100 range
  return Math.max(0, Math.min(100, Math.round(numValue)));
}

/**
 * Normalize a tag value - handles both bytes32 hex strings and regular strings
 * In v0.4, tags were bytes32 encoded, in v1.0 they're regular strings
 * bytes32 format: 0x + 64 hex chars, null-padded ASCII
 */
function normalizeTag(tag: string | null): string | null {
  if (!tag) return null;
  const trimmed = tag.trim();
  if (!trimmed) return null;

  // Check if it's a bytes32 hex string (0x + 64 hex chars)
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    try {
      // Remove 0x prefix and decode hex pairs to ASCII
      const hex = trimmed.slice(2);
      let decoded = '';
      for (let i = 0; i < hex.length; i += 2) {
        const byte = Number.parseInt(hex.slice(i, i + 2), 16);
        // Stop at null byte (end of string in bytes32)
        if (byte === 0) break;
        decoded += String.fromCharCode(byte);
      }
      return decoded || null;
    } catch {
      // If decoding fails, return original
      return trimmed;
    }
  }

  return trimmed;
}

/**
 * Build tags array from tag1 and tag2 fields
 * Normalizes both bytes32 hex strings (v0.4) and regular strings (v1.0)
 */
function buildTags(tag1: string | null, tag2: string | null): string[] {
  return [normalizeTag(tag1), normalizeTag(tag2)].filter(
    (tag): tag is string => tag !== null
  );
}

/**
 * Convert Unix timestamp to ISO string
 */
function timestampToIso(timestamp: string): string {
  const ts = Number.parseInt(timestamp, 10);
  return new Date(ts * 1000).toISOString();
}

/**
 * Validate Ethereum address format (0x + 40 hex chars)
 */
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate and sanitize a string field from external data
 * @param value - The string value to validate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Field name for logging
 * @returns Sanitized string or undefined if invalid
 */
function sanitizeExternalString(
  value: string | null | undefined,
  maxLength: number,
  fieldName: string
): string | undefined {
  if (!value) return undefined;
  if (value.length > maxLength) {
    console.warn(
      `Graph feedback sync: ${fieldName} exceeds max length (${value.length} > ${maxLength}), truncating`
    );
    return value.slice(0, maxLength);
  }
  return value;
}

/**
 * Reachability tags from watchtower
 * These tags indicate the feedback is a reachability attestation.
 *
 * Supports two formats:
 * - Legacy: tag1="reachability_mcp" or tag1="reachability_a2a"
 * - Watchtower v1: tag1="reachable", tag2="mcp" or tag2="a2a" or tag2="web"
 */
const REACHABILITY_TAGS = {
  MCP: 'reachability_mcp',
  A2A: 'reachability_a2a',
  /** Watchtower v1 uses a generic tag1 with protocol in tag2 */
  REACHABLE: 'reachable',
} as const;

/**
 * STAR feedback threshold (score >= 90 is considered a high-quality endorsement)
 * Feedback with scores at or above this threshold marks the submitter as a curator
 */
const STAR_SCORE_THRESHOLD = 90;

/**
 * Determine the reachability protocol from feedback tags.
 *
 * Supports two formats:
 * - Legacy: tag1="reachability_mcp" or tag1="reachability_a2a"
 * - Watchtower v1: tag1="reachable", tag2="mcp" or tag2="a2a" or tag2="web"
 *
 * @returns 'mcp' | 'a2a' | 'web' | null
 */
function getReachabilityProtocol(feedback: GraphFeedback): 'mcp' | 'a2a' | 'web' | null {
  if (!feedback.tag1) return null;

  const tag1Lower = feedback.tag1.toLowerCase();

  // Legacy format: tag1 contains the full reachability type
  if (tag1Lower === REACHABILITY_TAGS.MCP) return 'mcp';
  if (tag1Lower === REACHABILITY_TAGS.A2A) return 'a2a';

  // Watchtower v1 format: tag1="reachable", tag2 specifies protocol
  if (tag1Lower === REACHABILITY_TAGS.REACHABLE && feedback.tag2) {
    const tag2Lower = feedback.tag2.toLowerCase();
    if (tag2Lower === 'mcp') return 'mcp';
    if (tag2Lower === 'a2a') return 'a2a';
    if (tag2Lower === 'web') return 'web';
  }

  return null;
}

/**
 * Check if feedback is a reachability attestation and update Qdrant payload
 * Supports both legacy (tag1="reachability_mcp") and watchtower v1 (tag1="reachable", tag2="mcp") formats.
 *
 * @param qdrant - Qdrant client for updating payloads
 * @param agentId - Agent ID in format chainId:tokenId
 * @param feedback - Graph feedback entry
 * @returns true if this was a reachability attestation
 */
async function processReachabilityAttestation(
  qdrant: QdrantClient | null,
  agentId: string,
  feedback: GraphFeedback
): Promise<boolean> {
  if (!qdrant) return false;

  const protocol = getReachabilityProtocol(feedback);
  if (!protocol) return false;

  const timestamp = timestampToIso(feedback.createdAt);
  const attestor = feedback.clientAddress;

  try {
    if (protocol === 'mcp') {
      await qdrant.setPayloadByAgentId(agentId, {
        last_reachability_check_mcp: timestamp,
        reachability_attestor: attestor,
        is_reachable_mcp: true,
      });
      console.info(`Reachability: Updated MCP for ${agentId} from attestor ${attestor}`);
    } else if (protocol === 'a2a') {
      await qdrant.setPayloadByAgentId(agentId, {
        last_reachability_check_a2a: timestamp,
        reachability_attestor: attestor,
        is_reachable_a2a: true,
      });
      console.info(`Reachability: Updated A2A for ${agentId} from attestor ${attestor}`);
    } else if (protocol === 'web') {
      await qdrant.setPayloadByAgentId(agentId, {
        last_reachability_check_web: timestamp,
        reachability_attestor: attestor,
        is_reachable_web: true,
      });
      console.info(`Reachability: Updated Web for ${agentId} from attestor ${attestor}`);
    }

    return true;
  } catch (error) {
    console.warn(
      `Reachability: Failed to update ${protocol} for ${agentId}:`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

/**
 * Process STAR feedback for curation tracking
 * STAR feedback (score >= 90) adds the submitter to the agent's curators list
 *
 * @param qdrant - Qdrant client for updating payloads
 * @param agentId - Agent ID in format chainId:tokenId
 * @param feedback - Graph feedback entry
 * @returns true if this was STAR feedback and curation was updated
 */
async function processCurationFeedback(
  qdrant: QdrantClient | null,
  agentId: string,
  feedback: GraphFeedback
): Promise<boolean> {
  if (!qdrant) return false;

  const score = normalizeValue(feedback.value);

  // Only process STAR feedback (high score endorsements)
  if (score < STAR_SCORE_THRESHOLD) {
    return false;
  }

  const curatorAddress = feedback.clientAddress.toLowerCase();

  try {
    // Get current curators list
    const existingAgent = await qdrant.getByAgentId(agentId);
    const currentCurators: string[] = existingAgent?.payload?.curated_by ?? [];

    // Add curator if not already in list
    if (!currentCurators.includes(curatorAddress)) {
      const updatedCurators = [...currentCurators, curatorAddress];

      await qdrant.setPayloadByAgentId(agentId, {
        curated_by: updatedCurators,
        is_curated: true,
      });

      console.info(
        `Curation: Added curator ${curatorAddress} to ${agentId} (score: ${score}, total curators: ${updatedCurators.length})`
      );
    }

    return true;
  } catch (error) {
    console.warn(
      `Curation: Failed to update curators for ${agentId}:`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

/**
 * Get current sync state from D1
 */
async function getSyncState(db: D1Database): Promise<GraphFeedbackSyncState | null> {
  const result = await db
    .prepare(
      'SELECT last_graph_feedback_sync, last_feedback_created_at, feedback_synced FROM qdrant_sync_state WHERE id = ?'
    )
    .bind('global')
    .first<GraphFeedbackSyncState>();

  return result;
}

/**
 * Update sync state in D1
 */
async function updateSyncState(
  db: D1Database,
  lastFeedbackCreatedAt: string | null,
  feedbackSynced: number,
  error: string | null
): Promise<void> {
  await db
    .prepare(
      `UPDATE qdrant_sync_state
       SET last_graph_feedback_sync = datetime('now'),
           last_feedback_created_at = COALESCE(?, last_feedback_created_at),
           feedback_synced = feedback_synced + ?,
           last_error = ?,
           updated_at = datetime('now')
       WHERE id = 'global'`
    )
    .bind(lastFeedbackCreatedAt, feedbackSynced, error)
    .run();
}

/**
 * Check if feedback with graph ID already exists
 */
async function feedbackExistsByGraphId(db: D1Database, graphId: string): Promise<boolean> {
  const uid = toGraphFeedbackUid(graphId);
  const result = await db
    .prepare('SELECT 1 FROM agent_feedback WHERE eas_uid = ? LIMIT 1')
    .bind(uid)
    .first();

  return result !== null;
}

/**
 * Process a single feedback entry
 * @param qdrant - Optional Qdrant client for reachability attestation updates
 * @returns status indicating what happened with this feedback
 */
async function processFeedback(
  db: D1Database,
  reputationService: ReputationService,
  feedback: GraphFeedback,
  qdrant: QdrantClient | null = null
): Promise<'added' | 'exists' | 'unsupported' | 'revoked'> {
  // Skip revoked feedback (should be filtered by query, but double-check)
  if (feedback.isRevoked) {
    return 'revoked';
  }

  // Check if already processed
  const exists = await feedbackExistsByGraphId(db, feedback.id);
  if (exists) {
    return 'exists';
  }

  // Parse and validate
  const { agentId, chainId } = parseAgentId(feedback.agent);

  // Verify chain is supported
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as (typeof SUPPORTED_CHAIN_IDS)[number])) {
    console.warn(`Graph feedback sync: skipping feedback for unsupported chain ${chainId}`);
    return 'unsupported';
  }

  // Validate clientAddress is a valid Ethereum address
  if (!isValidEthereumAddress(feedback.clientAddress)) {
    console.warn(
      `Graph feedback sync: invalid clientAddress "${feedback.clientAddress}" for feedback ${feedback.id}, skipping`
    );
    return 'unsupported';
  }

  // Sanitize external string fields with max length limits
  const MAX_URI_LENGTH = 2048;
  const MAX_ENDPOINT_LENGTH = 512;
  const MAX_HASH_LENGTH = 66; // 0x + 64 hex chars

  // Build feedback entry with validated/sanitized data
  const newFeedback: NewFeedback = {
    agent_id: agentId,
    chain_id: chainId,
    score: normalizeValue(feedback.value),
    tags: JSON.stringify(buildTags(feedback.tag1, feedback.tag2)),
    context: undefined, // Graph feedback doesn't have context field
    feedback_uri: sanitizeExternalString(feedback.feedbackURI, MAX_URI_LENGTH, 'feedbackURI'),
    feedback_hash: sanitizeExternalString(feedback.feedbackHash, MAX_HASH_LENGTH, 'feedbackHash'),
    submitter: feedback.clientAddress.toLowerCase(), // Normalize to lowercase
    eas_uid: toGraphFeedbackUid(feedback.id), // Use eas_uid for dedup with "graph:" prefix
    tx_id: undefined, // Transaction hash not available from Graph
    // ERC-8004 v1.0 fields
    feedback_index: feedback.feedbackIndex ? Number.parseInt(feedback.feedbackIndex, 10) : undefined,
    endpoint: sanitizeExternalString(feedback.endpoint, MAX_ENDPOINT_LENGTH, 'endpoint'),
    submitted_at: timestampToIso(feedback.createdAt),
  };

  // Gap 6: Check if this is a reachability attestation and update Qdrant payload
  await processReachabilityAttestation(qdrant, agentId, feedback);

  // Process STAR feedback for curation tracking (score >= 90)
  await processCurationFeedback(qdrant, agentId, feedback);

  // Add feedback (this also updates reputation incrementally)
  await reputationService.addFeedback(newFeedback);
  return 'added';
}

/**
 * Process a batch of feedback entries
 */
async function processBatch(
  db: D1Database,
  reputationService: ReputationService,
  feedbackBatch: GraphFeedback[],
  result: GraphFeedbackSyncResult,
  qdrant: QdrantClient | null = null
): Promise<number> {
  let latestCreatedAt = 0;

  for (const feedback of feedbackBatch) {
    result.feedbackProcessed++;

    // Track latest createdAt for sync state
    const createdAtNum = Number.parseInt(feedback.createdAt, 10);
    if (createdAtNum > latestCreatedAt) {
      latestCreatedAt = createdAtNum;
    }

    const status = await processFeedback(db, reputationService, feedback, qdrant);
    if (status === 'added') {
      result.newFeedbackCount++;
    } else if (status === 'revoked') {
      result.revokedCount++;
    }
  }

  return latestCreatedAt;
}

/**
 * Sync feedback from The Graph to D1
 *
 * This worker:
 * 1. Fetches feedback from The Graph subgraph (all chains in single endpoint)
 * 2. Deduplicates by graph feedback ID (stored in eas_uid with "graph:" prefix)
 * 3. Filters out revoked feedback
 * 4. Stores in agent_feedback table
 * 5. Updates agent_reputation aggregates
 * 6. (Gap 6) Updates Qdrant reachability attestations from watchtower feedback
 *
 * @param db - D1 database instance
 * @param env - Environment variables containing GRAPH_API_KEY and Qdrant config
 * @returns Sync result with counts and status
 */
export async function syncFeedbackFromGraph(
  db: D1Database,
  env?: {
    GRAPH_API_KEY?: string;
    // Gap 6: Qdrant config for reachability attestation updates
    QDRANT_URL?: string;
    QDRANT_API_KEY?: string;
    QDRANT_COLLECTION?: string;
  }
): Promise<GraphFeedbackSyncResult> {
  const reputationService = createReputationService(db);

  // User-provided API key for fallback (chain-specific SDK keys are used by default)
  const userKey = env?.GRAPH_API_KEY;

  // Gap 6: Create Qdrant client if config available (for reachability attestation updates)
  const qdrant =
    env?.QDRANT_URL && env?.QDRANT_API_KEY
      ? createQdrantClient({
          QDRANT_URL: env.QDRANT_URL,
          QDRANT_API_KEY: env.QDRANT_API_KEY,
          QDRANT_COLLECTION: env.QDRANT_COLLECTION,
        })
      : null;

  const result: GraphFeedbackSyncResult = {
    success: true,
    feedbackProcessed: 0,
    newFeedbackCount: 0,
    revokedCount: 0,
    lastCreatedAt: null,
  };

  try {
    // Get last sync state
    const syncState = await getSyncState(db);
    const lastCreatedAt = syncState?.last_feedback_created_at
      ? Math.floor(new Date(syncState.last_feedback_created_at).getTime() / 1000)
      : 0;

    let latestCreatedAt = lastCreatedAt;

    console.info(`Graph feedback sync: starting from createdAt > ${lastCreatedAt}`);

    // Sync feedback from all chains
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      // Check if chain has a subgraph deployment
      if (!(chainId in SUBGRAPH_IDS)) continue;

      console.info(`Graph feedback sync: syncing chain ${chainId}...`);

      let hasMore = true;
      let skip = 0;
      const first = 1000;
      let chainFeedbackCount = 0;

      while (hasMore) {
        // Fetch batch of feedback for this chain
        const feedbackBatch = await fetchFeedbackFromGraph(
          chainId,
          userKey,
          first,
          skip,
          lastCreatedAt
        );

        if (feedbackBatch.length === 0) {
          hasMore = false;
          break;
        }

        console.info(
          `Graph feedback sync: chain ${chainId} - processing batch of ${feedbackBatch.length} feedback entries`
        );

        const batchLatest = await processBatch(db, reputationService, feedbackBatch, result, qdrant);
        if (batchLatest > latestCreatedAt) {
          latestCreatedAt = batchLatest;
        }

        chainFeedbackCount += feedbackBatch.length;
        skip += feedbackBatch.length;
        hasMore = feedbackBatch.length === first;

        // Safety limit per chain
        if (skip > 10000) {
          console.warn(`Graph feedback sync: chain ${chainId} reached safety limit of 10000 entries`);
          break;
        }
      }

      console.info(`Graph feedback sync: chain ${chainId} - synced ${chainFeedbackCount} entries`);
    }

    // Update sync state
    result.lastCreatedAt =
      latestCreatedAt > 0 ? new Date(latestCreatedAt * 1000).toISOString() : null;

    await updateSyncState(db, result.lastCreatedAt, result.newFeedbackCount, null);

    console.info(
      `Graph feedback sync complete: ${result.feedbackProcessed} processed, ${result.newFeedbackCount} new, ${result.revokedCount} revoked`
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Graph feedback sync failed:', errorMessage);

    // Update sync state with error
    await updateSyncState(db, null, 0, errorMessage);

    return {
      success: false,
      feedbackProcessed: result.feedbackProcessed,
      newFeedbackCount: result.newFeedbackCount,
      revokedCount: result.revokedCount,
      lastCreatedAt: result.lastCreatedAt,
      error: errorMessage,
    };
  }
}
