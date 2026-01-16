/**
 * Reputation-related type definitions
 * @module types/reputation
 */

/**
 * Score distribution for reputation statistics (3-bucket)
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
 * Detailed score distribution (5-bucket)
 * Provides finer granularity for visualization
 */
export interface DetailedScoreDistribution {
  /** Count of scores 0-20 */
  veryLow: number;
  /** Count of scores 21-40 */
  low: number;
  /** Count of scores 41-60 */
  medium: number;
  /** Count of scores 61-80 */
  high: number;
  /** Count of scores 81-100 */
  veryHigh: number;
}

/**
 * Aggregated reputation data for an agent
 */
export interface AgentReputation {
  /** Total number of feedback entries */
  count: number;
  /** Average score (0-100) */
  averageScore: number;
  /** Score distribution breakdown (3-bucket) */
  distribution: ScoreDistribution;
  /** Detailed score distribution (5-bucket, optional) */
  detailedDistribution?: DetailedScoreDistribution;
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
  /** Transaction hash from EAS attestation */
  transactionHash?: string;
  /** Per-client feedback index (ERC-8004 v1.0) */
  feedbackIndex?: number;
  /** Service endpoint reference (ERC-8004 v1.0) */
  endpoint?: string;
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
