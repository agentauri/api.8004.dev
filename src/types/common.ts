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
