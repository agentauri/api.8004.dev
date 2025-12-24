/**
 * OAuth Metadata Routes tests
 * @module test/unit/oauth/metadata
 */

import { env } from 'cloudflare:test';
import { metadata } from '@/oauth/routes/metadata';
import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

// Create test app with metadata routes mounted
function createTestApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.route('/.well-known', metadata);
  return app;
}

describe('OAuth Metadata Routes', () => {
  describe('GET /.well-known/oauth-protected-resource', () => {
    it('returns protected resource metadata', async () => {
      const app = createTestApp();
      const res = await app.request('/.well-known/oauth-protected-resource', {}, env);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.resource).toBeDefined();
      expect(body.authorization_servers).toBeInstanceOf(Array);
      expect(body.authorization_servers.length).toBeGreaterThan(0);
      expect(body.scopes_supported).toContain('mcp:read');
      expect(body.scopes_supported).toContain('mcp:write');
      expect(body.bearer_methods_supported).toContain('header');
      expect(body.resource_name).toBe('8004 Agents MCP');
      expect(body.resource_documentation).toBeDefined();
    });

    it('sets Cache-Control header', async () => {
      const app = createTestApp();
      const res = await app.request('/.well-known/oauth-protected-resource', {}, env);

      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });

    it('uses OAUTH_ISSUER from environment when set', async () => {
      const customEnv = {
        ...env,
        OAUTH_ISSUER: 'https://custom-issuer.example.com',
      };

      const app = createTestApp();
      const res = await app.request('/.well-known/oauth-protected-resource', {}, customEnv);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe('https://custom-issuer.example.com');
      expect(body.authorization_servers[0]).toBe('https://custom-issuer.example.com');
    });

    it('uses default issuer when OAUTH_ISSUER is not set', async () => {
      const envWithoutIssuer = {
        ...env,
        OAUTH_ISSUER: undefined,
      };

      const app = createTestApp();
      const res = await app.request('/.well-known/oauth-protected-resource', {}, envWithoutIssuer);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe('https://api.8004.dev');
    });
  });

  describe('GET /.well-known/oauth-authorization-server', () => {
    it('returns authorization server metadata', async () => {
      const app = createTestApp();
      const res = await app.request('/.well-known/oauth-authorization-server', {}, env);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.issuer).toBeDefined();
      expect(body.authorization_endpoint).toContain('/oauth/authorize');
      expect(body.token_endpoint).toContain('/oauth/token');
      expect(body.registration_endpoint).toContain('/oauth/register');
      expect(body.scopes_supported).toContain('mcp:read');
      expect(body.scopes_supported).toContain('mcp:write');
      expect(body.response_types_supported).toContain('code');
      expect(body.response_modes_supported).toContain('query');
      expect(body.grant_types_supported).toContain('authorization_code');
      expect(body.grant_types_supported).toContain('refresh_token');
      expect(body.token_endpoint_auth_methods_supported).toContain('client_secret_post');
      expect(body.token_endpoint_auth_methods_supported).toContain('client_secret_basic');
      expect(body.token_endpoint_auth_methods_supported).toContain('none');
      expect(body.code_challenge_methods_supported).toContain('S256');
      expect(body.service_documentation).toBeDefined();
    });

    it('sets Cache-Control header', async () => {
      const app = createTestApp();
      const res = await app.request('/.well-known/oauth-authorization-server', {}, env);

      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });

    it('uses OAUTH_ISSUER from environment when set', async () => {
      const customEnv = {
        ...env,
        OAUTH_ISSUER: 'https://auth.example.com',
      };

      const app = createTestApp();
      const res = await app.request('/.well-known/oauth-authorization-server', {}, customEnv);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.issuer).toBe('https://auth.example.com');
      expect(body.authorization_endpoint).toBe('https://auth.example.com/oauth/authorize');
      expect(body.token_endpoint).toBe('https://auth.example.com/oauth/token');
      expect(body.registration_endpoint).toBe('https://auth.example.com/oauth/register');
    });

    it('uses default issuer when OAUTH_ISSUER is not set', async () => {
      const envWithoutIssuer = {
        ...env,
        OAUTH_ISSUER: undefined,
      };

      const app = createTestApp();
      const res = await app.request(
        '/.well-known/oauth-authorization-server',
        {},
        envWithoutIssuer
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.issuer).toBe('https://api.8004.dev');
      expect(body.authorization_endpoint).toBe('https://api.8004.dev/oauth/authorize');
    });
  });
});
