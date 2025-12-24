/**
 * OAuth 2.0 Dynamic Client Registration endpoint
 * Implements RFC 7591
 * @module oauth/routes/register
 */

import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { registerClient, validateRegistrationRequest } from '../services/client-service';
import type { ClientRegistrationRequest, OAuthErrorResponse } from '../types';

const register = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST /oauth/register
 * Dynamic Client Registration endpoint
 *
 * Allows clients to register themselves dynamically
 * Required for MCP clients like Claude Desktop
 */
register.post('/', async (c) => {
  let body: ClientRegistrationRequest;

  try {
    body = await c.req.json();
  } catch {
    const error: OAuthErrorResponse = {
      error: 'invalid_request',
      error_description: 'Invalid JSON body',
    };
    return c.json(error, 400);
  }

  // Validate request
  const validationError = validateRegistrationRequest(body);
  if (validationError) {
    const error: OAuthErrorResponse = {
      error: 'invalid_request',
      error_description: validationError,
    };
    return c.json(error, 400);
  }

  try {
    const client = await registerClient(c.env.DB, body);

    return c.json(client, 201, {
      'Cache-Control': 'no-store',
    });
  } catch (err) {
    console.error('Client registration error:', err);

    const error: OAuthErrorResponse = {
      error: 'server_error',
      error_description: 'Failed to register client',
    };
    return c.json(error, 500);
  }
});

export { register };
