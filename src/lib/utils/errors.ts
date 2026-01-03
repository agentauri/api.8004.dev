/**
 * Error handling utilities
 * @module lib/utils/errors
 */

import type { ErrorCode, ErrorResponse } from '@/types';
import type { Context } from 'hono';
import { z } from 'zod';

/**
 * Application error class with code and status
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * SDK service error - thrown when SDK operations fail
 * Routes should catch this and return 503 Service Unavailable
 */
export class SDKError extends Error {
  constructor(
    public operation: string,
    public originalError: unknown
  ) {
    const message = originalError instanceof Error ? originalError.message : String(originalError);
    super(`SDK ${operation} failed: ${message}`);
    this.name = 'SDKError';
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  requestId?: string
): ErrorResponse {
  return {
    success: false,
    error: message,
    code,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send an error response
 */
export function errorResponse(
  c: Context,
  status: number,
  code: ErrorCode,
  message: string
): Response {
  const requestId = c.get('requestId') as string | undefined;
  const body = createErrorResponse(code, message, requestId);
  return c.json(body, status as 400 | 401 | 403 | 404 | 429 | 500 | 503);
}

/**
 * Create common error responses
 */
export const errors = {
  notFound: (c: Context, resource = 'Resource') =>
    errorResponse(c, 404, 'NOT_FOUND', `${resource} not found`),

  badRequest: (c: Context, message: string) => errorResponse(c, 400, 'BAD_REQUEST', message),

  validationError: (c: Context, message: string) =>
    errorResponse(c, 400, 'VALIDATION_ERROR', message),

  rateLimitExceeded: (c: Context) =>
    errorResponse(c, 429, 'RATE_LIMIT_EXCEEDED', 'Rate limit exceeded. Please try again later.'),

  internalError: (c: Context, message = 'An unexpected error occurred') =>
    errorResponse(c, 500, 'INTERNAL_ERROR', message),

  serviceUnavailable: (c: Context, service: string) =>
    errorResponse(c, 503, 'SERVICE_UNAVAILABLE', `${service} is temporarily unavailable`),
} as const;

/**
 * Global error handler for Hono
 */
export function handleError(error: Error, c: Context): Response {
  // Handle AppError instances
  if (error instanceof AppError) {
    return errorResponse(c, error.status, error.code, error.message);
  }

  // Handle SDK errors - return 503 Service Unavailable
  if (error instanceof SDKError) {
    console.error(`SDKError [${error.operation}]:`, error.originalError);
    return errorResponse(
      c,
      503,
      'SERVICE_UNAVAILABLE',
      'Agent registry service is temporarily unavailable'
    );
  }

  // Handle Zod validation errors
  // Zod 4 uses .issues for error details
  if (error instanceof z.ZodError || error.name === 'ZodError') {
    const zodError = error as z.ZodError;
    const message = zodError.issues?.[0]?.message ?? zodError.message ?? 'Validation failed';
    return errorResponse(c, 400, 'VALIDATION_ERROR', message);
  }

  // Log unexpected errors
  console.error('Unhandled error:', error);

  // Return generic error for unknown errors
  return errorResponse(c, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
