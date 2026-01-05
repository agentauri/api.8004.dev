/**
 * Request ID middleware for request tracing
 * @module lib/middleware/request-id
 */

import type { MiddlewareHandler } from 'hono';
import { createLogger } from '@/lib/logger';
import type { Env, Variables } from '@/types';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Request ID middleware
 * Generates or extracts a request ID for tracing
 * Also creates a structured logger with request context
 */
export function requestId(): MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> {
  return async (c, next) => {
    const start = Date.now();

    // Check for existing request ID in headers
    let id = c.req.header('X-Request-ID');

    // Generate new ID if not provided
    if (!id) {
      id = generateUUID();
    }

    // Store in context for use in handlers
    c.set('requestId', id);

    // Create structured logger with request context
    const logger = createLogger(id);
    c.set('logger', logger);

    // Set response header
    c.header('X-Request-ID', id);

    // Log request start
    logger.info('Request started', {
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('User-Agent'),
    });

    await next();

    // Log request completion
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    });
  };
}
