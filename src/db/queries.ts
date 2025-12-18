/**
 * Database query functions
 * @module db/queries
 */

import type {
  AgentClassificationRow,
  AgentFeedbackRow,
  AgentReputationRow,
  ClassificationQueueRow,
  EasSyncStateRow,
  NewClassification,
  NewFeedback,
  NewReputation,
  QueueStatus,
} from './schema';

/**
 * Maximum number of placeholders in a single SQLite query.
 * SQLite has a limit of 999 host parameters (SQLITE_MAX_VARIABLE_NUMBER).
 * We use 500 to leave margin for other parameters in complex queries.
 */
const MAX_BATCH_SIZE = 500;

/**
 * Get classification for an agent
 */
export async function getClassification(
  db: D1Database,
  agentId: string
): Promise<AgentClassificationRow | null> {
  const result = await db
    .prepare('SELECT * FROM agent_classifications WHERE agent_id = ?')
    .bind(agentId)
    .first<AgentClassificationRow>();

  return result;
}

/**
 * Get classifications for multiple agents with automatic chunking
 * Returns a Map for O(1) lookup by agentId
 * Handles SQLite's 999 placeholder limit by chunking large queries
 */
export async function getClassificationsBatch(
  db: D1Database,
  agentIds: string[]
): Promise<Map<string, AgentClassificationRow>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const classificationsMap = new Map<string, AgentClassificationRow>();

  // Process in chunks to avoid SQLite placeholder limit
  for (let i = 0; i < agentIds.length; i += MAX_BATCH_SIZE) {
    const chunk = agentIds.slice(i, i + MAX_BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const query = `SELECT * FROM agent_classifications WHERE agent_id IN (${placeholders})`;

    const result = await db
      .prepare(query)
      .bind(...chunk)
      .all<AgentClassificationRow>();

    // Add results to map
    for (const row of result.results) {
      classificationsMap.set(row.agent_id, row);
    }
  }

  return classificationsMap;
}

/**
 * Get classifications by chain ID with pagination
 */
export async function getClassificationsByChain(
  db: D1Database,
  chainId: number,
  limit: number,
  offset: number
): Promise<AgentClassificationRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM agent_classifications
       WHERE chain_id = ?
       ORDER BY classified_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(chainId, limit, offset)
    .all<AgentClassificationRow>();

  return result.results;
}

/**
 * Get all classifications with pagination
 */
export async function getAllClassifications(
  db: D1Database,
  limit: number,
  offset: number
): Promise<AgentClassificationRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM agent_classifications
       ORDER BY classified_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<AgentClassificationRow>();

  return result.results;
}

/**
 * Insert or update a classification
 */
export async function upsertClassification(
  db: D1Database,
  classification: NewClassification
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_classifications
       (agent_id, chain_id, skills, domains, confidence, model_version, classified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET
         skills = excluded.skills,
         domains = excluded.domains,
         confidence = excluded.confidence,
         model_version = excluded.model_version,
         classified_at = excluded.classified_at,
         updated_at = datetime('now')`
    )
    .bind(
      classification.agent_id,
      classification.chain_id,
      classification.skills,
      classification.domains,
      classification.confidence,
      classification.model_version,
      classification.classified_at
    )
    .run();
}

/**
 * Delete a classification
 */
export async function deleteClassification(db: D1Database, agentId: string): Promise<void> {
  await db.prepare('DELETE FROM agent_classifications WHERE agent_id = ?').bind(agentId).run();
}

/**
 * Get classification count by chain
 */
export async function getClassificationCountByChain(
  db: D1Database,
  chainId: number
): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM agent_classifications WHERE chain_id = ?')
    .bind(chainId)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

/**
 * Get total classification count
 */
export async function getTotalClassificationCount(db: D1Database): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM agent_classifications')
    .first<{ count: number }>();

  return result?.count ?? 0;
}

// ============================================================================
// Queue Queries
// ============================================================================

/**
 * Enqueue a classification job (only if no pending job exists)
 */
export async function enqueueClassification(db: D1Database, agentId: string): Promise<string> {
  const id = crypto.randomUUID().replace(/-/g, '');

  await db
    .prepare(
      `INSERT INTO classification_queue (id, agent_id, status)
       VALUES (?, ?, 'pending')`
    )
    .bind(id, agentId)
    .run();

  return id;
}

/**
 * Enqueue classification for multiple agents in a single operation
 * Skips agents that already have pending/processing jobs OR already have classifications
 * Handles SQLite's 999 placeholder limit by chunking large queries
 * @returns Array of agent IDs that were actually enqueued
 */
export async function enqueueClassificationsBatch(
  db: D1Database,
  agentIds: string[]
): Promise<string[]> {
  if (agentIds.length === 0) return [];

  const existingSet = new Set<string>();

  // 1. Skip agents with pending/processing jobs in queue
  for (let i = 0; i < agentIds.length; i += MAX_BATCH_SIZE) {
    const chunk = agentIds.slice(i, i + MAX_BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const existingJobs = await db
      .prepare(
        `SELECT agent_id FROM classification_queue
         WHERE agent_id IN (${placeholders})
         AND status IN ('pending', 'processing')`
      )
      .bind(...chunk)
      .all<{ agent_id: string }>();

    for (const r of existingJobs.results) {
      existingSet.add(r.agent_id);
    }
  }

  // 2. Skip agents that already have classifications in DB
  // This prevents re-classification when getClassificationsBatch temporarily fails
  for (let i = 0; i < agentIds.length; i += MAX_BATCH_SIZE) {
    const chunk = agentIds.slice(i, i + MAX_BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const existingClassifications = await db
      .prepare(
        `SELECT agent_id FROM agent_classifications
         WHERE agent_id IN (${placeholders})`
      )
      .bind(...chunk)
      .all<{ agent_id: string }>();

    for (const r of existingClassifications.results) {
      existingSet.add(r.agent_id);
    }
  }

  const toEnqueue = agentIds.filter((id) => !existingSet.has(id));

  if (toEnqueue.length === 0) return [];

  // Insert new jobs in batch (D1 batch limit is separate from placeholder limit)
  const insertStatements = toEnqueue.map((agentId) => {
    const id = crypto.randomUUID().replace(/-/g, '');
    return db
      .prepare(
        `INSERT INTO classification_queue (id, agent_id, status)
         VALUES (?, ?, 'pending')`
      )
      .bind(id, agentId);
  });

  await db.batch(insertStatements);
  return toEnqueue;
}

/**
 * Get queue status for an agent
 */
export async function getQueueStatus(
  db: D1Database,
  agentId: string
): Promise<ClassificationQueueRow | null> {
  const result = await db
    .prepare(
      `SELECT * FROM classification_queue
       WHERE agent_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(agentId)
    .first<ClassificationQueueRow>();

  return result;
}

/**
 * Get pending jobs for processing
 */
export async function getPendingJobs(
  db: D1Database,
  limit: number
): Promise<ClassificationQueueRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM classification_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .bind(limit)
    .all<ClassificationQueueRow>();

  return result.results;
}

/**
 * Update queue job status
 */
export async function updateQueueStatus(
  db: D1Database,
  id: string,
  status: QueueStatus,
  error?: string
): Promise<void> {
  if (error) {
    await db
      .prepare(
        `UPDATE classification_queue
         SET status = ?, error = ?, processed_at = datetime('now')
         WHERE id = ?`
      )
      .bind(status, error, id)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE classification_queue
         SET status = ?, processed_at = datetime('now')
         WHERE id = ?`
      )
      .bind(status, id)
      .run();
  }
}

/**
 * Increment job attempts
 */
export async function incrementJobAttempts(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE classification_queue
       SET attempts = attempts + 1
       WHERE id = ?`
    )
    .bind(id)
    .run();
}

/**
 * Mark job as processing
 */
export async function markJobProcessing(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE classification_queue
       SET status = 'processing'
       WHERE id = ?`
    )
    .bind(id)
    .run();
}

/**
 * Clean up old completed/failed jobs
 */
export async function cleanupOldJobs(db: D1Database, daysOld: number): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM classification_queue
       WHERE status IN ('completed', 'failed')
       AND created_at < datetime('now', '-' || ? || ' days')`
    )
    .bind(daysOld)
    .run();

  return result.meta.changes;
}

// ============================================================================
// Reputation Queries
// ============================================================================

/**
 * Get reputation for an agent
 */
export async function getReputation(
  db: D1Database,
  agentId: string
): Promise<AgentReputationRow | null> {
  const result = await db
    .prepare('SELECT * FROM agent_reputation WHERE agent_id = ?')
    .bind(agentId)
    .first<AgentReputationRow>();

  return result;
}

/**
 * Get reputations for multiple agents with automatic chunking
 * Returns a Map for O(1) lookup by agentId
 * Handles SQLite's 999 placeholder limit by chunking large queries
 */
export async function getReputationsBatch(
  db: D1Database,
  agentIds: string[]
): Promise<Map<string, AgentReputationRow>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const reputationsMap = new Map<string, AgentReputationRow>();

  // Process in chunks to avoid SQLite placeholder limit
  for (let i = 0; i < agentIds.length; i += MAX_BATCH_SIZE) {
    const chunk = agentIds.slice(i, i + MAX_BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const query = `SELECT * FROM agent_reputation WHERE agent_id IN (${placeholders})`;

    const result = await db
      .prepare(query)
      .bind(...chunk)
      .all<AgentReputationRow>();

    // Add results to map
    for (const row of result.results) {
      reputationsMap.set(row.agent_id, row);
    }
  }

  return reputationsMap;
}

/**
 * Insert or update reputation
 */
export async function upsertReputation(db: D1Database, reputation: NewReputation): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_reputation
       (agent_id, chain_id, feedback_count, average_score, low_count, medium_count, high_count, last_calculated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET
         feedback_count = excluded.feedback_count,
         average_score = excluded.average_score,
         low_count = excluded.low_count,
         medium_count = excluded.medium_count,
         high_count = excluded.high_count,
         last_calculated_at = excluded.last_calculated_at,
         updated_at = datetime('now')`
    )
    .bind(
      reputation.agent_id,
      reputation.chain_id,
      reputation.feedback_count,
      reputation.average_score,
      reputation.low_count,
      reputation.medium_count,
      reputation.high_count,
      reputation.last_calculated_at
    )
    .run();
}

// ============================================================================
// Feedback Queries
// ============================================================================

/**
 * Get recent feedback for an agent
 */
export async function getRecentFeedback(
  db: D1Database,
  agentId: string,
  limit: number
): Promise<AgentFeedbackRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM agent_feedback
       WHERE agent_id = ?
       ORDER BY submitted_at DESC
       LIMIT ?`
    )
    .bind(agentId, limit)
    .all<AgentFeedbackRow>();

  return result.results;
}

/**
 * Get all feedback for an agent (for recalculating reputation)
 */
export async function getAllFeedback(db: D1Database, agentId: string): Promise<AgentFeedbackRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM agent_feedback
       WHERE agent_id = ?
       ORDER BY submitted_at DESC`
    )
    .bind(agentId)
    .all<AgentFeedbackRow>();

  return result.results;
}

/**
 * Insert feedback entry
 */
export async function insertFeedback(db: D1Database, feedback: NewFeedback): Promise<string> {
  const id = crypto.randomUUID().replace(/-/g, '');

  await db
    .prepare(
      `INSERT INTO agent_feedback
       (id, agent_id, chain_id, score, tags, context, feedback_uri, submitter, eas_uid, tx_id, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      feedback.agent_id,
      feedback.chain_id,
      feedback.score,
      feedback.tags,
      feedback.context ?? null,
      feedback.feedback_uri ?? null,
      feedback.submitter,
      feedback.eas_uid ?? null,
      feedback.tx_id ?? null,
      feedback.submitted_at
    )
    .run();

  return id;
}

/**
 * Check if feedback with EAS UID already exists (for deduplication)
 */
export async function feedbackExistsByEasUid(db: D1Database, easUid: string): Promise<boolean> {
  const result = await db
    .prepare('SELECT 1 FROM agent_feedback WHERE eas_uid = ? LIMIT 1')
    .bind(easUid)
    .first();

  return result !== null;
}

/**
 * Get feedback count for an agent
 */
export async function getFeedbackCount(db: D1Database, agentId: string): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM agent_feedback WHERE agent_id = ?')
    .bind(agentId)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

// ============================================================================
// EAS Sync State Queries
// ============================================================================

/**
 * Get EAS sync state for a chain
 */
export async function getEasSyncState(
  db: D1Database,
  chainId: number
): Promise<EasSyncStateRow | null> {
  const result = await db
    .prepare('SELECT * FROM eas_sync_state WHERE chain_id = ?')
    .bind(chainId)
    .first<EasSyncStateRow>();

  return result;
}

/**
 * Get all classified agent IDs
 * Used to determine which agents still need classification
 */
export async function getClassifiedAgentIds(db: D1Database): Promise<Set<string>> {
  const result = await db
    .prepare('SELECT agent_id FROM agent_classifications')
    .all<{ agent_id: string }>();

  return new Set(result.results.map((r) => r.agent_id));
}

/**
 * Get agent IDs currently in queue (pending or processing)
 */
export async function getQueuedAgentIds(db: D1Database): Promise<Set<string>> {
  const result = await db
    .prepare(
      "SELECT DISTINCT agent_id FROM classification_queue WHERE status IN ('pending', 'processing')"
    )
    .all<{ agent_id: string }>();

  return new Set(result.results.map((r) => r.agent_id));
}

/**
 * Reset failed jobs for retry (clear error and set status back to pending)
 */
export async function resetFailedJobs(db: D1Database, limit: number): Promise<number> {
  // First get the IDs to reset (most recent failures for each unique agent)
  const result = await db
    .prepare(
      `UPDATE classification_queue
       SET status = 'pending', error = NULL, attempts = 0
       WHERE id IN (
         SELECT id FROM classification_queue
         WHERE status = 'failed'
         ORDER BY created_at DESC
         LIMIT ?
       )`
    )
    .bind(limit)
    .run();

  return result.meta.changes;
}

/**
 * Update EAS sync state
 */
export async function updateEasSyncState(
  db: D1Database,
  chainId: number,
  lastBlock: number,
  lastTimestamp: string | null,
  attestationsSynced: number,
  error: string | null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO eas_sync_state
       (chain_id, last_block, last_timestamp, attestations_synced, last_error)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chain_id) DO UPDATE SET
         last_block = excluded.last_block,
         last_timestamp = excluded.last_timestamp,
         attestations_synced = eas_sync_state.attestations_synced + excluded.attestations_synced,
         last_error = excluded.last_error,
         updated_at = datetime('now')`
    )
    .bind(chainId, lastBlock, lastTimestamp, attestationsSynced, error)
    .run();
}
