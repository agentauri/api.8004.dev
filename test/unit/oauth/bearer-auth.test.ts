/**
 * Bearer Auth Middleware tests
 * @module test/unit/oauth/bearer-auth
 */

import { env } from 'cloudflare:test';
import { hasScope, mcpDualAuth, mcpRequireAuth } from '@/oauth/middleware/bearer-auth';
import { createAccessToken } from '@/oauth/services/token-service';
import type { Env } from '@/types';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Bearer Auth Middleware', () => {
  const testClientId = 'test-bearer-client';
  const testScope = 'mcp:read mcp:write';
  const testResource = 'https://api.8004.dev/mcp';

  beforeEach(async () => {
    // Insert test client
    await env.DB.prepare(
      `INSERT INTO oauth_clients (id, client_id, client_name, redirect_uris, grant_types, token_endpoint_auth_method)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        testClientId,
        'Test Bearer Client',
        JSON.stringify(['http://localhost:3000/callback']),
        JSON.stringify(['authorization_code']),
        'client_secret_post'
      )
      .run();
  });

  afterEach(async () => {
    // Cleanup is handled by test/setup.ts
  });

  describe('mcpDualAuth', () => {
    it('allows requests without Authorization header (anonymous access)', async () => {
      const app = new Hono<{ Bindings: Env }>();
      app.use('*', mcpDualAuth());
      app.get('/test', (c) => {
        const isAuth = c.get('isOAuthAuthenticated');
        return c.json({ isAuthenticated: isAuth });
      });

      const res = await app.request('/test', {}, env);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isAuthenticated).toBe(false);
    });

    it('validates and accepts valid Bearer token', async () => {
      const token = await createAccessToken(env.DB, testClientId, testScope, testResource, 3600);

      const app = new Hono<{ Bindings: Env }>();
      app.use('*', mcpDualAuth());
      app.get('/test', (c) => {
        return c.json({
          isAuthenticated: c.get('isOAuthAuthenticated'),
          clientId: c.get('oauthClientId'),
          scope: c.get('oauthScope'),
        });
      });

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isAuthenticated).toBe(true);
      expect(body.clientId).toBe(testClientId);
      expect(body.scope).toBe(testScope);
    });

    it('rejects invalid Bearer token with 401', async () => {
      const app = new Hono<{ Bindings: Env }>();
      app.use('*', mcpDualAuth());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: 'Bearer invalid-token-here',
          },
        },
        env
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe(-32001);
      expect(body.error.message).toContain('Invalid');
      expect(res.headers.get('WWW-Authenticate')).toContain('Bearer');
      expect(res.headers.get('WWW-Authenticate')).toContain('invalid_token');
    });
  });

  describe('mcpRequireAuth', () => {
    it('rejects requests without Authorization header', async () => {
      const app = new Hono<{ Bindings: Env }>();
      app.use('*', mcpRequireAuth());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {}, env);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe(-32001);
      expect(body.error.message).toContain('Authentication required');
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="8004-mcp"');
    });

    it('validates and accepts valid Bearer token', async () => {
      const token = await createAccessToken(env.DB, testClientId, testScope, testResource, 3600);

      const app = new Hono<{ Bindings: Env }>();
      app.use('*', mcpRequireAuth());
      app.get('/test', (c) => {
        return c.json({
          isAuthenticated: c.get('isOAuthAuthenticated'),
          clientId: c.get('oauthClientId'),
        });
      });

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        env
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isAuthenticated).toBe(true);
      expect(body.clientId).toBe(testClientId);
    });

    it('rejects invalid Bearer token', async () => {
      const app = new Hono<{ Bindings: Env }>();
      app.use('*', mcpRequireAuth());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request(
        '/test',
        {
          headers: {
            Authorization: 'Bearer bad-token',
          },
        },
        env
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe(-32001);
      expect(body.error.message).toContain('Invalid');
    });
  });

  describe('hasScope', () => {
    it('returns true when scope is undefined (anonymous access)', () => {
      const mockContext = {
        get: () => undefined,
      };
      expect(hasScope(mockContext, 'mcp:read')).toBe(true);
    });

    it('returns true when required scope is present', () => {
      const mockContext = {
        get: () => 'mcp:read mcp:write admin',
      };
      expect(hasScope(mockContext, 'mcp:read')).toBe(true);
      expect(hasScope(mockContext, 'mcp:write')).toBe(true);
      expect(hasScope(mockContext, 'admin')).toBe(true);
    });

    it('returns false when required scope is missing', () => {
      const mockContext = {
        get: () => 'mcp:read',
      };
      expect(hasScope(mockContext, 'mcp:write')).toBe(false);
      expect(hasScope(mockContext, 'admin')).toBe(false);
    });

    it('handles single scope correctly', () => {
      const mockContext = {
        get: () => 'mcp:read',
      };
      expect(hasScope(mockContext, 'mcp:read')).toBe(true);
    });
  });
});
