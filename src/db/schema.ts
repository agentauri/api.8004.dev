/**
 * Database schema types
 * @module db/schema
 */

/**
 * Classification queue job status
 */
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Agent classification database row
 */
export interface AgentClassificationRow {
  id: string;
  agent_id: string;
  chain_id: number;
  /** JSON string of SkillClassification[] */
  skills: string;
  /** JSON string of DomainClassification[] */
  domains: string;
  confidence: number;
  model_version: string;
  classified_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Classification queue database row
 */
export interface ClassificationQueueRow {
  id: string;
  agent_id: string;
  status: QueueStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

/**
 * New classification insert data
 */
export interface NewClassification {
  agent_id: string;
  chain_id: number;
  skills: string;
  domains: string;
  confidence: number;
  model_version: string;
  classified_at: string;
}

/**
 * New queue job insert data
 */
export interface NewQueueJob {
  agent_id: string;
}

/**
 * Queue status update data
 */
export interface QueueStatusUpdate {
  status: QueueStatus;
  error?: string;
  processed_at?: string;
}

/**
 * Agent feedback database row
 *
 * **Score Field (0-100 scale)**:
 * Feedback score is stored on a standardized 0-100 scale:
 * - 0-33: Low (poor feedback)
 * - 34-66: Medium (average feedback)
 * - 67-100: High (excellent feedback)
 *
 * **Score Sources**:
 * - EAS attestations originally use 1-5 scale, normalized at indexing time:
 *   1->0, 2->25, 3->50, 4->75, 5->100
 * - On-chain feedback (ERC-8004 Reputation Registry via The Graph) uses 0-100 natively.
 *
 * **Identifying Feedback Source**:
 * - EAS feedback: eas_uid is NOT NULL and does NOT start with 'graph:'
 * - Graph feedback: eas_uid starts with 'graph:'
 */
export interface AgentFeedbackRow {
  id: string;
  agent_id: string;
  chain_id: number;
  /**
   * Feedback score on 0-100 scale.
   * @see AgentFeedbackRow documentation for scale details.
   */
  score: number;
  /** JSON string of string[] */
  tags: string;
  context: string | null;
  feedback_uri: string | null;
  /** KECCAK-256 hash of feedback content (ERC-8004 v1.0) */
  feedback_hash: string | null;
  submitter: string;
  eas_uid: string | null;
  /** Transaction hash from EAS attestation */
  tx_id: string | null;
  /**
   * Per-client feedback index (ERC-8004 v1.0)
   * Tracks the index of this feedback for the specific client-agent pair
   */
  feedback_index: number | null;
  /**
   * Service endpoint reference (ERC-8004 v1.0)
   * Optional endpoint that was used when submitting feedback
   */
  endpoint: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Agent reputation database row (aggregated scores)
 *
 * **Score Distribution Buckets**:
 * Based on 0-100 normalized score scale:
 * - low_count: Number of feedback entries with score <= 33
 * - medium_count: Number of feedback entries with score > 33 and <= 66
 * - high_count: Number of feedback entries with score > 66
 */
export interface AgentReputationRow {
  id: string;
  agent_id: string;
  chain_id: number;
  feedback_count: number;
  /** Average score on 0-100 scale */
  average_score: number;
  /** Count of low scores (0-33) */
  low_count: number;
  /** Count of medium scores (34-66) */
  medium_count: number;
  /** Count of high scores (67-100) */
  high_count: number;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * EAS sync state database row
 */
export interface EasSyncStateRow {
  chain_id: number;
  last_block: number;
  last_timestamp: string | null;
  attestations_synced: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * New feedback insert data
 *
 * **Score Field**:
 * Score must be on 0-100 scale. For EAS attestations (1-5 scale),
 * use `normalizeEASScore()` from `@/lib/utils/score` before inserting.
 */
export interface NewFeedback {
  agent_id: string;
  chain_id: number;
  /**
   * Feedback score on 0-100 scale.
   * EAS scores (1-5) must be normalized before insertion.
   */
  score: number;
  tags: string;
  context?: string;
  feedback_uri?: string;
  /** KECCAK-256 hash of feedback content (ERC-8004 v1.0) */
  feedback_hash?: string;
  submitter: string;
  eas_uid?: string;
  /** Transaction hash from EAS attestation */
  tx_id?: string;
  /**
   * Per-client feedback index (ERC-8004 v1.0)
   */
  feedback_index?: number;
  /**
   * Service endpoint reference (ERC-8004 v1.0)
   */
  endpoint?: string;
  submitted_at: string;
}

/**
 * New reputation insert/update data
 */
export interface NewReputation {
  agent_id: string;
  chain_id: number;
  feedback_count: number;
  /** Average score on 0-100 scale */
  average_score: number;
  /** Count of low scores (0-33) */
  low_count: number;
  /** Count of medium scores (34-66) */
  medium_count: number;
  /** Count of high scores (67-100) */
  high_count: number;
  last_calculated_at: string;
}
