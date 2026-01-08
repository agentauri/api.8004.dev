/**
 * Re-embedding Worker
 *
 * Re-generates embeddings for agents whose OASF classification has changed.
 * This worker processes agents marked with needs_reembed = 1 in batches.
 *
 * The new embedding includes OASF skills and domains for improved semantic search.
 *
 * @module services/sync/reembed-worker
 */

import type { D1Database } from '@cloudflare/workers-types';
import { EMBEDDING_FORMAT_VERSION, formatAgentText } from '@/lib/ai/formatting';
import type { AgentPayload } from '@/lib/qdrant/types';
import { generateEmbedding } from '../embedding';
import { createQdrantClient } from '../qdrant';

interface AgentToReembed {
  agent_id: string;
  content_hash: string;
}

interface ClassificationRow {
  agent_id: string;
  skills: string; // JSON string
  domains: string; // JSON string
}

interface SkillOrDomain {
  slug: string;
  confidence: number;
  reasoning?: string;
}

export interface ReembedResult {
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

export interface ReembedOptions {
  /** Maximum number of agents to process per run (default: 50) */
  batchSize?: number;
  /** Skip agents that fail (default: true) */
  skipOnError?: boolean;
}

/**
 * Process agents that need re-embedding due to OASF classification changes
 *
 * @param db - D1 database connection
 * @param env - Environment variables for Qdrant and Venice API
 * @param options - Processing options
 */
export async function processReembedQueue(
  db: D1Database,
  env: { QDRANT_URL: string; QDRANT_API_KEY: string; QDRANT_COLLECTION?: string; VENICE_API_KEY: string },
  options: ReembedOptions = {}
): Promise<ReembedResult> {
  const { batchSize = 50, skipOnError = true } = options;

  const qdrant = createQdrantClient(env);
  const result: ReembedResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Fetch agents that need re-embedding
  const agentsToReembed = await db
    .prepare(
      `SELECT agent_id, content_hash
       FROM agent_sync_metadata
       WHERE needs_reembed = 1
       LIMIT ?`
    )
    .bind(batchSize)
    .all<AgentToReembed>();

  if (!agentsToReembed.results || agentsToReembed.results.length === 0) {
    console.info('Reembed worker: no agents need re-embedding');
    return result;
  }

  console.info(`Reembed worker: processing ${agentsToReembed.results.length} agents`);

  // Get agent IDs for batch queries
  const agentIds = agentsToReembed.results.map((a) => a.agent_id);

  // Fetch classifications for these agents
  const placeholders = agentIds.map(() => '?').join(',');
  const classifications = await db
    .prepare(
      `SELECT agent_id, skills, domains
       FROM agent_classifications
       WHERE agent_id IN (${placeholders})`
    )
    .bind(...agentIds)
    .all<ClassificationRow>();

  // Create lookup map for classifications
  const classificationMap = new Map<string, ClassificationRow>();
  for (const c of classifications.results ?? []) {
    classificationMap.set(c.agent_id, c);
  }

  // Process each agent
  for (const agent of agentsToReembed.results) {
    result.processed++;

    try {
      // Fetch current agent data from Qdrant
      const qdrantData = await qdrant.scroll({
        qdrantFilter: {
          must: [{ key: 'agent_id', match: { value: agent.agent_id } }],
        },
        limit: 1,
      });

      if (qdrantData.items.length === 0) {
        result.errors.push(`Agent ${agent.agent_id}: not found in Qdrant`);
        result.failed++;
        continue;
      }

      const currentPayload = qdrantData.items[0]?.payload as AgentPayload;
      if (!currentPayload) {
        result.errors.push(`Agent ${agent.agent_id}: no payload in Qdrant`);
        result.failed++;
        continue;
      }

      // Get OASF classification
      const classification = classificationMap.get(agent.agent_id);
      let oasfSkills: string[] = [];
      let oasfDomains: string[] = [];

      if (classification) {
        try {
          const skillsData = JSON.parse(classification.skills) as SkillOrDomain[];
          const domainsData = JSON.parse(classification.domains) as SkillOrDomain[];
          oasfSkills = skillsData.map((s) => s.slug);
          oasfDomains = domainsData.map((d) => d.slug);
        } catch (parseError) {
          console.warn(`Reembed worker: failed to parse classification for ${agent.agent_id}:`, parseError);
        }
      }

      // Generate new embedding text with OASF data
      const embeddingText = formatAgentText({
        name: currentPayload.name,
        description: currentPayload.description,
        mcpTools: currentPayload.mcp_tools,
        mcpPrompts: currentPayload.mcp_prompts,
        mcpResources: currentPayload.mcp_resources,
        a2aSkills: currentPayload.a2a_skills,
        inputModes: currentPayload.input_modes,
        outputModes: currentPayload.output_modes,
        oasfSkills,
        oasfDomains,
      });

      // Generate new embedding vector
      const vector = await generateEmbedding(embeddingText, env.VENICE_API_KEY);

      // Upsert to Qdrant with new vector but keep existing payload
      await qdrant.upsertAgent(agent.agent_id, vector, currentPayload);

      // Update sync metadata - reset needs_reembed and update embedding_version
      await db
        .prepare(
          `UPDATE agent_sync_metadata
           SET needs_reembed = 0,
               embedding_version = ?,
               updated_at = datetime('now')
           WHERE agent_id = ?`
        )
        .bind(EMBEDDING_FORMAT_VERSION, agent.agent_id)
        .run();

      result.successful++;
      console.info(`Reembed worker: successfully re-embedded ${agent.agent_id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Agent ${agent.agent_id}: ${message}`);
      result.failed++;

      if (!skipOnError) {
        throw error;
      }
    }
  }

  console.info(
    `Reembed worker: completed. Processed: ${result.processed}, Success: ${result.successful}, Failed: ${result.failed}`
  );

  return result;
}

/**
 * Mark agents for re-embedding when their classification changes
 * Called by d1-sync-worker after updating classifications
 */
export async function markAgentsForReembed(db: D1Database, agentIds: string[]): Promise<number> {
  if (agentIds.length === 0) return 0;

  let marked = 0;
  const batchSize = 95; // SQLite placeholder limit

  for (let i = 0; i < agentIds.length; i += batchSize) {
    const batch = agentIds.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');

    const result = await db
      .prepare(
        `UPDATE agent_sync_metadata
         SET needs_reembed = 1,
             updated_at = datetime('now')
         WHERE agent_id IN (${placeholders})`
      )
      .bind(...batch)
      .run();

    marked += result.meta.changes ?? 0;
  }

  return marked;
}

/**
 * Get count of agents pending re-embedding
 */
export async function getReembedQueueCount(db: D1Database): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM agent_sync_metadata WHERE needs_reembed = 1')
    .first<{ count: number }>();

  return result?.count ?? 0;
}
