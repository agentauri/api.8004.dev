/**
 * EAS Indexer service tests
 * @module test/unit/services/eas-indexer
 */

import { env } from 'cloudflare:test';
import { createEASIndexerService } from '@/services/eas-indexer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('EASIndexerService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('syncChain', () => {
    it('returns error for unsupported chain', async () => {
      const service = createEASIndexerService(env.DB);
      const result = await service.syncChain(999999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported chain: 999999');
      expect(result.attestationsProcessed).toBe(0);
    });

    it('returns early with success when schema UID is placeholder', async () => {
      // Note: Schema UIDs are currently placeholders, so sync should return early
      // without making any API calls
      const service = createEASIndexerService(env.DB);
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(true);
      expect(result.attestationsProcessed).toBe(0);
      expect(result.newFeedbackCount).toBe(0);
      // No fetch should have been made since schema UID is placeholder
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles all supported chains with placeholder schema UIDs', async () => {
      const service = createEASIndexerService(env.DB);

      // All chains should return early since schema UIDs are placeholders
      const chains = [11155111, 84532, 80002];
      for (const chainId of chains) {
        const result = await service.syncChain(chainId);
        expect(result.success).toBe(true);
        expect(result.attestationsProcessed).toBe(0);
        expect(result.chainId).toBe(chainId);
      }

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('syncAll', () => {
    it('syncs all supported chains', async () => {
      const service = createEASIndexerService(env.DB);
      const results = await service.syncAll();

      // Should process 3 chains
      expect(results.size).toBe(3);
      expect(results.has(11155111)).toBe(true);
      expect(results.has(84532)).toBe(true);
      expect(results.has(80002)).toBe(true);
    });

    it('returns success for all chains when schema UIDs are placeholders', async () => {
      const service = createEASIndexerService(env.DB);
      const results = await service.syncAll();

      // All chains should succeed (with 0 attestations since schema UIDs are placeholders)
      for (const result of results.values()) {
        expect(result.success).toBe(true);
        expect(result.attestationsProcessed).toBe(0);
      }
    });
  });

  describe('chain configuration', () => {
    it('correctly identifies supported chains', async () => {
      const service = createEASIndexerService(env.DB);

      // Supported chains should return success (not "unsupported chain" error)
      const supportedChains = [11155111, 84532, 80002];
      for (const chainId of supportedChains) {
        const result = await service.syncChain(chainId);
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('returns error for unsupported chains', async () => {
      const service = createEASIndexerService(env.DB);

      // Unsupported chains should return error
      const unsupportedChains = [1, 137, 42161, 10];
      for (const chainId of unsupportedChains) {
        const result = await service.syncChain(chainId);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Unsupported chain');
      }
    });
  });
});
