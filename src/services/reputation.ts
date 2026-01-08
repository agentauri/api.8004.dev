/**
 * Reputation service for agent feedback and scores
 * @module services/reputation
 */

import {
  feedbackExistsByEasUid,
  getAllFeedback,
  getRecentFeedback,
  getReputation,
  getReputationHistory,
  getReputationsBatch,
  insertFeedback,
  upsertReputation,
} from '@/db/queries';
import type { AgentFeedbackRow, AgentReputationRow, NewFeedback } from '@/db/schema';
import type { AgentFeedback, AgentReputation } from '@/types';

/**
 * Reputation history data point
 */
export interface ReputationHistoryDataPoint {
  date: string;
  reputationScore: number;
  feedbackCount: number;
}

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

  /**
   * Recalculate reputation for all agents (after migration)
   * @returns Number of agents recalculated
   */
  recalculateAll(): Promise<number>;

  /**
   * Get reputation history for an agent over a date range
   */
  getReputationHistory(
    agentId: string,
    startDate: string,
    endDate: string
  ): Promise<ReputationHistoryDataPoint[]>;
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
    transactionHash: row.tx_id ?? undefined,
    feedbackIndex: row.feedback_index ?? undefined,
    endpoint: row.endpoint ?? undefined,
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
 * Get score distribution bucket for a score
 */
function getScoreBucket(score: number): 'low' | 'medium' | 'high' {
  if (score <= 33) return 'low';
  if (score <= 66) return 'medium';
  return 'high';
}

/**
 * Incrementally update reputation with a new feedback score
 * Uses formula: newAvg = (oldAvg * oldCount + newScore) / (oldCount + 1)
 */
function calculateIncrementalReputation(
  current: AgentReputationRow | null,
  newScore: number
): {
  count: number;
  averageScore: number;
  low: number;
  medium: number;
  high: number;
} {
  const bucket = getScoreBucket(newScore);

  if (!current) {
    // First feedback - simple calculation
    return {
      count: 1,
      averageScore: newScore,
      low: bucket === 'low' ? 1 : 0,
      medium: bucket === 'medium' ? 1 : 0,
      high: bucket === 'high' ? 1 : 0,
    };
  }

  // Incremental update
  const newCount = current.feedback_count + 1;
  const newAverage =
    Math.round(((current.average_score * current.feedback_count + newScore) / newCount) * 100) /
    100;

  return {
    count: newCount,
    averageScore: newAverage,
    low: current.low_count + (bucket === 'low' ? 1 : 0),
    medium: current.medium_count + (bucket === 'medium' ? 1 : 0),
    high: current.high_count + (bucket === 'high' ? 1 : 0),
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

      // Use incremental update instead of full recalculation
      // This is O(1) instead of O(n) where n is total feedback count
      const currentReputation = await getReputation(db, feedback.agent_id);
      const calculated = calculateIncrementalReputation(currentReputation, feedback.score);

      // Upsert updated reputation
      await upsertReputation(db, {
        agent_id: feedback.agent_id,
        chain_id: feedback.chain_id,
        feedback_count: calculated.count,
        average_score: calculated.averageScore,
        low_count: calculated.low,
        medium_count: calculated.medium,
        high_count: calculated.high,
        last_calculated_at: new Date().toISOString(),
      });

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

    async recalculateAll(): Promise<number> {
      // Get all unique agent IDs from feedback
      const result = await db
        .prepare('SELECT DISTINCT agent_id, chain_id FROM agent_feedback')
        .all<{ agent_id: string; chain_id: number }>();

      let count = 0;
      for (const row of result.results ?? []) {
        await this.recalculateReputation(row.agent_id, row.chain_id);
        count++;
      }

      console.info(`Recalculated reputation for ${count} agents`);
      return count;
    },

    async getReputationHistory(
      agentId: string,
      startDate: string,
      endDate: string
    ): Promise<ReputationHistoryDataPoint[]> {
      const rows = await getReputationHistory(db, agentId, startDate, endDate);
      return rows.map((row) => ({
        date: row.snapshot_date,
        reputationScore: row.reputation_score,
        feedbackCount: row.feedback_count,
      }));
    },
  };
}
