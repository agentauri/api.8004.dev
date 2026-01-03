/**
 * Request ID middleware for request tracing
 * @module lib/middleware/request-id
 */

import type { MiddlewareHandler } from 'hono';
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
 */
export function requestId(): MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> {
  return async (c, next) => {
    // Check for existing request ID in headers
    let id = c.req.header('X-Request-ID');

    // Generate new ID if not provided
    if (!id) {
      id = generateUUID();
    }

    // Store in context for use in handlers
    c.set('requestId', id);

    // Set response header
    c.header('X-Request-ID', id);

    await next();
  };
}
