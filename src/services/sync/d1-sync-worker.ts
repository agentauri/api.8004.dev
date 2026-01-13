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

  const lastSync = syncState?.last_d1_sync ?? '1970-01-01T00:00:00Z';

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

      // Slugs only for filtering (indexed)
      const skills = skillsData.map((s) => s.slug);
      const domains = domainsData.map((d) => d.slug);

      // Full data with confidence for Phase 2 (not indexed, for API response)
      await qdrant.setPayloadByAgentId(c.agent_id, {
        skills,
        domains,
        skills_with_confidence: skillsData,
        domains_with_confidence: domainsData,
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
      // Convert 1-5 scale to 0-100
      const reputationScore = Math.round(r.average_score * 20);

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

  // Update global sync state
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE qdrant_sync_state
       SET last_d1_sync = ?,
           agents_synced = agents_synced + ?,
           updated_at = datetime('now')
       WHERE id = 'global'`
    )
    .bind(now, result.classificationsUpdated + result.reputationUpdated + result.trustScoresUpdated)
    .run();

  return result;
}
