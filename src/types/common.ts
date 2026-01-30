/**
 * Common type definitions
 * @module types/common
 */

/**
 * Standard error codes
 */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'SERVICE_UNAVAILABLE';

/**
 * Standard error response
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  requestId?: string;
  timestamp?: string;
}

/**
 * Health check status
 */
export type HealthStatus = 'ok' | 'degraded' | 'down';

/**
 * Service health status
 */
export type ServiceStatus = 'ok' | 'error';

/**
 * Health check response
 */
export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  services: {
    sdk: ServiceStatus;
    searchService: ServiceStatus;
    classifier: ServiceStatus;
    database: ServiceStatus;
  };
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  hasMore: boolean;
  nextCursor?: string;
  limit: number;
  offset?: number;
}

/**
 * Per-chain protocol breakdown for global stats
 */
export interface ProtocolChainBreakdown {
  chainId: number;
  chainName: string;
  agents: number;
  feedback: number;
  validations: number;
}

/**
 * Global statistics response (cross-chain aggregates)
 */
export interface GlobalStatsResponse {
  success: true;
  data: {
    /** Total registered agents across all chains */
    totalAgents: number;
    /** Total feedback entries across all chains */
    totalFeedback: number;
    /** Total validations across all chains */
    totalValidations: number;
    /** Per-chain breakdown */
    protocolsByChain: ProtocolChainBreakdown[];
    /** Last updated timestamp */
    lastUpdated: string;
  };
}

/**
 * Chain-specific protocol statistics response
 */
export interface ChainProtocolStatsResponse {
  success: true;
  data: {
    chainId: number;
    chainName: string;
    /** Total registered agents on this chain */
    totalAgents: number;
    /** Agents with registration files */
    withRegistrationFile: number;
    /** Active agents */
    activeAgents: number;
    /** Total feedback entries */
    totalFeedback: number;
    /** Total validations */
    totalValidations: number;
    /** All unique tags used in feedback */
    tags: string[];
    /** Deployment status */
    deploymentStatus: 'active' | 'pending';
    /** Last updated timestamp */
    lastUpdated: string;
  };
}
