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
 */
export interface AgentFeedbackRow {
  id: string;
  agent_id: string;
  chain_id: number;
  score: number;
  /** JSON string of string[] */
  tags: string;
  context: string | null;
  feedback_uri: string | null;
  submitter: string;
  eas_uid: string | null;
  /** Transaction hash from EAS attestation */
  tx_id: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Agent reputation database row (aggregated scores)
 */
export interface AgentReputationRow {
  id: string;
  agent_id: string;
  chain_id: number;
  feedback_count: number;
  average_score: number;
  low_count: number;
  medium_count: number;
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
 */
export interface NewFeedback {
  agent_id: string;
  chain_id: number;
  score: number;
  tags: string;
  context?: string;
  feedback_uri?: string;
  submitter: string;
  eas_uid?: string;
  /** Transaction hash from EAS attestation */
  tx_id?: string;
  submitted_at: string;
}

/**
 * New reputation insert/update data
 */
export interface NewReputation {
  agent_id: string;
  chain_id: number;
  feedback_count: number;
  average_score: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  last_calculated_at: string;
}
