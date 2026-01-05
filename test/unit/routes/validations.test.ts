/**
 * Validations Route tests
 * @module test/unit/routes/validations
 */

import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env, Variables } from '@/types';

// Mock the SDK module
vi.mock('@/services/sdk', () => ({
  fetchValidationsFromSubgraph: vi.fn(),
  buildSubgraphUrls: vi.fn().mockReturnValue({ 11155111: 'https://mock-subgraph-url' }),
}));

// Import after mocking
import { validations } from '@/routes/validations';
import { fetchValidationsFromSubgraph } from '@/services/sdk';

const mockFetchValidations = fetchValidationsFromSubgraph as ReturnType<typeof vi.fn>;

// Create test app with validations mounted at the expected path
function createTestApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.route('/api/v1/agents/:agentId/validations', validations);
  return app;
}

describe('Validations Route', () => {
  describe('GET /api/v1/agents/:agentId/validations', () => {
    it('returns validations for valid agent ID', async () => {
      mockFetchValidations.mockResolvedValue([
        {
          id: 'val-1',
          validatorAddress: '0x1234567890abcdef1234567890abcdef12345678',
          status: 'COMPLETED',
          tag: 'test-tag',
          requestUri: 'ipfs://request-1',
          responseUri: 'ipfs://response-1',
          createdAt: '1700000000',
          updatedAt: '1700001000',
        },
        {
          id: 'val-2',
          validatorAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
          status: 'PENDING',
          tag: null,
          requestUri: 'ipfs://request-2',
          responseUri: null,
          createdAt: '1700002000',
          updatedAt: '1700002000',
        },
      ]);

      const app = createTestApp();
      const res = await app.request('/api/v1/agents/11155111:1/validations', {}, env);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe('val-1');
      expect(body.data[0].status).toBe('COMPLETED');
      expect(body.meta.total).toBe(2);
      expect(body.meta.summary.completed).toBe(1);
      expect(body.meta.summary.pending).toBe(1);
    });

    it('returns empty array when no validations exist', async () => {
      mockFetchValidations.mockResolvedValue([]);

      const app = createTestApp();
      const res = await app.request('/api/v1/agents/11155111:999/validations', {}, env);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('respects limit parameter', async () => {
      mockFetchValidations.mockResolvedValue([
        {
          id: 'val-1',
          validatorAddress: '0x1234567890abcdef1234567890abcdef12345678',
          status: 'COMPLETED',
          createdAt: '1700000000',
          updatedAt: '1700001000',
        },
      ]);

      const app = createTestApp();
      mockFetchValidations.mockClear();
      const res = await app.request('/api/v1/agents/11155111:1/validations?limit=5', {}, env);

      expect(res.status).toBe(200);
      // Verify correct chainId, agentId and limit were passed
      // subgraphUrls depends on env configuration (GRAPH_API_KEY)
      expect(mockFetchValidations).toHaveBeenCalledWith(
        11155111,
        '11155111:1',
        expect.any(Object),
        5
      );
    });

    it('clamps limit to valid range', async () => {
      mockFetchValidations.mockResolvedValue([]);

      const app = createTestApp();

      // Test max limit clamping (5000 -> 1000)
      mockFetchValidations.mockClear();
      await app.request('/api/v1/agents/11155111:1/validations?limit=5000', {}, env);
      expect(mockFetchValidations).toHaveBeenCalledWith(
        11155111,
        '11155111:1',
        expect.any(Object),
        1000
      );

      // Test min limit clamping (0 -> 1)
      mockFetchValidations.mockClear();
      await app.request('/api/v1/agents/11155111:1/validations?limit=0', {}, env);
      expect(mockFetchValidations).toHaveBeenCalledWith(
        11155111,
        '11155111:1',
        expect.any(Object),
        1
      );
    });

    it('rejects invalid agent ID format', async () => {
      const app = createTestApp();

      const res = await app.request('/api/v1/agents/invalid-id/validations', {}, env);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid agent ID format');
    });

    it('transforms timestamps to ISO format', async () => {
      mockFetchValidations.mockResolvedValue([
        {
          id: 'val-1',
          validatorAddress: '0x1234567890abcdef1234567890abcdef12345678',
          status: 'COMPLETED',
          createdAt: '1700000000', // Unix timestamp
          updatedAt: '1700001000',
        },
      ]);

      const app = createTestApp();
      const res = await app.request('/api/v1/agents/11155111:1/validations', {}, env);

      expect(res.status).toBe(200);
      const body = await res.json();
      // Should be ISO string format
      expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('GET /api/v1/agents/:agentId/validations/summary', () => {
    it('returns validation summary for valid agent', async () => {
      mockFetchValidations.mockResolvedValue([
        {
          id: 'val-1',
          validatorAddress: '0x1234567890abcdef1234567890abcdef12345678',
          status: 'COMPLETED',
          tag: 'audit',
          createdAt: '1700000000',
          updatedAt: '1700001000',
        },
        {
          id: 'val-2',
          validatorAddress: '0x1234567890abcdef1234567890abcdef12345678',
          status: 'COMPLETED',
          tag: 'review',
          createdAt: '1700002000',
          updatedAt: '1700003000',
        },
        {
          id: 'val-3',
          validatorAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
          status: 'PENDING',
          tag: null,
          createdAt: '1700004000',
          updatedAt: '1700004000',
        },
        {
          id: 'val-4',
          validatorAddress: '0xfedcba0987654321fedcba0987654321fedcba09',
          status: 'FAILED',
          tag: 'audit',
          createdAt: '1700005000',
          updatedAt: '1700006000',
        },
      ]);

      const app = createTestApp();
      const res = await app.request('/api/v1/agents/11155111:1/validations/summary', {}, env);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.agentId).toBe('11155111:1');
      expect(body.data.totalCount).toBe(4);
      expect(body.data.completed).toBe(2);
      expect(body.data.pending).toBe(1);
      expect(body.data.failed).toBe(1);
      expect(body.data.uniqueValidators).toBe(3);
      expect(body.data.tags).toContain('audit');
      expect(body.data.tags).toContain('review');
      expect(body.data.validationScore).toBe(50); // 2/4 = 50%
    });

    it('returns zero score for empty validations', async () => {
      mockFetchValidations.mockResolvedValue([]);

      const app = createTestApp();
      const res = await app.request('/api/v1/agents/11155111:999/validations/summary', {}, env);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.totalCount).toBe(0);
      expect(body.data.validationScore).toBe(0);
      expect(body.data.uniqueValidators).toBe(0);
      expect(body.data.tags).toEqual([]);
    });

    it('rejects invalid agent ID format', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/agents/bad-format/validations/summary', {}, env);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });
});
