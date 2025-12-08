/**
 * CORS configuration
 * @module lib/middleware/cors
 */

import { cors as honoCors } from 'hono/cors';

/**
 * Allowed origins for CORS
 * Production domains and localhost for development
 */
const ALLOWED_ORIGINS = [
  'https://8004.dev',
  'https://www.8004.dev',
  'http://localhost:3000',
  'http://localhost:5173', // Vite dev server
];

/**
 * CORS middleware with restricted origins
 * Only allows requests from known domains
 */
export const cors = honoCors({
  origin: (origin) => {
    // Reject requests with no origin header in browser contexts
    // Server-to-server requests (no origin) will still work but won't get CORS headers
    if (!origin) return null;

    // Check if origin is in allowed list
    if (ALLOWED_ORIGINS.includes(origin)) {
      return origin;
    }

    // Reject unknown origins by returning null
    return null;
  },
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
