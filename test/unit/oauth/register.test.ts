/**
 * OAuth Client Registration Route tests
 * @module test/unit/oauth/register
 */

import { env } from 'cloudflare:test';
import { register } from '@/oauth/routes/register';
import type { Env, Variables } from '@/types';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

// Create test app with register route mounted
function createTestApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.route('/oauth/register', register);
  return app;
}

describe('OAuth Client Registration Route', () => {
  describe('POST /oauth/register', () => {
    it('registers a new client with valid data', async () => {
      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Test Client',
            redirect_uris: ['https://example.com/callback'],
          }),
        },
        env
      );

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.client_id).toBeDefined();
      expect(body.client_secret).toBeDefined();
      expect(body.client_name).toBe('Test Client');
      expect(body.redirect_uris).toEqual(['https://example.com/callback']);
      expect(body.grant_types).toContain('authorization_code');
      expect(body.client_id_issued_at).toBeDefined();
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('registers client with custom grant_types', async () => {
      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Custom Client',
            redirect_uris: ['https://app.example.com/oauth'],
            grant_types: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_method: 'client_secret_basic',
          }),
        },
        env
      );

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.grant_types).toContain('authorization_code');
      expect(body.grant_types).toContain('refresh_token');
      expect(body.token_endpoint_auth_method).toBe('client_secret_basic');
    });

    it('rejects invalid JSON body', async () => {
      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not valid json',
        },
        env
      );

      expect(res.status).toBe(400);
      const body = await res.json();

      expect(body.error).toBe('invalid_request');
      expect(body.error_description).toBe('Invalid JSON body');
    });

    it('rejects missing client_name', async () => {
      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            redirect_uris: ['https://example.com/callback'],
          }),
        },
        env
      );

      expect(res.status).toBe(400);
      const body = await res.json();

      expect(body.error).toBe('invalid_request');
      expect(body.error_description).toContain('client_name');
    });

    it('rejects missing redirect_uris', async () => {
      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'No Redirects',
          }),
        },
        env
      );

      expect(res.status).toBe(400);
      const body = await res.json();

      expect(body.error).toBe('invalid_request');
      expect(body.error_description).toContain('redirect_uris');
    });

    it('rejects HTTP redirect_uri for non-localhost', async () => {
      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'HTTP Client',
            redirect_uris: ['http://example.com/callback'],
          }),
        },
        env
      );

      expect(res.status).toBe(400);
      const body = await res.json();

      expect(body.error).toBe('invalid_request');
      expect(body.error_description).toContain('Invalid redirect_uri');
    });

    it('accepts localhost HTTP redirect_uri', async () => {
      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Localhost Client',
            redirect_uris: ['http://localhost:3000/callback'],
          }),
        },
        env
      );

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.redirect_uris).toContain('http://localhost:3000/callback');
    });

    it('rejects unsupported grant_type', async () => {
      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Bad Grant Client',
            redirect_uris: ['https://example.com/callback'],
            grant_types: ['client_credentials'],
          }),
        },
        env
      );

      expect(res.status).toBe(400);
      const body = await res.json();

      expect(body.error).toBe('invalid_request');
      expect(body.error_description).toContain('Unsupported grant_type');
    });

    it('handles database errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a broken DB mock
      const brokenEnv = {
        ...env,
        DB: {
          prepare: () => ({
            bind: () => ({
              run: () => Promise.reject(new Error('DB connection failed')),
            }),
          }),
        },
      };

      const app = createTestApp();

      const res = await app.request(
        '/oauth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Error Test Client',
            redirect_uris: ['https://example.com/callback'],
          }),
        },
        brokenEnv
      );

      expect(res.status).toBe(500);
      const body = await res.json();

      expect(body.error).toBe('server_error');
      expect(body.error_description).toBe('Failed to register client');

      consoleSpy.mockRestore();
    });
  });
});
