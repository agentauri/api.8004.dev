/**
 * x402 Payment Middleware for Hono
 *
 * Implements pay-per-request monetization using the x402 protocol.
 * When enabled, protected endpoints return HTTP 402 Payment Required
 * until a valid payment is provided via the X-PAYMENT header.
 *
 * @module lib/middleware/x402-payment
 * @see https://x402.org
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import { paymentMiddleware } from '@x402/hono';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import type { Network } from '@x402/core/types';
import type { RouteConfig, RoutesConfig } from '@x402/core/server';
import type { Env, Variables } from '@/types';

/**
 * x402 configuration from environment variables
 */
export interface X402Config {
  /** Wallet address to receive payments (0x...) */
  receiverAddress: `0x${string}`;
  /** Facilitator service URL for payment verification */
  facilitatorUrl: string;
  /** CAIP-2 network identifier (e.g., 'eip155:8453' for Base Mainnet) */
  network: Network;
}

/**
 * Price configuration for a protected route
 */
export interface RoutePrice {
  /** USD price per request (e.g., '$0.05') */
  price: string;
  /** Human-readable description of the resource */
  description?: string;
  /** Response MIME type (defaults to 'application/json') */
  mimeType?: string;
}

/** Default facilitator URL for Base Mainnet (Coinbase) */
const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator';

/** Default network (Base Mainnet) */
const DEFAULT_NETWORK: Network = 'eip155:8453';

/** Cached x402 middleware instance (singleton per worker instance) */
let cachedMiddleware: MiddlewareHandler | null = null;
let cachedConfig: string | null = null;

/**
 * Creates x402 payment middleware for Hono applications.
 *
 * This middleware intercepts requests to protected endpoints and:
 * 1. Returns 402 Payment Required if no payment header is present
 * 2. Verifies payment via the facilitator if header is present
 * 3. Allows the request through if payment is valid
 *
 * @param config - x402 configuration (receiver address, facilitator, network)
 * @param routes - Map of route patterns to price configurations
 * @returns Hono middleware handler
 */
function createX402MiddlewareInternal(
  config: X402Config,
  routes: Record<string, RoutePrice>
): MiddlewareHandler {
  // Initialize facilitator client for payment verification
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  });

  // Create x402 resource server and register EVM scheme
  const server = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(server, {});

  // Transform simple route prices to full x402 route config
  const x402Routes: RoutesConfig = {};
  for (const [routePattern, priceConfig] of Object.entries(routes)) {
    const routeConfig: RouteConfig = {
      accepts: {
        scheme: 'exact',
        price: priceConfig.price,
        network: config.network,
        payTo: config.receiverAddress,
      },
      description: priceConfig.description,
      mimeType: priceConfig.mimeType ?? 'application/json',
    };
    x402Routes[routePattern] = routeConfig;
  }

  // Return configured payment middleware
  return paymentMiddleware(x402Routes, server);
}

/**
 * Extracts x402 configuration from environment variables.
 *
 * Returns null if X402_RECEIVER_ADDRESS is not set, which disables
 * payment requirements (endpoints work without payment).
 *
 * @param env - Environment variables
 * @returns x402 configuration or null if disabled
 */
export function getX402Config(env: {
  X402_RECEIVER_ADDRESS?: string;
  X402_FACILITATOR_URL?: string;
  X402_NETWORK?: string;
}): X402Config | null {
  // If no receiver address is set, x402 is disabled
  if (!env.X402_RECEIVER_ADDRESS) {
    return null;
  }

  return {
    receiverAddress: env.X402_RECEIVER_ADDRESS as `0x${string}`,
    facilitatorUrl: env.X402_FACILITATOR_URL ?? DEFAULT_FACILITATOR_URL,
    network: (env.X402_NETWORK ?? DEFAULT_NETWORK) as Network,
  };
}

/**
 * Predefined route configurations for paid endpoints
 */
export const PAID_ROUTES: Record<string, RoutePrice> = {
  'POST /api/v1/compose': {
    price: '$0.05',
    description: 'AI-powered team composition for multi-agent workflows',
  },
  'POST /api/v1/evaluate/*': {
    price: '$0.05',
    description: 'Agent evaluation with AI benchmarks',
  },
  'POST /api/v1/evaluations': {
    price: '$0.05',
    description: 'Queue agent evaluation job',
  },
};

/**
 * Creates a lazy x402 middleware that checks env at request time.
 *
 * This wrapper allows x402 to be conditionally enabled based on
 * environment variables without needing to rebuild the middleware
 * for each request. The actual x402 middleware is cached after
 * first use.
 *
 * @param routes - Route configurations with pricing
 * @returns Middleware handler that conditionally applies x402
 *
 * @example
 * ```typescript
 * // In index.ts
 * app.use('/api/v1/compose', x402PaymentMiddleware(PAID_ROUTES));
 * ```
 */
export function x402PaymentMiddleware(
  routes: Record<string, RoutePrice> = PAID_ROUTES
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    // Check if x402 is configured
    const config = getX402Config(c.env);

    // If x402 is disabled, skip payment middleware
    if (!config) {
      return next();
    }

    // Create config key for caching
    const configKey = `${config.receiverAddress}:${config.facilitatorUrl}:${config.network}`;

    // Create or reuse cached middleware
    if (!cachedMiddleware || cachedConfig !== configKey) {
      cachedMiddleware = createX402MiddlewareInternal(config, routes);
      cachedConfig = configKey;
    }

    // Apply the x402 middleware
    return cachedMiddleware(c, next);
  };
}
