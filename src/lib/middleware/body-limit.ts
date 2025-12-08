/**
 * Body size limit middleware
 * @module lib/middleware/body-limit
 */

import type { Env, Variables } from '@/types';
import type { MiddlewareHandler } from 'hono';
import { errors } from '../utils/errors';

/** Default max body size: 100KB */
const DEFAULT_MAX_SIZE = 100 * 1024;

/**
 * Middleware to limit request body size
 * Prevents DoS attacks from large payloads
 */
export function bodyLimit(maxSize: number = DEFAULT_MAX_SIZE): MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> {
  return async (c, next) => {
    // Check Content-Length header first
    const contentLength = c.req.header('Content-Length');
    if (contentLength) {
      const size = Number.parseInt(contentLength, 10);
      if (!Number.isNaN(size) && size > maxSize) {
        return errors.badRequest(c, `Request body too large. Maximum size is ${maxSize} bytes.`);
      }
    }

    // For requests with body, verify actual size
    if (c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'PATCH') {
      // Clone the request to read body without consuming it
      const body = await c.req.raw.clone().text();
      if (body.length > maxSize) {
        return errors.badRequest(c, `Request body too large. Maximum size is ${maxSize} bytes.`);
      }
    }

    await next();
  };
}
