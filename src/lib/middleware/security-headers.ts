/**
 * Security headers middleware
 * @module lib/middleware/security-headers
 */

import type { Env, Variables } from '@/types';
import type { MiddlewareHandler } from 'hono';

/**
 * Security headers middleware
 * Sets standard security headers for all responses
 */
export function securityHeaders(): MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> {
  return async (c, next) => {
    await next();

    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');

    // Enable XSS filter
    c.header('X-XSS-Protection', '1; mode=block');

    // Control referrer information
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy for API responses
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

    // Strict Transport Security (HSTS)
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Permissions Policy
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  };
}
