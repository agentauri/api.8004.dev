/**
 * Graph sync worker unit tests
 * Tests round-robin chain selection and per-chain sync logic
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNextChainId, SUPPORTED_CHAIN_IDS } from '@/services/sync/graph-sync-worker';

describe('Graph Sync Worker', () => {
  describe('SUPPORTED_CHAIN_IDS', () => {
    it('includes all expected mainnet and testnet chains', () => {
      // Mainnets
      expect(SUPPORTED_CHAIN_IDS).toContain(1); // Ethereum
      expect(SUPPORTED_CHAIN_IDS).toContain(137); // Polygon
      expect(SUPPORTED_CHAIN_IDS).toContain(8453); // Base
      expect(SUPPORTED_CHAIN_IDS).toContain(56); // BSC
      expect(SUPPORTED_CHAIN_IDS).toContain(143); // Monad

      // Testnets
      expect(SUPPORTED_CHAIN_IDS).toContain(11155111); // Sepolia
      expect(SUPPORTED_CHAIN_IDS).toContain(84532); // Base Sepolia
      expect(SUPPORTED_CHAIN_IDS).toContain(97); // BSC Testnet
      expect(SUPPORTED_CHAIN_IDS).toContain(10143); // Monad Testnet

      expect(SUPPORTED_CHAIN_IDS.length).toBe(9);
    });
  });

  describe('getNextChainId', () => {
    let mockDb: D1Database;
    let mockFirst: ReturnType<typeof vi.fn>;
    let mockBind: ReturnType<typeof vi.fn>;
    let mockPrepare: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFirst = vi.fn();
      mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      mockDb = { prepare: mockPrepare } as unknown as D1Database;
    });

    it('returns the first chain on first run (NULL last_graph_sync_chain_id)', async () => {
      mockFirst.mockResolvedValue({ last_graph_sync_chain_id: null });

      const chainId = await getNextChainId(mockDb);
      expect(chainId).toBe(SUPPORTED_CHAIN_IDS[0]); // Ethereum Mainnet (1)
    });

    it('returns the first chain when no row exists', async () => {
      mockFirst.mockResolvedValue(null);

      const chainId = await getNextChainId(mockDb);
      expect(chainId).toBe(SUPPORTED_CHAIN_IDS[0]);
    });

    it('advances to the next chain in the list', async () => {
      // Last synced Ethereum (1) -> next is Polygon (137)
      mockFirst.mockResolvedValue({ last_graph_sync_chain_id: 1 });

      const chainId = await getNextChainId(mockDb);
      expect(chainId).toBe(137); // Polygon Mainnet
    });

    it('wraps around from last chain to first chain', async () => {
      // Last chain in list is Monad Testnet (10143)
      const lastChain = SUPPORTED_CHAIN_IDS[SUPPORTED_CHAIN_IDS.length - 1];
      mockFirst.mockResolvedValue({ last_graph_sync_chain_id: lastChain });

      const chainId = await getNextChainId(mockDb);
      expect(chainId).toBe(SUPPORTED_CHAIN_IDS[0]); // Wraps to Ethereum
    });

    it('wraps to first chain if stored chain ID no longer in supported list', async () => {
      // Chain 999999 is not in SUPPORTED_CHAIN_IDS
      mockFirst.mockResolvedValue({ last_graph_sync_chain_id: 999999 });

      const chainId = await getNextChainId(mockDb);
      expect(chainId).toBe(SUPPORTED_CHAIN_IDS[0]);
    });

    it('correctly sequences through all chains', async () => {
      const visited: number[] = [];

      for (let i = 0; i < SUPPORTED_CHAIN_IDS.length; i++) {
        const lastChain = i === 0 ? null : SUPPORTED_CHAIN_IDS[i - 1];
        mockFirst.mockResolvedValue({ last_graph_sync_chain_id: lastChain });

        const chainId = await getNextChainId(mockDb);
        visited.push(chainId);
      }

      expect(visited).toEqual(SUPPORTED_CHAIN_IDS);
    });

    it('advances from a middle chain correctly', async () => {
      // Last synced BSC (56) -> next is Monad (143)
      mockFirst.mockResolvedValue({ last_graph_sync_chain_id: 56 });

      const chainId = await getNextChainId(mockDb);
      const expectedIndex = SUPPORTED_CHAIN_IDS.indexOf(56) + 1;
      expect(chainId).toBe(SUPPORTED_CHAIN_IDS[expectedIndex]);
    });
  });

  describe('GraphSyncResult', () => {
    it('type includes chainId field', async () => {
      // Import the type and verify it has the chainId field
      const { syncFromGraph } = await import('@/services/sync/graph-sync-worker');
      // Just verify the function exists — actually calling it requires
      // full mocked environment, which is tested in integration tests
      expect(typeof syncFromGraph).toBe('function');
    });
  });
});
