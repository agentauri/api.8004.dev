/**
 * Reachability Service
 *
 * Derives agent endpoint reachability status from feedback data.
 * Reachability is determined by recent feedback entries with reachability tags
 * and high scores (>=70 out of 100).
 *
 * @module services/reachability
 */

import type { D1Database } from '@cloudflare/workers-types';

/**
 * Reachability status for an agent
 */
export interface AgentReachability {
  /** Whether A2A endpoint was recently verified as reachable */
  a2a: boolean;
  /** Whether MCP endpoint was recently verified as reachable */
  mcp: boolean;
  /** Whether Web endpoint was recently verified as reachable */
  web: boolean;
}

/**
 * Reachability service interface
 */
export interface ReachabilityService {
  /**
   * Get reachability status for a single agent
   * @param agentId - Agent ID in format "chainId:tokenId"
   * @returns Reachability status
   */
  getAgentReachability(agentId: string): Promise<AgentReachability>;

  /**
   * Get reachability status for multiple agents in a batch
   * @param agentIds - Array of agent IDs in format "chainId:tokenId"
   * @returns Map of agentId to reachability status
   */
  getAgentReachabilitiesBatch(agentIds: string[]): Promise<Map<string, AgentReachability>>;
}

/**
 * Reachability tags used in feedback
 *
 * Supports two formats:
 * - Legacy: tag1="reachability_mcp", tag1="reachability_a2a", tag1="reachability_web"
 * - Watchtower v1: tag1="reachable", tag2="mcp" or tag2="a2a" or tag2="web"
 */
const REACHABILITY_TAG_A2A = 'reachability_a2a';
const REACHABILITY_TAG_MCP = 'reachability_mcp';
const REACHABILITY_TAG_WEB = 'reachability_web';
const REACHABILITY_TAG_GENERIC = 'reachable';

/**
 * Minimum score (out of 100) for an endpoint to be considered reachable
 */
const MIN_REACHABILITY_SCORE = 70;

/**
 * How recent feedback must be to be considered (in hours)
 */
const REACHABILITY_WINDOW_HOURS = 24;

/**
 * Raw feedback row from the database
 */
interface FeedbackRow {
  agent_id: string;
  score: number;
  tags: string;
  submitted_at: string;
}

/**
 * Create a reachability service
 * @param db - D1 database instance
 * @returns ReachabilityService implementation
 */
export function createReachabilityService(db: D1Database): ReachabilityService {
  /**
   * Calculate the cutoff timestamp for recent feedback
   */
  function getRecentCutoff(): string {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - REACHABILITY_WINDOW_HOURS);
    return cutoff.toISOString();
  }

  /**
   * Parse tags from JSON string
   */
  function parseTags(tagsJson: string): string[] {
    try {
      const parsed = JSON.parse(tagsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Check if feedback indicates reachability for a specific protocol.
   * Matches both legacy tags (e.g., "reachability_mcp") and
   * watchtower v1 format (tag1="reachable", tag2="mcp").
   */
  function isReachable(feedback: FeedbackRow[], legacyTag: string, protocol: string): boolean {
    // Find the most recent feedback matching either format
    const relevantFeedback = feedback
      .filter((f) => {
        const tags = parseTags(f.tags);
        // Legacy format: ["reachability_mcp"]
        if (tags.includes(legacyTag)) return true;
        // Watchtower v1 format: ["reachable", "mcp"]
        if (tags.includes(REACHABILITY_TAG_GENERIC) && tags.includes(protocol)) return true;
        return false;
      })
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

    // Check if the most recent feedback has a high enough score
    const mostRecent = relevantFeedback[0];
    return mostRecent !== undefined && mostRecent.score >= MIN_REACHABILITY_SCORE;
  }

  return {
    async getAgentReachability(agentId: string): Promise<AgentReachability> {
      const cutoff = getRecentCutoff();

      // Query recent feedback for this agent with reachability tags
      // Matches legacy format (reachability_a2a, etc.) and watchtower v1 (reachable)
      const results = await db
        .prepare(
          `SELECT agent_id, score, tags, submitted_at
           FROM agent_feedback
           WHERE agent_id = ?
             AND submitted_at >= ?
             AND (tags LIKE ? OR tags LIKE ? OR tags LIKE ? OR tags LIKE ?)
           ORDER BY submitted_at DESC`
        )
        .bind(
          agentId,
          cutoff,
          `%${REACHABILITY_TAG_A2A}%`,
          `%${REACHABILITY_TAG_MCP}%`,
          `%${REACHABILITY_TAG_WEB}%`,
          `%${REACHABILITY_TAG_GENERIC}%`
        )
        .all<FeedbackRow>();

      const feedback = results.results ?? [];

      return {
        a2a: isReachable(feedback, REACHABILITY_TAG_A2A, 'a2a'),
        mcp: isReachable(feedback, REACHABILITY_TAG_MCP, 'mcp'),
        web: isReachable(feedback, REACHABILITY_TAG_WEB, 'web'),
      };
    },

    async getAgentReachabilitiesBatch(agentIds: string[]): Promise<Map<string, AgentReachability>> {
      const reachabilityMap = new Map<string, AgentReachability>();

      // Return empty map if no agent IDs provided
      if (agentIds.length === 0) {
        return reachabilityMap;
      }

      // Initialize all agents with default false values
      for (const agentId of agentIds) {
        reachabilityMap.set(agentId, { a2a: false, mcp: false, web: false });
      }

      const cutoff = getRecentCutoff();

      // D1 has a limit of 100 bound parameters per query
      // Each query uses batch.length + 5 variables (batch + cutoff + 4 LIKE patterns)
      // Use batch size of 94 to stay safely under the 100 limit
      const BATCH_SIZE = 94;
      const feedbackByAgent = new Map<string, FeedbackRow[]>();

      for (let i = 0; i < agentIds.length; i += BATCH_SIZE) {
        const batch = agentIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(', ');

        // Query recent feedback for this batch with reachability tags
        // Matches legacy format (reachability_a2a, etc.) and watchtower v1 (reachable)
        const query = `
          SELECT agent_id, score, tags, submitted_at
          FROM agent_feedback
          WHERE agent_id IN (${placeholders})
            AND submitted_at >= ?
            AND (tags LIKE ? OR tags LIKE ? OR tags LIKE ? OR tags LIKE ?)
          ORDER BY agent_id, submitted_at DESC
        `;

        const results = await db
          .prepare(query)
          .bind(
            ...batch,
            cutoff,
            `%${REACHABILITY_TAG_A2A}%`,
            `%${REACHABILITY_TAG_MCP}%`,
            `%${REACHABILITY_TAG_WEB}%`,
            `%${REACHABILITY_TAG_GENERIC}%`
          )
          .all<FeedbackRow>();

        const feedback = results.results ?? [];

        // Group feedback by agent_id
        for (const row of feedback) {
          const existing = feedbackByAgent.get(row.agent_id) ?? [];
          existing.push(row);
          feedbackByAgent.set(row.agent_id, existing);
        }
      }

      // Determine reachability for each agent
      for (const [agentId, agentFeedback] of feedbackByAgent) {
        reachabilityMap.set(agentId, {
          a2a: isReachable(agentFeedback, REACHABILITY_TAG_A2A, 'a2a'),
          mcp: isReachable(agentFeedback, REACHABILITY_TAG_MCP, 'mcp'),
          web: isReachable(agentFeedback, REACHABILITY_TAG_WEB, 'web'),
        });
      }

      return reachabilityMap;
    },
  };
}
