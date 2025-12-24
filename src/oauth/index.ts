/**
 * OAuth 2.0 router for MCP server authentication
 * Supports Claude Desktop via Dynamic Client Registration and PKCE
 * @module oauth
 */

import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { authorize } from './routes/authorize';
import { metadata } from './routes/metadata';
import { register } from './routes/register';
import { token } from './routes/token';

/**
 * OAuth router
 * Mounts all OAuth endpoints
 */
const oauth = new Hono<{ Bindings: Env; Variables: Variables }>();

// Mount routes
oauth.route('/register', register);
oauth.route('/authorize', authorize);
oauth.route('/token', token);

export { metadata, oauth };
