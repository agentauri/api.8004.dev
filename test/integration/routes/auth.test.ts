/**
 * Authentication integration tests
 * @module test/integration/routes/auth
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('API Key Authentication', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  describe('Protected routes without API key', () => {
    it('returns 401 for /api/v1/agents without API key', async () => {
      const response = await testRoute('/api/v1/agents', { skipAuth: true });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.error).toBe('API key required');
    });

    it('returns 401 for /api/v1/agents/:id without API key', async () => {
      const response = await testRoute('/api/v1/agents/11155111:1', { skipAuth: true });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for /api/v1/search without API key', async () => {
      const response = await testRoute('/api/v1/search', {
        method: 'POST',
        body: { query: 'test' },
        skipAuth: true,
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for /api/v1/chains without API key', async () => {
      const response = await testRoute('/api/v1/chains', { skipAuth: true });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for /api/v1/stats without API key', async () => {
      const response = await testRoute('/api/v1/stats', { skipAuth: true });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for /api/v1/taxonomy without API key', async () => {
      const response = await testRoute('/api/v1/taxonomy', { skipAuth: true });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Protected routes with invalid API key', () => {
    it('returns 401 for invalid API key', async () => {
      const response = await testRoute('/api/v1/agents', {
        skipAuth: true,
        headers: { 'X-API-Key': 'invalid-key' },
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.error).toBe('Invalid API key');
    });

    it('returns 401 for invalid Bearer token', async () => {
      const response = await testRoute('/api/v1/agents', {
        skipAuth: true,
        headers: { Authorization: 'Bearer invalid-token' },
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Public routes (no auth required)', () => {
    it('allows /api/v1/health without API key', async () => {
      const response = await testRoute('/api/v1/health', { skipAuth: true });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBeDefined();
    });

    it('allows root endpoint without API key', async () => {
      const response = await testRoute('/', { skipAuth: true });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.name).toBe('8004-backend');
    });
  });

  describe('Protected routes with valid API key', () => {
    it('allows /api/v1/agents with valid API key', async () => {
      const response = await testRoute('/api/v1/agents');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it('allows /api/v1/chains with valid API key', async () => {
      const response = await testRoute('/api/v1/chains');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it('allows /api/v1/stats with valid API key', async () => {
      const response = await testRoute('/api/v1/stats');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it('allows /api/v1/taxonomy with valid API key', async () => {
      const response = await testRoute('/api/v1/taxonomy');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });
});
