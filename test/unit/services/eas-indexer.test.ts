/**
 * EAS Indexer service tests
 * @module test/unit/services/eas-indexer
 */

import { env } from 'cloudflare:test';
import { createEASIndexerService, decodeAttestationData } from '@/services/eas-indexer';
import { encodeAbiParameters } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/**
 * Helper to encode feedback attestation data for testing
 */
function encodeFeedbackData(
  agentId: string,
  score: number,
  tags: string[],
  context: string
): string {
  return encodeAbiParameters(
    [
      { name: 'agentId', type: 'string' },
      { name: 'score', type: 'uint8' },
      { name: 'tags', type: 'string[]' },
      { name: 'context', type: 'string' },
    ],
    [agentId, score, tags, context]
  );
}

describe('decodeAttestationData', () => {
  it('decodes valid attestation data correctly', () => {
    const encoded = encodeFeedbackData('11155111:1', 5, ['helpful', 'accurate'], 'Great agent!');
    const result = decodeAttestationData(encoded);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe('11155111:1');
    expect(result?.score).toBe(5);
    expect(result?.tags).toEqual(['helpful', 'accurate']);
    expect(result?.context).toBe('Great agent!');
  });

  it('handles empty tags array', () => {
    const encoded = encodeFeedbackData('84532:42', 3, [], 'Average experience');
    const result = decodeAttestationData(encoded);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe('84532:42');
    expect(result?.score).toBe(3);
    expect(result?.tags).toEqual([]);
    expect(result?.context).toBe('Average experience');
  });

  it('handles empty context', () => {
    const encoded = encodeFeedbackData('80002:100', 4, ['fast'], '');
    const result = decodeAttestationData(encoded);

    expect(result).not.toBeNull();
    expect(result?.context).toBeUndefined();
  });

  it('handles hex data without 0x prefix', () => {
    const encoded = encodeFeedbackData('11155111:1', 5, ['test'], 'context');
    // Remove 0x prefix
    const withoutPrefix = encoded.slice(2);
    const result = decodeAttestationData(withoutPrefix);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe('11155111:1');
  });

  it('returns null for score below valid range', () => {
    const encoded = encodeFeedbackData('11155111:1', 0, ['test'], 'context');
    const result = decodeAttestationData(encoded);

    expect(result).toBeNull();
  });

  it('returns null for score above valid range', () => {
    const encoded = encodeFeedbackData('11155111:1', 6, ['test'], 'context');
    const result = decodeAttestationData(encoded);

    expect(result).toBeNull();
  });

  it('returns null for data too short', () => {
    const result = decodeAttestationData('0x1234');

    expect(result).toBeNull();
  });

  it('returns null for invalid hex data', () => {
    const result = decodeAttestationData('0xnotvalidhex');

    expect(result).toBeNull();
  });

  it('returns null for malformed ABI data', () => {
    // Valid hex but not valid ABI encoding
    const result = decodeAttestationData(`0x${'00'.repeat(100)}`);

    expect(result).toBeNull();
  });
});

describe('EASIndexerService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('syncChain with configured schema', () => {
    const TEST_SCHEMA_UID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    it('fetches and processes attestations when schema is configured', async () => {
      const encodedData = encodeFeedbackData('11155111:1', 5, ['helpful'], 'Great agent');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            attestations: [
              {
                id: '0xattestation1',
                attester: '0xuser1',
                recipient: '0x0',
                refUID: '0x0',
                revocationTime: 0,
                expirationTime: 0,
                time: 1700000000,
                txid: '0xtx1',
                data: encodedData,
                schemaId: TEST_SCHEMA_UID,
              },
            ],
          },
        }),
      });

      // Second fetch returns empty to end pagination
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attestations: [] } }),
      });

      const service = createEASIndexerService(env.DB, {
        schemaUids: { 11155111: TEST_SCHEMA_UID },
      });
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(true);
      expect(result.attestationsProcessed).toBe(1);
      expect(result.newFeedbackCount).toBe(1);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('handles empty attestations response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attestations: [] } }),
      });

      const service = createEASIndexerService(env.DB, {
        schemaUids: { 11155111: TEST_SCHEMA_UID },
      });
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(true);
      expect(result.attestationsProcessed).toBe(0);
      expect(result.newFeedbackCount).toBe(0);
    });

    it('handles GraphQL errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'GraphQL error occurred' }],
        }),
      });

      const service = createEASIndexerService(env.DB, {
        schemaUids: { 11155111: TEST_SCHEMA_UID },
      });
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(false);
      expect(result.error).toContain('GraphQL error');
    });

    it('handles HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const service = createEASIndexerService(env.DB, {
        schemaUids: { 11155111: TEST_SCHEMA_UID },
      });
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('skips attestations with invalid data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            attestations: [
              {
                id: '0xattestation1',
                attester: '0xuser1',
                recipient: '0x0',
                refUID: '0x0',
                revocationTime: 0,
                expirationTime: 0,
                time: 1700000000,
                txid: '0xtx1',
                data: '0xinvaliddata',
                schemaId: TEST_SCHEMA_UID,
              },
            ],
          },
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attestations: [] } }),
      });

      const service = createEASIndexerService(env.DB, {
        schemaUids: { 11155111: TEST_SCHEMA_UID },
      });
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(true);
      expect(result.attestationsProcessed).toBe(1);
      expect(result.newFeedbackCount).toBe(0); // Invalid data not counted
    });

    it('paginates through multiple pages', async () => {
      const encodedData = encodeFeedbackData('11155111:1', 4, ['fast'], 'Good');

      // First page - full batch (triggers pagination)
      const firstPageAttestations = Array.from({ length: 100 }, (_, i) => ({
        id: `0xattestation${i}`,
        attester: '0xuser1',
        recipient: '0x0',
        refUID: '0x0',
        revocationTime: 0,
        expirationTime: 0,
        time: 1700000000 + i,
        txid: `0xtx${i}`,
        data: encodedData,
        schemaId: TEST_SCHEMA_UID,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attestations: firstPageAttestations } }),
      });

      // Second page - empty (ends pagination)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attestations: [] } }),
      });

      const service = createEASIndexerService(env.DB, {
        schemaUids: { 11155111: TEST_SCHEMA_UID },
      });
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(true);
      expect(result.attestationsProcessed).toBe(100);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('syncChain', () => {
    const PLACEHOLDER_UID = '0x0000000000000000000000000000000000000000000000000000000000000000';

    it('returns error for unsupported chain', async () => {
      const service = createEASIndexerService(env.DB);
      const result = await service.syncChain(999999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported chain: 999999');
      expect(result.attestationsProcessed).toBe(0);
    });

    it('returns early with success when schema UID is placeholder', async () => {
      // Use config override to test placeholder behavior
      const service = createEASIndexerService(env.DB, {
        schemaUids: { 11155111: PLACEHOLDER_UID },
      });
      const result = await service.syncChain(11155111);

      expect(result.success).toBe(true);
      expect(result.attestationsProcessed).toBe(0);
      expect(result.newFeedbackCount).toBe(0);
      // No fetch should have been made since schema UID is placeholder
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles all supported chains with placeholder schema UIDs', async () => {
      const service = createEASIndexerService(env.DB, {
        schemaUids: {
          11155111: PLACEHOLDER_UID,
          84532: PLACEHOLDER_UID,
          80002: PLACEHOLDER_UID,
        },
      });

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
      // Mock fetch for all chains to return empty attestations
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { attestations: [] } }),
      });

      const service = createEASIndexerService(env.DB);
      const results = await service.syncAll();

      // Should process 3 chains
      expect(results.size).toBe(3);
      expect(results.has(11155111)).toBe(true);
      expect(results.has(84532)).toBe(true);
      expect(results.has(80002)).toBe(true);
    });

    it('returns success for all chains when schema UIDs are placeholders', async () => {
      const PLACEHOLDER_UID = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const service = createEASIndexerService(env.DB, {
        schemaUids: {
          11155111: PLACEHOLDER_UID,
          84532: PLACEHOLDER_UID,
          80002: PLACEHOLDER_UID,
        },
      });
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
      // Mock fetch to return empty attestations
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { attestations: [] } }),
      });

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
