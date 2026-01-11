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

/** ERC-8004 spec version */
type ERC8004Version = 'v0.4' | 'v1.0';

import { buildSubgraphUrls } from '@/lib/config/graph';

// The Graph API key from agent0-sdk (public key for ERC-8004 subgraphs)
const GRAPH_API_KEY = '00a452ad3cd1900273ea62c1bf283f93';

// Build URLs once at module load
const ALL_SUBGRAPH_URLS = buildSubgraphUrls(GRAPH_API_KEY);

/**
 * Graph endpoints for v1.0 feedback (Jan 2026 update)
 * Only ETH Sepolia has v1.0 contracts deployed currently
 */
const GRAPH_ENDPOINTS_V1_0: Record<number, string> = Object.fromEntries(
  Object.entries(ALL_SUBGRAPH_URLS).filter(([chainId]) => chainId === '11155111')
);

/**
 * Graph endpoints for v0.4 feedback (pre-v1.0 backward compatibility)
 * NOTE: These subgraphs no longer exist after v1.0 spec update
 * Contracts for these chains are pending deployment
 */
const GRAPH_ENDPOINTS_V0_4: Record<number, string> = {
  // All v0.4 subgraphs deprecated - chains pending v1.0 contract deployment
};

/**
 * All Graph endpoints (combined)
 */
const ALL_GRAPH_ENDPOINTS: Record<number, { url: string; version: ERC8004Version }> = {
  ...Object.fromEntries(
    Object.entries(GRAPH_ENDPOINTS_V1_0).map(([k, v]) => [k, { url: v, version: 'v1.0' as const }])
  ),
  ...Object.fromEntries(
    Object.entries(GRAPH_ENDPOINTS_V0_4).map(([k, v]) => [k, { url: v, version: 'v0.4' as const }])
  ),
};

/**
 * Supported chain IDs (all chains with Graph endpoints)
 */
const SUPPORTED_CHAIN_IDS = Object.keys(ALL_GRAPH_ENDPOINTS).map(Number);

/**
 * Raw Feedback entity from The Graph
 * ERC-8004 v1.0 (Jan 26) fields: endpoint, feedbackIndex, feedbackURI, feedbackHash
 */
interface GraphFeedback {
  id: string;
  agent: {
    id: string;
    chainId: string;
    agentId: string;
  };
  clientAddress: string;
  score: string;
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
      score
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
 * GraphQL query for v0.4 feedback (no endpoint, feedbackIndex fields)
 */
const FEEDBACK_QUERY_V0_4 = `
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
      score
      tag1
      tag2
      isRevoked
      createdAt
    }
  }
`;

/**
 * Fetch feedback from The Graph with pagination
 * @param chainId - Chain ID to fetch feedback for
 * @param first - Number of items to fetch
 * @param skip - Number of items to skip
 * @param createdAtGt - Minimum createdAt timestamp
 * @param graphApiKey - Optional Graph API key
 */
async function fetchFeedbackFromGraph(
  chainId: number,
  first: number,
  skip: number,
  createdAtGt: number,
  graphApiKey?: string
): Promise<GraphFeedback[]> {
  const endpoint = ALL_GRAPH_ENDPOINTS[chainId];
  if (!endpoint) {
    console.warn(`No Graph endpoint for chain ${chainId}, skipping feedback sync`);
    return [];
  }

  const query = endpoint.version === 'v1.0' ? FEEDBACK_QUERY_V1_0 : FEEDBACK_QUERY_V0_4;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (graphApiKey) {
    headers.Authorization = `Bearer ${graphApiKey}`;
  }

  const response = await fetchWithTimeout(
    endpoint.url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
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
    throw new Error(`Graph API error for chain ${chainId}: ${response.status} ${response.statusText}`);
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
 * Convert Graph feedback score to 0-100 range
 * The Graph stores score as string, typically 0-100
 */
function normalizeScore(score: string): number {
  const numScore = Number.parseInt(score, 10);
  // Clamp to 0-100 range
  return Math.max(0, Math.min(100, numScore));
}

/**
 * Build tags array from tag1 and tag2 fields
 */
function buildTags(tag1: string | null, tag2: string | null): string[] {
  const tags: string[] = [];
  const trimmed1 = tag1?.trim();
  const trimmed2 = tag2?.trim();
  if (trimmed1) {
    tags.push(trimmed1);
  }
  if (trimmed2) {
    tags.push(trimmed2);
  }
  return tags;
}

/**
 * Convert Unix timestamp to ISO string
 */
function timestampToIso(timestamp: string): string {
  const ts = Number.parseInt(timestamp, 10);
  return new Date(ts * 1000).toISOString();
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
 * @returns true if feedback was added, false if skipped
 */
async function processFeedback(
  db: D1Database,
  reputationService: ReputationService,
  feedback: GraphFeedback
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

  // Build feedback entry
  const newFeedback: NewFeedback = {
    agent_id: agentId,
    chain_id: chainId,
    score: normalizeScore(feedback.score),
    tags: JSON.stringify(buildTags(feedback.tag1, feedback.tag2)),
    context: undefined, // Graph feedback doesn't have context field
    feedback_uri: feedback.feedbackURI ?? undefined,
    feedback_hash: feedback.feedbackHash ?? undefined,
    submitter: feedback.clientAddress,
    eas_uid: toGraphFeedbackUid(feedback.id), // Use eas_uid for dedup with "graph:" prefix
    tx_id: undefined, // Transaction hash not available from Graph
    // ERC-8004 v1.0 fields
    feedback_index: feedback.feedbackIndex ? Number.parseInt(feedback.feedbackIndex, 10) : undefined,
    endpoint: feedback.endpoint ?? undefined,
    submitted_at: timestampToIso(feedback.createdAt),
  };

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
  result: GraphFeedbackSyncResult
): Promise<number> {
  let latestCreatedAt = 0;

  for (const feedback of feedbackBatch) {
    result.feedbackProcessed++;

    // Track latest createdAt for sync state
    const createdAtNum = Number.parseInt(feedback.createdAt, 10);
    if (createdAtNum > latestCreatedAt) {
      latestCreatedAt = createdAtNum;
    }

    const status = await processFeedback(db, reputationService, feedback);
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
 *
 * @param db - D1 database instance
 * @param env - Environment variables containing optional GRAPH_API_KEY
 * @returns Sync result with counts and status
 */
export async function syncFeedbackFromGraph(
  db: D1Database,
  env?: { GRAPH_API_KEY?: string }
): Promise<GraphFeedbackSyncResult> {
  const reputationService = createReputationService(db);

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
      const endpoint = ALL_GRAPH_ENDPOINTS[chainId];
      if (!endpoint) continue;

      console.info(`Graph feedback sync: syncing chain ${chainId} (${endpoint.version})...`);

      let hasMore = true;
      let skip = 0;
      const first = 1000;
      let chainFeedbackCount = 0;

      while (hasMore) {
        // Fetch batch of feedback for this chain
        const feedbackBatch = await fetchFeedbackFromGraph(
          chainId,
          first,
          skip,
          lastCreatedAt,
          env?.GRAPH_API_KEY
        );

        if (feedbackBatch.length === 0) {
          hasMore = false;
          break;
        }

        console.info(
          `Graph feedback sync: chain ${chainId} - processing batch of ${feedbackBatch.length} feedback entries`
        );

        const batchLatest = await processBatch(db, reputationService, feedbackBatch, result);
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
