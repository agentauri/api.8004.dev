/**
 * Token Service tests
 * @module test/unit/oauth/token-service
 */

import { env } from 'cloudflare:test';
import {
  cleanupExpiredTokens,
  createAccessToken,
  createAuthorizationCode,
  createRefreshToken,
  extractBearerToken,
  generateAuthorizationCode,
  generateId,
  generateToken,
  getTokenExpiresIn,
  hashToken,
  markAuthorizationCodeUsed,
  revokeAllClientTokens,
  revokeRefreshToken,
  validateAccessToken,
  validateAuthorizationCode,
  validateRefreshToken,
} from '@/oauth/services/token-service';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Token Service', () => {
  describe('generateToken', () => {
    it('generates a token of correct length', () => {
      const token = generateToken();
      // 32 bytes base64url encoded = 43 characters
      expect(token.length).toBe(43);
    });

    it('generates unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });

    it('generates tokens with valid base64url characters', () => {
      const token = generateToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('generateAuthorizationCode', () => {
    it('generates a code of correct length', () => {
      const code = generateAuthorizationCode();
      // 16 bytes base64url encoded = 22 characters
      expect(code.length).toBe(22);
    });

    it('generates unique codes', () => {
      const code1 = generateAuthorizationCode();
      const code2 = generateAuthorizationCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe('generateId', () => {
    it('generates a valid UUID', () => {
      const id = generateId();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidPattern);
    });

    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('hashToken', () => {
    it('produces consistent hashes for same input', async () => {
      const token = 'test-token-12345';
      const hash1 = await hashToken(token);
      const hash2 = await hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different inputs', async () => {
      const hash1 = await hashToken('token1');
      const hash2 = await hashToken('token2');
      expect(hash1).not.toBe(hash2);
    });

    it('produces 43-character base64url hash', async () => {
      const hash = await hashToken('any-token');
      expect(hash.length).toBe(43);
      expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('extractBearerToken', () => {
    it('extracts token from valid Authorization header', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer test-token-123' },
      });
      expect(extractBearerToken(request)).toBe('test-token-123');
    });

    it('returns null when no Authorization header', () => {
      const request = new Request('http://localhost');
      expect(extractBearerToken(request)).toBeNull();
    });

    it('returns null for non-Bearer auth', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(extractBearerToken(request)).toBeNull();
    });

    it('handles case-insensitive Bearer prefix', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'bearer my-token' },
      });
      expect(extractBearerToken(request)).toBe('my-token');
    });

    it('returns null for malformed header', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer' },
      });
      expect(extractBearerToken(request)).toBeNull();
    });

    it('returns null for header with too many parts', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer token extra' },
      });
      expect(extractBearerToken(request)).toBeNull();
    });
  });

  describe('getTokenExpiresIn', () => {
    it('calculates correct seconds until expiration', () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const expiresIn = getTokenExpiresIn(futureDate);
      // Should be approximately 3600 seconds
      expect(expiresIn).toBeGreaterThan(3590);
      expect(expiresIn).toBeLessThanOrEqual(3600);
    });

    it('returns 0 for expired token', () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      expect(getTokenExpiresIn(pastDate)).toBe(0);
    });

    it('returns 0 for current time', () => {
      const now = new Date().toISOString();
      expect(getTokenExpiresIn(now)).toBe(0);
    });
  });

  describe('Database Operations', () => {
    const testClientId = 'test-client';
    const testScope = 'mcp:read mcp:write';
    const testResource = 'https://api.8004.dev/mcp';
    const testRedirectUri = 'http://localhost:3000/callback';
    const testCodeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    beforeEach(async () => {
      // Insert test client
      await env.DB.prepare(
        `INSERT INTO oauth_clients (id, client_id, client_name, redirect_uris, grant_types, token_endpoint_auth_method)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          testClientId,
          'Test Client',
          JSON.stringify([testRedirectUri]),
          JSON.stringify(['authorization_code']),
          'client_secret_post'
        )
        .run();
    });

    afterEach(async () => {
      // Cleanup is handled by test/setup.ts
    });

    describe('createAccessToken', () => {
      it('creates and stores access token', async () => {
        const token = await createAccessToken(env.DB, testClientId, testScope, testResource, 3600);

        expect(token).toBeDefined();
        expect(token.length).toBe(43);

        // Verify token is stored (by validating it)
        const result = await validateAccessToken(env.DB, token);
        expect(result.valid).toBe(true);
      });
    });

    describe('createRefreshToken', () => {
      it('creates and stores refresh token', async () => {
        const token = await createRefreshToken(
          env.DB,
          testClientId,
          testScope,
          testResource,
          86400
        );

        expect(token).toBeDefined();
        expect(token.length).toBe(43);

        // Verify token is stored (by validating it)
        const result = await validateRefreshToken(env.DB, token, testClientId);
        expect(result).not.toBeNull();
      });
    });

    describe('validateAccessToken', () => {
      it('validates a valid token', async () => {
        const token = await createAccessToken(env.DB, testClientId, testScope, testResource, 3600);
        const result = await validateAccessToken(env.DB, token);

        expect(result.valid).toBe(true);
        expect(result.token).toBeDefined();
        expect(result.token?.client_id).toBe(testClientId);
      });

      it('rejects invalid token', async () => {
        const result = await validateAccessToken(env.DB, 'invalid-token');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('invalid_grant');
      });

      it('rejects expired token', async () => {
        // Create token with 1 second TTL
        const token = await createAccessToken(env.DB, testClientId, testScope, testResource, 1);

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const result = await validateAccessToken(env.DB, token);
        expect(result.valid).toBe(false);
      });
    });

    describe('validateRefreshToken', () => {
      it('validates a valid refresh token', async () => {
        const token = await createRefreshToken(
          env.DB,
          testClientId,
          testScope,
          testResource,
          86400
        );
        const result = await validateRefreshToken(env.DB, token, testClientId);

        expect(result).not.toBeNull();
        expect(result?.client_id).toBe(testClientId);
      });

      it('rejects token with wrong client ID', async () => {
        const token = await createRefreshToken(
          env.DB,
          testClientId,
          testScope,
          testResource,
          86400
        );
        const result = await validateRefreshToken(env.DB, token, 'wrong-client');

        expect(result).toBeNull();
      });

      it('rejects invalid token', async () => {
        const result = await validateRefreshToken(env.DB, 'invalid', testClientId);
        expect(result).toBeNull();
      });
    });

    describe('Authorization Code Flow', () => {
      it('creates and validates authorization code', async () => {
        const code = await createAuthorizationCode(
          env.DB,
          testClientId,
          testRedirectUri,
          testCodeChallenge,
          'S256',
          testResource,
          testScope,
          'test-state',
          600
        );

        expect(code).toBeDefined();
        expect(code.length).toBe(22);

        const result = await validateAuthorizationCode(env.DB, code, testClientId, testRedirectUri);

        expect(result).not.toBeNull();
        expect(result?.client_id).toBe(testClientId);
        expect(result?.code_challenge).toBe(testCodeChallenge);
      });

      it('rejects used authorization code', async () => {
        const code = await createAuthorizationCode(
          env.DB,
          testClientId,
          testRedirectUri,
          testCodeChallenge,
          'S256',
          testResource,
          testScope,
          null,
          600
        );

        const firstValidation = await validateAuthorizationCode(
          env.DB,
          code,
          testClientId,
          testRedirectUri
        );
        expect(firstValidation).not.toBeNull();

        // Mark as used
        await markAuthorizationCodeUsed(env.DB, firstValidation?.id);

        // Second validation should fail
        const secondValidation = await validateAuthorizationCode(
          env.DB,
          code,
          testClientId,
          testRedirectUri
        );
        expect(secondValidation).toBeNull();
      });

      it('rejects code with wrong redirect URI', async () => {
        const code = await createAuthorizationCode(
          env.DB,
          testClientId,
          testRedirectUri,
          testCodeChallenge,
          'S256',
          testResource,
          testScope,
          null,
          600
        );

        const result = await validateAuthorizationCode(
          env.DB,
          code,
          testClientId,
          'http://wrong-uri.com/callback'
        );

        expect(result).toBeNull();
      });
    });

    describe('revokeRefreshToken', () => {
      it('revokes a refresh token', async () => {
        const token = await createRefreshToken(
          env.DB,
          testClientId,
          testScope,
          testResource,
          86400
        );

        // Validate first
        const beforeRevoke = await validateRefreshToken(env.DB, token, testClientId);
        expect(beforeRevoke).not.toBeNull();

        // Revoke
        await revokeRefreshToken(env.DB, beforeRevoke?.id);

        // Should be invalid now
        const afterRevoke = await validateRefreshToken(env.DB, token, testClientId);
        expect(afterRevoke).toBeNull();
      });
    });

    describe('revokeAllClientTokens', () => {
      it('revokes all tokens for a client', async () => {
        // Create multiple tokens
        const accessToken = await createAccessToken(
          env.DB,
          testClientId,
          testScope,
          testResource,
          3600
        );
        const refreshToken = await createRefreshToken(
          env.DB,
          testClientId,
          testScope,
          testResource,
          86400
        );

        // Verify tokens are valid
        expect((await validateAccessToken(env.DB, accessToken)).valid).toBe(true);
        expect(await validateRefreshToken(env.DB, refreshToken, testClientId)).not.toBeNull();

        // Revoke all
        await revokeAllClientTokens(env.DB, testClientId);

        // Both should be invalid now
        expect((await validateAccessToken(env.DB, accessToken)).valid).toBe(false);
        expect(await validateRefreshToken(env.DB, refreshToken, testClientId)).toBeNull();
      });
    });

    describe('cleanupExpiredTokens', () => {
      it('removes expired tokens', async () => {
        // Create tokens with very short TTL
        await createAccessToken(env.DB, testClientId, testScope, testResource, 1);
        await createRefreshToken(env.DB, testClientId, testScope, testResource, 1);
        await createAuthorizationCode(
          env.DB,
          testClientId,
          testRedirectUri,
          testCodeChallenge,
          'S256',
          testResource,
          testScope,
          null,
          1
        );

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 1100));

        // Cleanup
        const deleted = await cleanupExpiredTokens(env.DB);

        // Should have deleted the expired tokens
        expect(deleted).toBeGreaterThanOrEqual(3);
      });

      it('does not remove non-expired tokens', async () => {
        // Create tokens with long TTL
        const accessToken = await createAccessToken(
          env.DB,
          testClientId,
          testScope,
          testResource,
          3600
        );

        // Cleanup
        await cleanupExpiredTokens(env.DB);

        // Token should still be valid
        const result = await validateAccessToken(env.DB, accessToken);
        expect(result.valid).toBe(true);
      });
    });
  });
});
