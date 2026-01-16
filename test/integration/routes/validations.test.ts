/**
 * Validations route integration tests
 * @module test/integration/routes/validations
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

/**
 * Create a mock subgraph response for validations
 */
function mockSubgraphValidationsResponse(validations: unknown[] = []) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: { validations },
      }),
  };
}

/**
 * Create a mock subgraph response for agent stats
 */
function mockSubgraphAgentStatsResponse(agentStats: unknown = null) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: { agentStats },
      }),
  };
}

describe('Validations Route', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  describe('GET /api/v1/agents/:agentId/validations', () => {
    it('returns validations for valid agent ID', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(
            mockSubgraphValidationsResponse([
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
            ])
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:1/validations');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe('val-1');
      expect(body.data[0].status).toBe('COMPLETED');
      expect(body.meta.total).toBe(2);
      expect(body.meta.summary.completed).toBe(1);
      expect(body.meta.summary.pending).toBe(1);
    });

    it('returns empty array when no validations exist', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(mockSubgraphValidationsResponse([]));
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:999/validations');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('rejects invalid agent ID format', async () => {
      const response = await testRoute('/api/v1/agents/invalid-id/validations');

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid agent ID format');
    });

    it('transforms timestamps to ISO format', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(
            mockSubgraphValidationsResponse([
              {
                id: 'val-1',
                validatorAddress: '0x1234567890abcdef1234567890abcdef12345678',
                status: 'COMPLETED',
                createdAt: '1700000000', // Unix timestamp
                updatedAt: '1700001000',
              },
            ])
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:1/validations');

      expect(response.status).toBe(200);
      const body = await response.json();
      // Should be ISO string format
      expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('GET /api/v1/agents/:agentId/validations/summary', () => {
    it('returns validation summary for valid agent', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(
            mockSubgraphValidationsResponse([
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
            ])
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:1/validations/summary');

      expect(response.status).toBe(200);
      const body = await response.json();
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
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          return Promise.resolve(mockSubgraphValidationsResponse([]));
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:999/validations/summary');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.totalCount).toBe(0);
      expect(body.data.validationScore).toBe(0);
      expect(body.data.uniqueValidators).toBe(0);
      expect(body.data.tags).toEqual([]);
    });

    it('rejects invalid agent ID format', async () => {
      const response = await testRoute('/api/v1/agents/bad-format/validations/summary');

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    it('uses AgentStats when available from subgraph', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('thegraph.com')) {
          callCount++;
          // First call is for validations, second is for agentStats
          if (callCount === 1) {
            return Promise.resolve(
              mockSubgraphValidationsResponse([
                {
                  id: 'val-1',
                  validatorAddress: '0x1234567890abcdef1234567890abcdef12345678',
                  status: 'COMPLETED',
                  tag: 'audit',
                  createdAt: '1700000000',
                  updatedAt: '1700001000',
                },
              ])
            );
          }
          // Second call for agentStats
          return Promise.resolve(
            mockSubgraphAgentStatsResponse({
              id: '11155111:1',
              totalFeedback: 10,
              totalValidations: 5,
              completedValidations: 4,
              pendingValidations: 1,
              averageScore: 85,
              averageValidationScore: 90,
              scoreDistribution: [1, 1, 2, 3, 3],
              uniqueValidators: 3,
              uniqueSubmitters: 7,
              updatedAt: '1700000000',
            })
          );
        }
        return Promise.resolve(mockHealthyResponse());
      });

      const response = await testRoute('/api/v1/agents/11155111:1/validations/summary');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      // Should use AgentStats values when available
      expect(body.data.validationScore).toBe(90); // averageValidationScore from AgentStats
      expect(body.data.stats).toBeDefined();
      expect(body.data.stats.totalFeedback).toBe(10);
      expect(body.data.stats.averageValidationScore).toBe(90);
    });
  });
});
