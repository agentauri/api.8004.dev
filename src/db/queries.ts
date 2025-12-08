/**
 * Database query functions
 * @module db/queries
 */

import type {
  AgentClassificationRow,
  ClassificationQueueRow,
  NewClassification,
  QueueStatus,
} from './schema';

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
 * Enqueue a classification job
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
