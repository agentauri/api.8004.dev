/**
 * Middleware barrel export
 * @module lib/middleware
 */

export { apiKeyAuth, requireApiKey } from './api-key';
export { bodyLimit } from './body-limit';
export { cors } from './cors';
export { requestId } from './request-id';
export { securityHeaders } from './security-headers';
export { x402PaymentMiddleware, PAID_ROUTES, getX402Config } from './x402-payment';
export type { X402Config, RoutePrice } from './x402-payment';
