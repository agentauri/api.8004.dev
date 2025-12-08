/**
 * EAS Indexer service tests
 * @module test/unit/services/eas-indexer
 */

import { env } from 'cloudflare:test';
import { getEasSyncState } from '@/db/queries';
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

    it('handles empty attestation response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { attestations: [] },
          }),
      });

      const service = createEASIndexerService(env.DB);
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(true);
      expect(result.attestationsProcessed).toBe(0);
      expect(result.newFeedbackCount).toBe(0);
    });

    it('handles GraphQL errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            errors: [{ message: 'Schema not found' }],
          }),
      });

      const service = createEASIndexerService(env.DB);
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Schema not found');
    });

    it('handles HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const service = createEASIndexerService(env.DB);
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const service = createEASIndexerService(env.DB);
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('updates sync state on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { attestations: [] },
          }),
      });

      const service = createEASIndexerService(env.DB);
      await service.syncChain(11155111);

      const syncState = await getEasSyncState(env.DB, 11155111);
      expect(syncState).not.toBeNull();
    });

    it('updates sync state with error on failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection failed'));

      const service = createEASIndexerService(env.DB);
      await service.syncChain(84532);

      const syncState = await getEasSyncState(env.DB, 84532);
      expect(syncState).not.toBeNull();
      expect(syncState?.last_error).toBe('Connection failed');
    });

    it('processes attestations but skips decoding failures', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              attestations: [
                {
                  id: '0x123',
                  attester: '0xabc',
                  recipient: '0xdef',
                  refUID: '0x000',
                  revocationTime: 0,
                  expirationTime: 0,
                  time: 1704067200,
                  txid: '0xtx1',
                  data: '0x', // Invalid/empty data
                  schemaId: '0xschema',
                },
              ],
            },
          }),
      });

      const service = createEASIndexerService(env.DB);
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(true);
      expect(result.attestationsProcessed).toBe(1);
      expect(result.newFeedbackCount).toBe(0); // Decoding failed
    });
  });

  describe('syncAll', () => {
    it('syncs all supported chains', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { attestations: [] },
          }),
      });

      const service = createEASIndexerService(env.DB);
      const results = await service.syncAll();

      // Should sync 3 chains
      expect(results.size).toBe(3);
      expect(results.has(11155111)).toBe(true);
      expect(results.has(84532)).toBe(true);
      expect(results.has(80002)).toBe(true);
    });

    it('returns individual results for each chain', async () => {
      // All chains succeed
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { attestations: [] } }),
      });

      const service = createEASIndexerService(env.DB);
      const results = await service.syncAll();

      // All chains should succeed
      for (const result of results.values()) {
        expect(result.success).toBe(true);
        expect(result.attestationsProcessed).toBe(0);
      }
    });

    it('handles mixed success and failure across chains', async () => {
      // First chain succeeds, rest fail
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { attestations: [] } }),
          });
        }
        return Promise.reject(new Error('Chain failed'));
      });

      const service = createEASIndexerService(env.DB);
      const results = await service.syncAll();

      // At least one chain should succeed and at least one should fail
      const successCount = [...results.values()].filter((r) => r.success).length;
      const failCount = [...results.values()].filter((r) => !r.success).length;

      expect(successCount).toBeGreaterThanOrEqual(1);
      expect(failCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('attestation processing', () => {
    it('makes correct GraphQL request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { attestations: [] },
          }),
      });

      const service = createEASIndexerService(env.DB);
      await service.syncChain(11155111);

      expect(mockFetch).toHaveBeenCalled();

      // Verify the first argument is the correct URL
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://sepolia.easscan.org/graphql');

      // Verify the body contains GraphQL query
      const body = JSON.parse(callArgs[1].body);
      expect(body.query).toContain('attestations');
      expect(body.variables).toBeDefined();
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('uses correct endpoint for each chain', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { attestations: [] },
          }),
      });

      const service = createEASIndexerService(env.DB);

      await service.syncChain(11155111);
      let lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toBe('https://sepolia.easscan.org/graphql');

      await service.syncChain(84532);
      lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toBe('https://base-sepolia.easscan.org/graphql');

      await service.syncChain(80002);
      lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toBe('https://polygon-amoy.easscan.org/graphql');
    });
  });
});
