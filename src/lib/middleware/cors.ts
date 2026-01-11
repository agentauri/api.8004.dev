/**
 * CORS configuration
 * @module lib/middleware/cors
 */

import type { Context, Next } from 'hono';
import { cors as honoCors } from 'hono/cors';
import type { Env, Variables } from '@/types';

/**
 * Allowed origins for CORS (always allowed)
 */
const PRODUCTION_ORIGINS = ['https://8004.dev', 'https://www.8004.dev'];

/**
 * Development-only origins (localhost)
 */
const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173', // Vite dev server
];

/**
 * Build allowed origins list based on environment
 */
function getAllowedOrigins(env: Env | undefined): string[] {
  const origins = [...PRODUCTION_ORIGINS];
  // Only allow localhost in development/test environments
  // Default to allowing localhost if env is not set (test scenario)
  if (!env || env.ENVIRONMENT !== 'production') {
    origins.push(...DEVELOPMENT_ORIGINS);
  }
  return origins;
}

/**
 * CORS middleware with environment-aware origins
 * Localhost origins only allowed in development
 */
export const cors = async (
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
): Promise<Response | void> => {
  const allowedOrigins = getAllowedOrigins(c.env);

  const corsMiddleware = honoCors({
    origin: (origin) => {
      // Reject requests with no origin header in browser contexts
      // Server-to-server requests (no origin) will still work but won't get CORS headers
      if (!origin) return null;

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
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

  return corsMiddleware(c, next);
};
