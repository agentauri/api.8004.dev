/**
 * Reputation-related type definitions
 * @module types/reputation
 */

/**
 * Score distribution for reputation statistics
 */
export interface ScoreDistribution {
  /** Count of low scores (0-33) */
  low: number;
  /** Count of medium scores (34-66) */
  medium: number;
  /** Count of high scores (67-100) */
  high: number;
}

/**
 * Aggregated reputation data for an agent
 */
export interface AgentReputation {
  /** Total number of feedback entries */
  count: number;
  /** Average score (0-100) */
  averageScore: number;
  /** Score distribution breakdown */
  distribution: ScoreDistribution;
}

/**
 * Individual feedback entry for an agent
 */
export interface AgentFeedback {
  /** Feedback entry ID */
  id: string;
  /** Feedback score (0-100) */
  score: number;
  /** Tags describing the feedback */
  tags: string[];
  /** Optional feedback context/comment */
  context?: string;
  /** URI to verifiable source (EAS attestation) */
  feedbackUri?: string;
  /** Submitter wallet address */
  submitter: string;
  /** ISO timestamp when feedback was submitted */
  timestamp: string;
}

/**
 * Reputation API response
 */
export interface ReputationResponse {
  success: true;
  data: {
    agentId: string;
    reputation: AgentReputation;
    recentFeedback: AgentFeedback[];
  };
}
