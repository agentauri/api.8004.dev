/**
 * CORS configuration
 * @module lib/middleware/cors
 */

import { cors as honoCors } from 'hono/cors';

/**
 * CORS middleware with default configuration
 * Allows all origins for public API access
 */
export const cors = honoCors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Version', 'X-Request-ID', 'X-API-Key', 'Authorization'],
  exposeHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // 24 hours
});
