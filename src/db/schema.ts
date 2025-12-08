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
