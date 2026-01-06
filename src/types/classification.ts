/**
 * OASF Classification type definitions
 * @module types/classification
 */

/**
 * Classification job for the queue
 */
export interface ClassificationJob {
  /** Agent ID in format chainId:tokenId */
  agentId: string;
  /** Whether to force re-classification */
  force: boolean;
}

/**
 * Evaluation job for the queue
 */
export interface EvaluationJob {
  /** Queue item ID */
  queueItemId: string;
  /** Agent ID in format chainId:tokenId */
  agentId: string;
  /** Chain ID */
  chainId: number;
  /** Specific skills to evaluate */
  skills: string[];
}

/**
 * Individual skill classification
 */
export interface SkillClassification {
  /** OASF skill slug (e.g., "natural_language_processing/text_generation") */
  slug: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning for this classification */
  reasoning?: string;
}

/**
 * Individual domain classification
 */
export interface DomainClassification {
  /** OASF domain slug (e.g., "finance/trading") */
  slug: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning for this classification */
  reasoning?: string;
}

/**
 * Complete OASF classification for an agent
 */
export interface OASFClassification {
  /** Classified skills */
  skills: SkillClassification[];
  /** Classified domains */
  domains: DomainClassification[];
  /** Overall confidence score (0-1) */
  confidence: number;
  /** ISO timestamp when classified */
  classifiedAt: string;
  /** Model version used for classification */
  modelVersion: string;
  /** Source of classification: creator-defined (from IPFS) or llm-classification */
  source?: 'creator-defined' | 'llm-classification';
}

/**
 * Classification result from the classifier service
 */
export interface ClassificationResult {
  /** Classified skills */
  skills: SkillClassification[];
  /** Classified domains */
  domains: DomainClassification[];
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Model version used for classification */
  modelVersion: string;
}

/**
 * Classification response (when classification exists)
 */
export interface ClassificationResponse {
  success: true;
  data: OASFClassification;
}

/**
 * Classification pending response (202 status)
 */
export interface ClassificationPendingResponse {
  success: true;
  status: 'pending' | 'processing';
  /** Estimated seconds until completion */
  estimatedTime: number;
}

/**
 * Classification queued response
 */
export interface ClassificationQueuedResponse {
  success: true;
  status: 'queued' | 'already_classified';
  /** Agent ID */
  agentId: string;
}

/**
 * Agent data for classification
 */
export interface AgentClassificationInput {
  /** Agent ID in format chainId:tokenId */
  agentId: string;
  /** Agent display name */
  name: string;
  /** Agent description */
  description: string;
  /** List of MCP tool names */
  mcpTools?: string[];
  /** List of A2A skill names */
  a2aSkills?: string[];
}
