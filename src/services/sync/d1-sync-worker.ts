/**
 * D1 to Qdrant Sync Worker
 *
 * Syncs classifications (skills/domains) and reputation from D1 to Qdrant.
 * This is a lightweight sync that only updates payload fields without re-embedding.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { createQdrantClient } from '../qdrant';

interface ClassificationRow {
  agent_id: string;
  skills: string; // JSON string
  domains: string; // JSON string
  confidence: number;
  classified_at: string;
  model_version: string;
  updated_at: string;
}

interface ReputationRow {
  agent_id: string;
  average_score: number;
  updated_at: string;
}

interface TrustScoreRow {
  agent_id: string;
  trust_score: number;
  computed_at: string;
}

interface SkillOrDomain {
  slug: string;
  confidence: number;
  reasoning?: string;
}

/**
 * Minimum confidence threshold for skills/domains to be indexed in Qdrant.
 * Skills/domains with confidence below this threshold are stored but not searchable.
 * This prevents low-quality classifications (e.g., agents with name "d" description "d")
 * from polluting search results.
 */
const MIN_CONFIDENCE_THRESHOLD = 0.7;

export interface D1SyncResult {
  classificationsUpdated: number;
  reputationUpdated: number;
  trustScoresUpdated: number;
  agentsMarkedForReembed: number;
  errors: string[];
}

/**
 * Sync D1 classifications and reputation to Qdrant
 */
export async function syncD1ToQdrant(
  db: D1Database,
  env: { QDRANT_URL: string; QDRANT_API_KEY: string; QDRANT_COLLECTION?: string }
): Promise<D1SyncResult> {
  const qdrant = createQdrantClient(env);
  const result: D1SyncResult = {
    classificationsUpdated: 0,
    reputationUpdated: 0,
    trustScoresUpdated: 0,
    agentsMarkedForReembed: 0,
    errors: [],
  };

  // Get last D1 sync timestamp
  const syncState = await db
    .prepare('SELECT last_d1_sync FROM qdrant_sync_state WHERE id = ?')
    .bind('global')
    .first<{ last_d1_sync: string | null }>();

  const lastSyncRaw = syncState?.last_d1_sync ?? '1970-01-01T00:00:00Z';
  // Normalize timestamp to D1 format (space-separated, no T/Z) for comparison
  // D1 stores as "2026-01-18 09:37:37" but sync state uses ISO format "2026-01-18T09:37:37.000Z"
  const lastSync = lastSyncRaw.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');

  // Fetch classifications updated since last sync (including confidence metadata)
  const classifications = await db
    .prepare(
      `SELECT agent_id, skills, domains, confidence, classified_at, model_version, updated_at
       FROM agent_classifications
       WHERE updated_at > ?`
    )
    .bind(lastSync)
    .all<ClassificationRow>();

  // Fetch reputation updated since last sync
  const reputation = await db
    .prepare(
      `SELECT agent_id, average_score, updated_at
       FROM agent_reputation
       WHERE updated_at > ?`
    )
    .bind(lastSync)
    .all<ReputationRow>();

  // Update classifications in Qdrant (including full confidence data for Phase 2)
  for (const c of classifications.results ?? []) {
    try {
      // Validate and parse skills JSON
      let skillsData: SkillOrDomain[] = [];
      if (c.skills) {
        try {
          const parsed = JSON.parse(c.skills);
          if (Array.isArray(parsed)) {
            skillsData = parsed.filter(
              (s): s is SkillOrDomain =>
                typeof s === 'object' && s !== null && typeof s.slug === 'string'
            );
          }
        } catch (parseError) {
          console.error(`[d1-sync] Malformed skills JSON for ${c.agent_id}:`, parseError);
        }
      }

      // Validate and parse domains JSON
      let domainsData: SkillOrDomain[] = [];
      if (c.domains) {
        try {
          const parsed = JSON.parse(c.domains);
          if (Array.isArray(parsed)) {
            domainsData = parsed.filter(
              (d): d is SkillOrDomain =>
                typeof d === 'object' && d !== null && typeof d.slug === 'string'
            );
          }
        } catch (parseError) {
          console.error(`[d1-sync] Malformed domains JSON for ${c.agent_id}:`, parseError);
        }
      }

      // Filter by confidence threshold for indexing (searchable)
      // Only skills/domains with confidence >= threshold are indexed
      const highConfidenceSkills = skillsData.filter(
        (s) => s.confidence >= MIN_CONFIDENCE_THRESHOLD
      );
      const highConfidenceDomains = domainsData.filter(
        (d) => d.confidence >= MIN_CONFIDENCE_THRESHOLD
      );

      // Slugs only for filtering (indexed) - only high-confidence items
      const skills = highConfidenceSkills.map((s) => s.slug);
      const domains = highConfidenceDomains.map((d) => d.slug);

      // Full data with confidence for API response (includes all, even low-confidence)
      await qdrant.setPayloadByAgentId(c.agent_id, {
        skills,
        domains,
        skills_with_confidence: skillsData, // All for transparency
        domains_with_confidence: domainsData, // All for transparency
        classification_confidence: c.confidence,
        classification_at: c.classified_at,
        classification_model: c.model_version,
      });
      result.classificationsUpdated++;

      // Update sync metadata and mark for re-embedding (OASF data changed)
      const syncUpdate = await db
        .prepare(
          `INSERT INTO agent_sync_metadata (agent_id, content_hash, d1_classification_at, needs_reembed)
           VALUES (?, '', ?, 1)
           ON CONFLICT(agent_id) DO UPDATE SET
             d1_classification_at = excluded.d1_classification_at,
             needs_reembed = 1,
             updated_at = datetime('now')`
        )
        .bind(c.agent_id, c.updated_at)
        .run();

      // Track agents marked for re-embedding
      if (syncUpdate.meta.changes && syncUpdate.meta.changes > 0) {
        result.agentsMarkedForReembed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Classification ${c.agent_id}: ${message}`);
    }
  }

  // Update reputation in Qdrant
  for (const r of reputation.results ?? []) {
    try {
      // Handle both old 1-5 scale and new 0-100 scale
      // Old scale: values 1-5, multiply by 20 to get 0-100
      // New scale: values 0-100, use directly
      const isOldScale = r.average_score <= 5;
      const reputationScore = isOldScale
        ? Math.round(r.average_score * 20)
        : Math.round(r.average_score);

      await qdrant.setPayloadByAgentId(r.agent_id, { reputation: reputationScore });
      result.reputationUpdated++;

      // Update sync metadata
      await db
        .prepare(
          `INSERT INTO agent_sync_metadata (agent_id, content_hash, d1_reputation_at)
           VALUES (?, '', ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             d1_reputation_at = excluded.d1_reputation_at,
             updated_at = datetime('now')`
        )
        .bind(r.agent_id, r.updated_at)
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Reputation ${r.agent_id}: ${message}`);
    }
  }

  // Fetch trust scores computed since last sync
  const trustScores = await db
    .prepare(
      `SELECT agent_id, trust_score, computed_at
       FROM agent_trust_scores
       WHERE computed_at > ?`
    )
    .bind(lastSync)
    .all<TrustScoreRow>();

  // Update trust scores in Qdrant
  for (const t of trustScores.results ?? []) {
    try {
      // Trust score is already 0-100 normalized in D1
      await qdrant.setPayloadByAgentId(t.agent_id, { trust_score: t.trust_score });
      result.trustScoresUpdated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`TrustScore ${t.agent_id}: ${message}`);
    }
  }

  // Update global sync state only if items were processed
  // This prevents advancing the timestamp when no items are synced,
  // which would skip items created between the last sync and now
  const totalSynced =
    result.classificationsUpdated + result.reputationUpdated + result.trustScoresUpdated;

  if (totalSynced > 0) {
    // Find the max updated_at from processed items to use as the new sync timestamp
    // This ensures we don't skip items created during processing
    const maxTimestamps: string[] = [];

    const classificationResults = classifications.results ?? [];
    const firstClassification = classificationResults[0];
    if (firstClassification) {
      const maxClassification = classificationResults.reduce((max, c) =>
        c.updated_at > max ? c.updated_at : max
      , firstClassification.updated_at);
      maxTimestamps.push(maxClassification);
    }

    const reputationResults = reputation.results ?? [];
    const firstReputation = reputationResults[0];
    if (firstReputation) {
      const maxReputation = reputationResults.reduce((max, r) =>
        r.updated_at > max ? r.updated_at : max
      , firstReputation.updated_at);
      maxTimestamps.push(maxReputation);
    }

    const trustResults = trustScores.results ?? [];
    const firstTrust = trustResults[0];
    if (firstTrust) {
      const maxTrust = trustResults.reduce((max, t) =>
        t.computed_at > max ? t.computed_at : max
      , firstTrust.computed_at);
      maxTimestamps.push(maxTrust);
    }

    // Use the max of all processed timestamps, converted to ISO format
    const maxProcessedTimestamp = maxTimestamps.length > 0
      ? maxTimestamps.reduce((max, t) => t > max ? t : max)
      : null;

    if (maxProcessedTimestamp) {
      // Convert D1 format "2026-01-18 17:09:29" to ISO format "2026-01-18T17:09:29.000Z"
      const isoTimestamp = maxProcessedTimestamp.includes('T')
        ? maxProcessedTimestamp
        : `${maxProcessedTimestamp.replace(' ', 'T')}.000Z`;

      await db
        .prepare(
          `UPDATE qdrant_sync_state
           SET last_d1_sync = ?,
               agents_synced = agents_synced + ?,
               updated_at = datetime('now')
           WHERE id = 'global'`
        )
        .bind(isoTimestamp, totalSynced)
        .run();
    }
  }

  return result;
}
