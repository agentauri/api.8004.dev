/**
 * Client Service tests
 * @module test/unit/oauth/client-service
 */

import { env } from 'cloudflare:test';
import {
  clientExists,
  deleteClient,
  getClientById,
  isGrantTypeAllowed,
  isRedirectUriAllowed,
  isValidRedirectUri,
  registerClient,
  validateClientCredentials,
  validateRegistrationRequest,
} from '@/oauth/services/client-service';
import type { ClientRegistrationRequest, OAuthClient } from '@/oauth/types';
import { describe, expect, it } from 'vitest';

describe('Client Service', () => {
  describe('isValidRedirectUri', () => {
    it('accepts HTTPS URIs', () => {
      expect(isValidRedirectUri('https://example.com/callback')).toBe(true);
      expect(isValidRedirectUri('https://app.example.com/oauth/callback')).toBe(true);
    });

    it('accepts localhost HTTP URIs', () => {
      expect(isValidRedirectUri('http://localhost/callback')).toBe(true);
      expect(isValidRedirectUri('http://localhost:3000/callback')).toBe(true);
      expect(isValidRedirectUri('http://127.0.0.1/callback')).toBe(true);
      expect(isValidRedirectUri('http://127.0.0.1:8080/callback')).toBe(true);
    });

    it('rejects HTTP URIs for non-localhost', () => {
      expect(isValidRedirectUri('http://example.com/callback')).toBe(false);
    });

    it('rejects URIs with fragments', () => {
      expect(isValidRedirectUri('https://example.com/callback#hash')).toBe(false);
    });

    it('rejects invalid URIs', () => {
      expect(isValidRedirectUri('not-a-url')).toBe(false);
      expect(isValidRedirectUri('')).toBe(false);
    });
  });

  describe('validateRegistrationRequest', () => {
    it('accepts valid request', () => {
      const request: ClientRegistrationRequest = {
        client_name: 'Test App',
        redirect_uris: ['https://example.com/callback'],
      };
      expect(validateRegistrationRequest(request)).toBeNull();
    });

    it('rejects missing client_name', () => {
      const request = { redirect_uris: ['https://example.com'] } as ClientRegistrationRequest;
      expect(validateRegistrationRequest(request)).toBe('client_name is required');
    });

    it('rejects empty client_name', () => {
      const request: ClientRegistrationRequest = {
        client_name: '',
        redirect_uris: ['https://example.com'],
      };
      expect(validateRegistrationRequest(request)).toBe('client_name is required');
    });

    it('rejects client_name over 256 characters', () => {
      const request: ClientRegistrationRequest = {
        client_name: 'A'.repeat(257),
        redirect_uris: ['https://example.com'],
      };
      expect(validateRegistrationRequest(request)).toBe(
        'client_name must be 256 characters or less'
      );
    });

    it('rejects missing redirect_uris', () => {
      const request = { client_name: 'Test' } as ClientRegistrationRequest;
      expect(validateRegistrationRequest(request)).toBe('redirect_uris must be a non-empty array');
    });

    it('rejects empty redirect_uris array', () => {
      const request: ClientRegistrationRequest = {
        client_name: 'Test',
        redirect_uris: [],
      };
      expect(validateRegistrationRequest(request)).toBe('redirect_uris must be a non-empty array');
    });

    it('rejects invalid redirect_uri', () => {
      const request: ClientRegistrationRequest = {
        client_name: 'Test',
        redirect_uris: ['http://example.com/callback'],
      };
      const error = validateRegistrationRequest(request);
      expect(error).toContain('Invalid redirect_uri');
    });

    it('accepts valid grant_types', () => {
      const request: ClientRegistrationRequest = {
        client_name: 'Test',
        redirect_uris: ['https://example.com/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
      };
      expect(validateRegistrationRequest(request)).toBeNull();
    });

    it('rejects unsupported grant_types', () => {
      const request: ClientRegistrationRequest = {
        client_name: 'Test',
        redirect_uris: ['https://example.com/callback'],
        grant_types: ['client_credentials'] as unknown as (
          | 'authorization_code'
          | 'refresh_token'
        )[],
      };
      expect(validateRegistrationRequest(request)).toContain('Unsupported grant_type');
    });

    it('accepts valid token_endpoint_auth_method', () => {
      const request: ClientRegistrationRequest = {
        client_name: 'Test',
        redirect_uris: ['https://example.com/callback'],
        token_endpoint_auth_method: 'client_secret_basic',
      };
      expect(validateRegistrationRequest(request)).toBeNull();
    });

    it('rejects unsupported token_endpoint_auth_method', () => {
      const request: ClientRegistrationRequest = {
        client_name: 'Test',
        redirect_uris: ['https://example.com/callback'],
        token_endpoint_auth_method:
          'private_key_jwt' as ClientRegistrationRequest['token_endpoint_auth_method'],
      };
      expect(validateRegistrationRequest(request)).toContain(
        'Unsupported token_endpoint_auth_method'
      );
    });
  });

  describe('isRedirectUriAllowed', () => {
    const mockClient: OAuthClient = {
      id: 'test-id',
      client_id: 'test-client',
      client_secret: null,
      client_name: 'Test',
      redirect_uris: ['https://example.com/callback', 'https://app.example.com/oauth'],
      grant_types: ['authorization_code'],
      token_endpoint_auth_method: 'client_secret_post',
      registered_at: new Date().toISOString(),
    };

    it('returns true for allowed URI', () => {
      expect(isRedirectUriAllowed(mockClient, 'https://example.com/callback')).toBe(true);
      expect(isRedirectUriAllowed(mockClient, 'https://app.example.com/oauth')).toBe(true);
    });

    it('returns false for disallowed URI', () => {
      expect(isRedirectUriAllowed(mockClient, 'https://evil.com/callback')).toBe(false);
    });
  });

  describe('isGrantTypeAllowed', () => {
    const mockClient: OAuthClient = {
      id: 'test-id',
      client_id: 'test-client',
      client_secret: null,
      client_name: 'Test',
      redirect_uris: ['https://example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'client_secret_post',
      registered_at: new Date().toISOString(),
    };

    it('returns true for allowed grant type', () => {
      expect(isGrantTypeAllowed(mockClient, 'authorization_code')).toBe(true);
      expect(isGrantTypeAllowed(mockClient, 'refresh_token')).toBe(true);
    });

    it('returns false for disallowed grant type', () => {
      expect(isGrantTypeAllowed(mockClient, 'client_credentials')).toBe(false);
    });
  });

  describe('Database Operations', () => {
    describe('registerClient', () => {
      it('registers a new client', async () => {
        const request: ClientRegistrationRequest = {
          client_name: 'Test App',
          redirect_uris: ['https://example.com/callback'],
        };

        const response = await registerClient(env.DB, request);

        expect(response.client_id).toBeDefined();
        expect(response.client_secret).toBeDefined();
        expect(response.client_name).toBe('Test App');
        expect(response.redirect_uris).toEqual(['https://example.com/callback']);
        expect(response.grant_types).toEqual(['authorization_code']);
        expect(response.token_endpoint_auth_method).toBe('client_secret_post');
        expect(response.client_id_issued_at).toBeDefined();
      });

      it('uses custom grant_types and auth_method', async () => {
        const request: ClientRegistrationRequest = {
          client_name: 'Custom App',
          redirect_uris: ['https://app.example.com/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'client_secret_basic',
        };

        const response = await registerClient(env.DB, request);

        expect(response.grant_types).toEqual(['authorization_code', 'refresh_token']);
        expect(response.token_endpoint_auth_method).toBe('client_secret_basic');
      });
    });

    describe('getClientById', () => {
      it('returns null for non-existent client', async () => {
        const result = await getClientById(env.DB, 'nonexistent-client');
        expect(result).toBeNull();
      });

      it('returns client for existing client', async () => {
        const request: ClientRegistrationRequest = {
          client_name: 'Get Test',
          redirect_uris: ['https://example.com/callback'],
        };

        const registered = await registerClient(env.DB, request);
        const client = await getClientById(env.DB, registered.client_id);

        expect(client).not.toBeNull();
        expect(client?.client_id).toBe(registered.client_id);
        expect(client?.client_name).toBe('Get Test');
      });
    });

    describe('clientExists', () => {
      it('returns false for non-existent client', async () => {
        const exists = await clientExists(env.DB, 'nonexistent');
        expect(exists).toBe(false);
      });

      it('returns true for existing client', async () => {
        const request: ClientRegistrationRequest = {
          client_name: 'Exists Test',
          redirect_uris: ['https://example.com/callback'],
        };

        const registered = await registerClient(env.DB, request);
        const exists = await clientExists(env.DB, registered.client_id);

        expect(exists).toBe(true);
      });
    });

    describe('validateClientCredentials', () => {
      it('validates correct credentials', async () => {
        const request: ClientRegistrationRequest = {
          client_name: 'Creds Test',
          redirect_uris: ['https://example.com/callback'],
        };

        const registered = await registerClient(env.DB, request);
        const client = await validateClientCredentials(
          env.DB,
          registered.client_id,
          registered.client_secret as string
        );

        expect(client).not.toBeNull();
        expect(client?.client_id).toBe(registered.client_id);
      });

      it('rejects wrong secret', async () => {
        const request: ClientRegistrationRequest = {
          client_name: 'Wrong Secret Test',
          redirect_uris: ['https://example.com/callback'],
        };

        const registered = await registerClient(env.DB, request);
        const client = await validateClientCredentials(
          env.DB,
          registered.client_id,
          'wrong-secret'
        );

        expect(client).toBeNull();
      });

      it('returns null for non-existent client', async () => {
        const client = await validateClientCredentials(env.DB, 'nonexistent', 'any-secret');
        expect(client).toBeNull();
      });
    });

    describe('deleteClient', () => {
      it('deletes an existing client', async () => {
        const request: ClientRegistrationRequest = {
          client_name: 'Delete Test',
          redirect_uris: ['https://example.com/callback'],
        };

        const registered = await registerClient(env.DB, request);

        // Verify exists
        expect(await clientExists(env.DB, registered.client_id)).toBe(true);

        // Delete
        await deleteClient(env.DB, registered.client_id);

        // Verify deleted
        expect(await clientExists(env.DB, registered.client_id)).toBe(false);
      });

      it('does not throw for non-existent client', async () => {
        await expect(deleteClient(env.DB, 'nonexistent')).resolves.not.toThrow();
      });
    });
  });
});
