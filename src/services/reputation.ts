/**
 * Reputation service for agent feedback and scores
 * @module services/reputation
 */

import {
  feedbackExistsByEasUid,
  getAllFeedback,
  getRecentFeedback,
  getReputation,
  getReputationsBatch,
  insertFeedback,
  upsertReputation,
} from '@/db/queries';
import type { AgentFeedbackRow, AgentReputationRow, NewFeedback } from '@/db/schema';
import type { AgentFeedback, AgentReputation } from '@/types';

/**
 * Reputation service interface
 */
export interface ReputationService {
  /**
   * Get reputation for an agent
   */
  getAgentReputation(agentId: string): Promise<AgentReputation | null>;

  /**
   * Get reputations for multiple agents
   */
  getAgentReputationsBatch(agentIds: string[]): Promise<Map<string, AgentReputation>>;

  /**
   * Get recent feedback for an agent
   */
  getAgentFeedback(agentId: string, limit?: number): Promise<AgentFeedback[]>;

  /**
   * Add feedback for an agent (and recalculate reputation)
   */
  addFeedback(feedback: NewFeedback): Promise<string>;

  /**
   * Check if feedback already exists (by EAS UID)
   */
  feedbackExists(easUid: string): Promise<boolean>;

  /**
   * Recalculate reputation for an agent from all feedback
   */
  recalculateReputation(agentId: string, chainId: number): Promise<AgentReputation>;
}

/**
 * Convert database row to AgentReputation
 */
function rowToReputation(row: AgentReputationRow): AgentReputation {
  return {
    count: row.feedback_count,
    averageScore: row.average_score,
    distribution: {
      low: row.low_count,
      medium: row.medium_count,
      high: row.high_count,
    },
  };
}

/**
 * Convert database row to AgentFeedback
 */
function rowToFeedback(row: AgentFeedbackRow): AgentFeedback {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch (error) {
    // Log parse failure for debugging but continue with empty array
    console.error(`Failed to parse feedback tags for row ${row.id}:`, error);
  }

  return {
    id: row.id,
    score: row.score,
    tags,
    context: row.context ?? undefined,
    feedbackUri: row.feedback_uri ?? undefined,
    submitter: row.submitter,
    timestamp: row.submitted_at,
  };
}

/**
 * Calculate reputation from feedback entries
 */
function calculateReputationFromFeedback(feedback: AgentFeedbackRow[]): {
  count: number;
  averageScore: number;
  low: number;
  medium: number;
  high: number;
} {
  if (feedback.length === 0) {
    return { count: 0, averageScore: 0, low: 0, medium: 0, high: 0 };
  }

  let total = 0;
  let low = 0;
  let medium = 0;
  let high = 0;

  for (const f of feedback) {
    total += f.score;
    if (f.score <= 33) {
      low++;
    } else if (f.score <= 66) {
      medium++;
    } else {
      high++;
    }
  }

  const averageScore = Math.round((total / feedback.length) * 100) / 100;

  return {
    count: feedback.length,
    averageScore,
    low,
    medium,
    high,
  };
}

/**
 * Create reputation service
 */
export function createReputationService(db: D1Database): ReputationService {
  return {
    async getAgentReputation(agentId: string): Promise<AgentReputation | null> {
      const row = await getReputation(db, agentId);
      if (!row) return null;
      return rowToReputation(row);
    },

    async getAgentReputationsBatch(agentIds: string[]): Promise<Map<string, AgentReputation>> {
      const rows = await getReputationsBatch(db, agentIds);
      const result = new Map<string, AgentReputation>();

      for (const [agentId, row] of rows) {
        result.set(agentId, rowToReputation(row));
      }

      return result;
    },

    async getAgentFeedback(agentId: string, limit = 10): Promise<AgentFeedback[]> {
      const rows = await getRecentFeedback(db, agentId, limit);
      return rows.map(rowToFeedback);
    },

    async addFeedback(feedback: NewFeedback): Promise<string> {
      // Insert feedback
      const id = await insertFeedback(db, feedback);

      // Recalculate reputation
      await this.recalculateReputation(feedback.agent_id, feedback.chain_id);

      return id;
    },

    async feedbackExists(easUid: string): Promise<boolean> {
      return feedbackExistsByEasUid(db, easUid);
    },

    async recalculateReputation(agentId: string, chainId: number): Promise<AgentReputation> {
      // Get all feedback for this agent
      const allFeedback = await getAllFeedback(db, agentId);

      // Calculate new reputation values
      const calculated = calculateReputationFromFeedback(allFeedback);

      // Upsert reputation
      await upsertReputation(db, {
        agent_id: agentId,
        chain_id: chainId,
        feedback_count: calculated.count,
        average_score: calculated.averageScore,
        low_count: calculated.low,
        medium_count: calculated.medium,
        high_count: calculated.high,
        last_calculated_at: new Date().toISOString(),
      });

      return {
        count: calculated.count,
        averageScore: calculated.averageScore,
        distribution: {
          low: calculated.low,
          medium: calculated.medium,
          high: calculated.high,
        },
      };
    },
  };
}
