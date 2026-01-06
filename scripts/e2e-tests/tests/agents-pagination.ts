/**
 * Agents Pagination Tests
 * Tests for offset-based and cursor-based pagination on GET /agents
 */

import { describe, it } from '../test-runner';
import { batchGet, get } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import {
  assertBooleanFlag,
  assertChainIds,
  assertHasSkill,
  assertNoDuplicates,
  assertSorted,
  assertSuccess,
} from '../utils/assertions';

export function registerAgentsPaginationTests(): void {
  // ========== Offset Pagination ==========
  describe('Agents Pagination - Offset', () => {
    it('GET /agents page=1 returns results', async () => {
      const { json } = await get('/agents', { page: 1, limit: 10 });
      assertSuccess(json);
      if (!json.data || json.data.length === 0) {
        throw new Error('Expected results on page 1');
      }
    });

    it('GET /agents page=2 returns different results', async () => {
      // Get page 1
      const { json: page1 } = await get('/agents', { page: 1, limit: 10 });
      assertSuccess(page1);

      // Get page 2
      const { json: page2 } = await get('/agents', { page: 2, limit: 10 });
      assertSuccess(page2);

      if (page1.data && page2.data && page1.data.length > 0 && page2.data.length > 0) {
        const page1Ids = new Set(page1.data.map((a: Agent) => a.id));
        const hasOverlap = page2.data.some((a: Agent) => page1Ids.has(a.id));

        if (hasOverlap) {
          throw new Error('Page 2 should not overlap with page 1');
        }
      }
    });

    it('GET /agents page=3 continues pagination', async () => {
      // Use batchGet to fetch all 3 pages in parallel for speed
      const [{ json: page1 }, { json: page2 }, { json: page3 }] = await batchGet([
        { path: '/agents', params: { page: 1, limit: 5 } },
        { path: '/agents', params: { page: 2, limit: 5 } },
        { path: '/agents', params: { page: 3, limit: 5 } },
      ]);

      assertSuccess(page1);
      assertSuccess(page2);
      assertSuccess(page3);

      // Collect all IDs from all pages
      const allAgents: { id: string }[] = [
        ...((page1.data as Agent[]) || []).map((a) => ({ id: a.id })),
        ...((page2.data as Agent[]) || []).map((a) => ({ id: a.id })),
        ...((page3.data as Agent[]) || []).map((a) => ({ id: a.id })),
      ];

      // Should have no duplicates across pages
      if (allAgents.length > 0) {
        assertNoDuplicates(allAgents, 'id');
      }
    });

    it('GET /agents page beyond results returns empty array', async () => {
      // Request a very high page number
      const { json } = await get('/agents', { page: 9999, limit: 10 });
      assertSuccess(json);

      // Should return empty array, not error
      if (!Array.isArray(json.data)) {
        throw new Error('Expected data to be an array');
      }
      if (json.data.length !== 0) {
        throw new Error(`Expected empty array for page 9999, got ${json.data.length} items`);
      }
    });

    it('GET /agents limit affects page size', async () => {
      // Use batchGet to fetch both in parallel
      const [{ json: small }, { json: large }] = await batchGet([
        { path: '/agents', params: { page: 1, limit: 5 } },
        { path: '/agents', params: { page: 1, limit: 20 } },
      ]);

      assertSuccess(small);
      assertSuccess(large);

      if (small.data && small.data.length > 5) {
        throw new Error(`Expected <= 5 results, got ${small.data.length}`);
      }
      if (large.data && large.data.length > 20) {
        throw new Error(`Expected <= 20 results, got ${large.data.length}`);
      }
    });
  });

  // ========== Cursor Pagination ==========
  describe('Agents Pagination - Cursor', () => {
    it('GET /agents returns nextCursor when hasMore', async () => {
      const { json } = await get('/agents', { limit: 5 });
      assertSuccess(json);

      if (json.meta?.hasMore && !json.meta?.nextCursor) {
        throw new Error('hasMore is true but nextCursor is missing');
      }
    });

    it('GET /agents with cursor returns next page', async () => {
      // Get first page
      const { json: page1 } = await get('/agents', { limit: 5 });
      assertSuccess(page1);

      if (!page1.meta?.nextCursor) {
        // Not enough data for cursor test
        return;
      }

      // Get second page with cursor
      const { json: page2 } = await get('/agents', {
        limit: 5,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);

      // Should return different results
      if (page1.data && page2.data && page1.data.length > 0 && page2.data.length > 0) {
        const page1Ids = new Set(page1.data.map((a: Agent) => a.id));
        const allSame = page2.data.every((a: Agent) => page1Ids.has(a.id));

        if (allSame) {
          throw new Error('Cursor pagination returned same results');
        }
      }
    });

    it('GET /agents cursor pagination no duplicates', async () => {
      const allIds: string[] = [];

      // Get page 1
      const { json: page1 } = await get('/agents', { limit: 10 });
      assertSuccess(page1);

      if (page1.data) {
        for (const a of page1.data as Agent[]) {
          allIds.push(a.id);
        }
      }

      if (!page1.meta?.nextCursor) {
        return;
      }

      // Get page 2
      const { json: page2 } = await get('/agents', {
        limit: 10,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);

      if (page2.data) {
        for (const a of page2.data as Agent[]) {
          allIds.push(a.id);
        }
      }

      // Check for duplicates
      assertNoDuplicates(
        allIds.map((id) => ({ id })),
        'id'
      );
    });

    it('GET /agents cursor + filters works', async () => {
      // Get page 1 with filter
      const { json: page1 } = await get('/agents', {
        mcp: true,
        limit: 5,
      });
      assertSuccess(page1);

      if (page1.data && page1.data.length > 0) {
        assertBooleanFlag(page1.data, 'hasMcp', true);
      }

      if (!page1.meta?.nextCursor) {
        return;
      }

      // Get page 2 with same filter + cursor
      const { json: page2 } = await get('/agents', {
        mcp: true,
        limit: 5,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);

      // Filter should still apply
      if (page2.data && page2.data.length > 0) {
        assertBooleanFlag(page2.data, 'hasMcp', true);
      }
    });

    it('GET /agents cursor + 3 filters (mcp + chainId + skills)', async () => {
      // Get page 1 with 3 filters
      const { json: page1 } = await get('/agents', {
        mcp: true,
        chainId: 11155111,
        skills: 'tool_interaction',
        limit: 5,
      });
      assertSuccess(page1);

      if (page1.data && page1.data.length > 0) {
        assertBooleanFlag(page1.data, 'hasMcp', true);
        assertChainIds(page1.data, [11155111]);
        assertHasSkill(page1.data, 'tool_interaction');
      }

      if (!page1.meta?.nextCursor) {
        console.log('  Note: Not enough data matching 3 filters for cursor test');
        return;
      }

      // Get page 2 with same 3 filters + cursor
      const { json: page2 } = await get('/agents', {
        mcp: true,
        chainId: 11155111,
        skills: 'tool_interaction',
        limit: 5,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);

      // All 3 filters should still apply
      if (page2.data && page2.data.length > 0) {
        assertBooleanFlag(page2.data, 'hasMcp', true);
        assertChainIds(page2.data, [11155111]);
        assertHasSkill(page2.data, 'tool_interaction');
      }

      // Verify no duplicates
      if (page1.data && page2.data) {
        const allIds: string[] = [];
        for (const a of page1.data as Agent[]) allIds.push(a.id);
        for (const a of page2.data as Agent[]) allIds.push(a.id);
        assertNoDuplicates(
          allIds.map((id) => ({ id })),
          'id'
        );
      }
    });

    it('GET /agents total consistency across cursor pages', async () => {
      // Get page 1 with filter
      const { json: page1 } = await get('/agents', {
        mcp: true,
        limit: 10,
      });
      assertSuccess(page1);

      const totalPage1 = page1.meta?.total;

      if (!page1.meta?.nextCursor || totalPage1 === undefined) {
        console.log('  Note: Not enough data for total consistency test');
        return;
      }

      // Get page 2 with same filter
      const { json: page2 } = await get('/agents', {
        mcp: true,
        limit: 10,
        cursor: page1.meta.nextCursor,
      });
      assertSuccess(page2);

      const totalPage2 = page2.meta?.total;

      // Total should be consistent across pages
      if (totalPage1 !== totalPage2) {
        throw new Error(
          `Total changed between pages: page1=${totalPage1}, page2=${totalPage2}`
        );
      }
    });
  });

  // ========== Combined Pagination + Features ==========
  describe('Agents Pagination - Combined', () => {
    it('GET /agents pagination + sorting maintains order', async () => {
      // Get page 1 sorted by name asc
      const { json: page1 } = await get('/agents', {
        sort: 'name',
        order: 'asc',
        page: 1,
        limit: 10,
      });
      assertSuccess(page1);

      if (page1.data && page1.data.length > 1) {
        assertSorted(page1.data, (a: Agent) => (a.name || '').toLowerCase(), 'asc');
      }

      // Get page 2
      const { json: page2 } = await get('/agents', {
        sort: 'name',
        order: 'asc',
        page: 2,
        limit: 10,
      });
      assertSuccess(page2);

      if (page2.data && page2.data.length > 1) {
        assertSorted(page2.data, (a: Agent) => (a.name || '').toLowerCase(), 'asc');
      }

      // First item of page 2 should come after last item of page 1
      if (
        page1.data &&
        page2.data &&
        page1.data.length > 0 &&
        page2.data.length > 0
      ) {
        const lastPage1 = (page1.data[page1.data.length - 1] as Agent).name?.toLowerCase() || '';
        const firstPage2 = (page2.data[0] as Agent).name?.toLowerCase() || '';

        if (firstPage2 < lastPage1) {
          throw new Error(
            `Sort order broken across pages: "${lastPage1}" should come before "${firstPage2}"`
          );
        }
      }
    });

    it('GET /agents pagination + multi-filters', async () => {
      // Get page 1 with multiple filters
      const { json: page1 } = await get('/agents', {
        chainId: 11155111,
        active: true,
        page: 1,
        limit: 5,
      });
      assertSuccess(page1);

      if (page1.data && page1.data.length > 0) {
        assertChainIds(page1.data, [11155111]);
        assertBooleanFlag(page1.data, 'active', true);
      }

      // Get page 2
      const { json: page2 } = await get('/agents', {
        chainId: 11155111,
        active: true,
        page: 2,
        limit: 5,
      });
      assertSuccess(page2);

      // Filters should still apply on page 2
      if (page2.data && page2.data.length > 0) {
        assertChainIds(page2.data, [11155111]);
        assertBooleanFlag(page2.data, 'active', true);
      }
    });

    it('GET /agents pagination + OR mode filters', async () => {
      // Get page 1 with OR mode
      const { json: page1 } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        page: 1,
        limit: 5,
      });
      assertSuccess(page1);

      if (page1.data && page1.data.length > 0) {
        for (const agent of page1.data as Agent[]) {
          if (agent.hasMcp !== true && agent.hasA2a !== true) {
            throw new Error(`Agent ${agent.id} should have hasMcp OR hasA2a`);
          }
        }
      }

      // Get page 2
      const { json: page2 } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        page: 2,
        limit: 5,
      });
      assertSuccess(page2);

      // OR filter should still apply on page 2
      if (page2.data && page2.data.length > 0) {
        for (const agent of page2.data as Agent[]) {
          if (agent.hasMcp !== true && agent.hasA2a !== true) {
            throw new Error(`Agent ${agent.id} on page 2 should have hasMcp OR hasA2a`);
          }
        }
      }
    });
  });
}
