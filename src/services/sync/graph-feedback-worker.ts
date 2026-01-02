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
 * - feedbackUri: URI to additional feedback data
 * - isRevoked: Whether the feedback has been revoked
 * - createdAt: Unix timestamp when feedback was created
 *
 * @module services/sync/graph-feedback-worker
 */

import type { NewFeedback } from '@/db/schema';
import { fetchWithTimeout } from '@/lib/utils/fetch';
import type { ReputationService } from '../reputation';
import { createReputationService } from '../reputation';

/**
 * The Graph gateway endpoint for ERC-8004 Reputation Registry
 */
const GRAPH_GATEWAY_URL =
  'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT';

/**
 * Supported chain IDs
 * - 11155111: Ethereum Sepolia
 * - 84532: Base Sepolia
 * - 80002: Polygon Amoy
 * - 59141: Linea Sepolia
 * - 296: Hedera Testnet
 * - 998: HyperEVM Testnet
 * - 1351057110: SKALE Base Sepolia
 */
const SUPPORTED_CHAIN_IDS = [
  11155111, 84532, 80002, 59141, 296, 998, 1351057110,
] as const;

/**
 * Raw Feedback entity from The Graph
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
  feedbackUri: string | null;
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
 * GraphQL query for fetching feedback from The Graph
 * Orders by createdAt ascending to process oldest first and paginate efficiently
 */
const FEEDBACK_QUERY = `
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
      feedbackUri
      isRevoked
      createdAt
    }
  }
`;

/**
 * Fetch feedback from The Graph with pagination
 */
async function fetchFeedbackFromGraph(
  first: number,
  skip: number,
  createdAtGt: number
): Promise<GraphFeedback[]> {
  const response = await fetchWithTimeout(
    GRAPH_GATEWAY_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: FEEDBACK_QUERY,
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
    throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as {
    data?: { feedbacks: GraphFeedback[] };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    const firstError = result.errors[0];
    throw new Error(`Graph query error: ${firstError?.message ?? 'Unknown error'}`);
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
    feedback_uri: feedback.feedbackUri ?? undefined,
    submitter: feedback.clientAddress,
    eas_uid: toGraphFeedbackUid(feedback.id), // Use eas_uid for dedup with "graph:" prefix
    tx_id: undefined, // Transaction hash not available from Graph
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
 * @param _env - Environment variables (unused, kept for signature consistency)
 * @returns Sync result with counts and status
 */
export async function syncFeedbackFromGraph(
  db: D1Database,
  _env?: Record<string, unknown>
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

    let hasMore = true;
    let skip = 0;
    const first = 1000;
    let latestCreatedAt = lastCreatedAt;

    console.info(`Graph feedback sync: starting from createdAt > ${lastCreatedAt}`);

    while (hasMore) {
      // Fetch batch of feedback
      const feedbackBatch = await fetchFeedbackFromGraph(first, skip, lastCreatedAt);

      if (feedbackBatch.length === 0) {
        hasMore = false;
        break;
      }

      console.info(
        `Graph feedback sync: processing batch of ${feedbackBatch.length} feedback entries`
      );

      const batchLatest = await processBatch(db, reputationService, feedbackBatch, result);
      if (batchLatest > latestCreatedAt) {
        latestCreatedAt = batchLatest;
      }

      skip += feedbackBatch.length;
      hasMore = feedbackBatch.length === first;

      // Safety limit to prevent infinite loops
      if (skip > 50000) {
        console.warn('Graph feedback sync: reached safety limit of 50000 entries');
        break;
      }
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
