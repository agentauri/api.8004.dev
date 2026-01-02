/**
 * Reachability service unit tests
 */

import { createReachabilityService } from '@/services/reachability';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ReachabilityService', () => {
  let mockDb: D1Database;
  let mockPrepare: ReturnType<typeof vi.fn>;
  let mockBind: ReturnType<typeof vi.fn>;
  let mockFirst: ReturnType<typeof vi.fn>;
  let mockAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFirst = vi.fn();
    mockAll = vi.fn();
    mockBind = vi.fn().mockReturnValue({
      first: mockFirst,
      all: mockAll,
    });
    mockPrepare = vi.fn().mockReturnValue({
      bind: mockBind,
    });
    mockDb = {
      prepare: mockPrepare,
    } as unknown as D1Database;
  });

  describe('getAgentReachability', () => {
    it('returns false for both when no feedback exists', async () => {
      mockAll.mockResolvedValue({ results: [] });

      const service = createReachabilityService(mockDb);
      const result = await service.getAgentReachability('11155111:1');

      expect(result.a2a).toBe(false);
      expect(result.mcp).toBe(false);
    });

    it('returns true for a2a when recent feedback with reachability_a2a tag has high score', async () => {
      const now = new Date();
      mockAll.mockResolvedValue({
        results: [
          {
            agent_id: '11155111:1',
            score: 80,
            tags: JSON.stringify(['reachability_a2a']),
            submitted_at: now.toISOString(),
          },
        ],
      });

      const service = createReachabilityService(mockDb);
      const result = await service.getAgentReachability('11155111:1');

      expect(result.a2a).toBe(true);
      expect(result.mcp).toBe(false);
    });

    it('returns true for mcp when recent feedback with reachability_mcp tag has high score', async () => {
      const now = new Date();
      mockAll.mockResolvedValue({
        results: [
          {
            agent_id: '11155111:1',
            score: 75,
            tags: JSON.stringify(['reachability_mcp']),
            submitted_at: now.toISOString(),
          },
        ],
      });

      const service = createReachabilityService(mockDb);
      const result = await service.getAgentReachability('11155111:1');

      expect(result.a2a).toBe(false);
      expect(result.mcp).toBe(true);
    });

    it('returns false when feedback score is below threshold', async () => {
      const now = new Date();
      mockAll.mockResolvedValue({
        results: [
          {
            agent_id: '11155111:1',
            score: 60, // Below threshold of 70
            tags: JSON.stringify(['reachability_a2a']),
            submitted_at: now.toISOString(),
          },
        ],
      });

      const service = createReachabilityService(mockDb);
      const result = await service.getAgentReachability('11155111:1');

      expect(result.a2a).toBe(false);
      expect(result.mcp).toBe(false);
    });

    it('returns true for both when both tags have high scores', async () => {
      const now = new Date();
      mockAll.mockResolvedValue({
        results: [
          {
            agent_id: '11155111:1',
            score: 85,
            tags: JSON.stringify(['reachability_a2a']),
            submitted_at: now.toISOString(),
          },
          {
            agent_id: '11155111:1',
            score: 90,
            tags: JSON.stringify(['reachability_mcp']),
            submitted_at: now.toISOString(),
          },
        ],
      });

      const service = createReachabilityService(mockDb);
      const result = await service.getAgentReachability('11155111:1');

      expect(result.a2a).toBe(true);
      expect(result.mcp).toBe(true);
    });
  });

  describe('getAgentReachabilitiesBatch', () => {
    it('returns empty map when no agent IDs provided', async () => {
      const service = createReachabilityService(mockDb);
      const result = await service.getAgentReachabilitiesBatch([]);

      expect(result.size).toBe(0);
    });

    it('returns default false values for agents without feedback', async () => {
      mockAll.mockResolvedValue({ results: [] });

      const service = createReachabilityService(mockDb);
      const result = await service.getAgentReachabilitiesBatch(['11155111:1', '11155111:2']);

      expect(result.size).toBe(2);
      expect(result.get('11155111:1')).toEqual({ a2a: false, mcp: false });
      expect(result.get('11155111:2')).toEqual({ a2a: false, mcp: false });
    });

    it('returns correct reachability for multiple agents', async () => {
      const now = new Date();
      mockAll.mockResolvedValue({
        results: [
          {
            agent_id: '11155111:1',
            score: 80,
            tags: JSON.stringify(['reachability_a2a']),
            submitted_at: now.toISOString(),
          },
          {
            agent_id: '11155111:2',
            score: 90,
            tags: JSON.stringify(['reachability_mcp']),
            submitted_at: now.toISOString(),
          },
        ],
      });

      const service = createReachabilityService(mockDb);
      const result = await service.getAgentReachabilitiesBatch(['11155111:1', '11155111:2']);

      expect(result.size).toBe(2);
      expect(result.get('11155111:1')).toEqual({ a2a: true, mcp: false });
      expect(result.get('11155111:2')).toEqual({ a2a: false, mcp: true });
    });
  });
});
