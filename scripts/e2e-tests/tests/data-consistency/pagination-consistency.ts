/**
 * Pagination Consistency Test Suite
 *
 * Tests all pagination methods (limit, offset, page, cursor)
 * to ensure consistent results across pages and no duplicates.
 */

import { describe, expect, it } from '../../test-runner';
import { get, post } from '../../utils/api-client';
import { assertNoDuplicates, assertSuccess } from '../../utils/assertions';

interface Agent {
  id: string;
  [key: string]: unknown;
}

interface PaginatedResponse {
  success: boolean;
  data?: Agent[];
  meta?: {
    total?: number;
    hasMore?: boolean;
    nextCursor?: string;
  };
}

export function registerPaginationConsistencyTests(): void {
  describe('Pagination - Limit Variations', () => {
    const limits = [1, 5, 10, 20, 50, 100];

    for (const limit of limits) {
      it(`limit=${limit} returns max ${limit} agents`, async () => {
        const { json } = await get('/agents', { limit });
        assertSuccess(json);
        expect(json.data!.length).toBeLessThan(limit + 1);
      });
    }

    it('limit=0 returns error or empty', async () => {
      const { json } = await get('/agents', { limit: 0 });
      // Should either error or return empty/default
      if (json.success) {
        expect(json.data).toBeDefined();
      }
    });

    it('limit > 100 is clamped to 100', async () => {
      const { json } = await get('/agents', { limit: 500 });
      assertSuccess(json);
      expect(json.data!.length).toBeLessThan(101);
    });
  });

  describe('Pagination - Offset', () => {
    it('offset=0 returns first page', async () => {
      const { json: withOffset } = await get('/agents', { limit: 10, offset: 0 });
      const { json: noOffset } = await get('/agents', { limit: 10 });

      assertSuccess(withOffset);
      assertSuccess(noOffset);

      // Should return same results
      const withOffsetIds = withOffset.data!.map((a: Agent) => a.id);
      const noOffsetIds = noOffset.data!.map((a: Agent) => a.id);
      expect(withOffsetIds).toEqual(noOffsetIds);
    });

    it('offset=10 skips first 10 agents', async () => {
      const { json: page1 } = await get('/agents', { limit: 10, offset: 0 });
      const { json: page2 } = await get('/agents', { limit: 10, offset: 10 });

      assertSuccess(page1);
      assertSuccess(page2);

      // Page 2 should not contain any IDs from page 1
      const page1Ids = new Set(page1.data!.map((a: Agent) => a.id));
      const page2Ids = page2.data!.map((a: Agent) => a.id);

      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }
    });

    it('offset pagination covers all results without duplicates', async () => {
      const allIds = new Set<string>();
      const limit = 20;
      let offset = 0;
      let iterations = 0;
      const maxIterations = 5;

      while (iterations < maxIterations) {
        const { json } = await get('/agents', { limit, offset });
        assertSuccess(json);

        if (json.data!.length === 0) break;

        for (const agent of json.data!) {
          expect(allIds.has(agent.id)).toBe(false);
          allIds.add(agent.id);
        }

        offset += limit;
        iterations++;

        if (json.data!.length < limit) break;
      }

      expect(allIds.size).toBeGreaterThan(0);
    });

    it('offset with filter works correctly', async () => {
      const { json: page1 } = await get('/agents', {
        active: true,
        limit: 10,
        offset: 0,
      });
      const { json: page2 } = await get('/agents', {
        active: true,
        limit: 10,
        offset: 10,
      });

      assertSuccess(page1);
      assertSuccess(page2);

      // All agents should be active
      for (const agent of [...page1.data!, ...page2.data!]) {
        expect(agent.active).toBe(true);
      }

      // No duplicates
      const page1Ids = new Set(page1.data!.map((a: Agent) => a.id));
      for (const agent of page2.data!) {
        expect(page1Ids.has(agent.id)).toBe(false);
      }
    });
  });

  describe('Pagination - Page Parameter', () => {
    it('page=1 returns first page', async () => {
      const { json: page1 } = await get('/agents', { limit: 10, page: 1 });
      const { json: noPage } = await get('/agents', { limit: 10 });

      assertSuccess(page1);
      assertSuccess(noPage);

      const page1Ids = page1.data!.map((a: Agent) => a.id);
      const noPageIds = noPage.data!.map((a: Agent) => a.id);
      expect(page1Ids).toEqual(noPageIds);
    });

    it('page=2 returns second page', async () => {
      const { json: page1 } = await get('/agents', { limit: 10, page: 1 });
      const { json: page2 } = await get('/agents', { limit: 10, page: 2 });

      assertSuccess(page1);
      assertSuccess(page2);

      const page1Ids = new Set(page1.data!.map((a: Agent) => a.id));
      for (const agent of page2.data!) {
        expect(page1Ids.has(agent.id)).toBe(false);
      }
    });

    it('page=3 returns third page', async () => {
      const { json: page2 } = await get('/agents', { limit: 10, page: 2 });
      const { json: page3 } = await get('/agents', { limit: 10, page: 3 });

      assertSuccess(page2);
      assertSuccess(page3);

      const page2Ids = new Set(page2.data!.map((a: Agent) => a.id));
      for (const agent of page3.data!) {
        expect(page2Ids.has(agent.id)).toBe(false);
      }
    });

    it('page pagination covers all results without duplicates', async () => {
      const allIds = new Set<string>();
      const limit = 20;
      let page = 1;
      const maxPages = 5;

      while (page <= maxPages) {
        const { json } = await get('/agents', { limit, page });
        assertSuccess(json);

        if (json.data!.length === 0) break;

        for (const agent of json.data!) {
          expect(allIds.has(agent.id)).toBe(false);
          allIds.add(agent.id);
        }

        page++;

        if (json.data!.length < limit) break;
      }

      expect(allIds.size).toBeGreaterThan(0);
    });
  });

  describe('Pagination - Cursor', () => {
    it('first request returns nextCursor when hasMore', async () => {
      const { json } = await get('/agents', { limit: 10 });
      assertSuccess(json);

      if (json.meta?.hasMore) {
        expect(json.meta.nextCursor).toBeDefined();
      }
    });

    it('cursor pagination returns no duplicates', async () => {
      const allIds = new Set<string>();
      let cursor: string | undefined;
      let iterations = 0;
      const maxIterations = 5;

      while (iterations < maxIterations) {
        const params: Record<string, unknown> = { limit: 20 };
        if (cursor) params.cursor = cursor;

        const { json } = await get('/agents', params);
        assertSuccess(json);

        if (json.data!.length === 0) break;

        for (const agent of json.data!) {
          expect(allIds.has(agent.id)).toBe(false);
          allIds.add(agent.id);
        }

        cursor = json.meta?.nextCursor;
        iterations++;

        if (!json.meta?.hasMore) break;
      }

      expect(allIds.size).toBeGreaterThan(0);
    });

    it('cursor pagination with filter returns no duplicates', async () => {
      const allIds = new Set<string>();
      let cursor: string | undefined;
      let iterations = 0;
      const maxIterations = 3;

      while (iterations < maxIterations) {
        const params: Record<string, unknown> = { active: true, limit: 20 };
        if (cursor) params.cursor = cursor;

        const { json } = await get('/agents', params);
        assertSuccess(json);

        if (json.data!.length === 0) break;

        for (const agent of json.data!) {
          expect(allIds.has(agent.id)).toBe(false);
          expect(agent.active).toBe(true);
          allIds.add(agent.id);
        }

        cursor = json.meta?.nextCursor;
        iterations++;

        if (!json.meta?.hasMore) break;
      }

      expect(allIds.size).toBeGreaterThan(0);
    });

    it('cursor pagination with search query', async () => {
      const allIds = new Set<string>();
      let cursor: string | undefined;
      let iterations = 0;
      const maxIterations = 3;

      while (iterations < maxIterations) {
        const params: Record<string, unknown> = { q: 'agent', limit: 20 };
        if (cursor) params.cursor = cursor;

        const { json } = await get('/agents', params);
        assertSuccess(json);

        if (json.data!.length === 0) break;

        for (const agent of json.data!) {
          expect(allIds.has(agent.id)).toBe(false);
          allIds.add(agent.id);
        }

        cursor = json.meta?.nextCursor;
        iterations++;

        if (!json.meta?.hasMore) break;
      }

      expect(allIds.size).toBeGreaterThan(0);
    });
  });

  describe('Pagination - POST /search Cursor', () => {
    it('POST /search supports cursor pagination', async () => {
      const { json: page1 } = await post('/search', {
        query: 'AI',
        limit: 10,
      });

      assertSuccess(page1);

      if (page1.meta?.hasMore && page1.meta?.nextCursor) {
        const { json: page2 } = await post('/search', {
          query: 'AI',
          limit: 10,
          cursor: page1.meta.nextCursor,
        });

        assertSuccess(page2);

        // No duplicates
        const page1Ids = new Set(page1.data!.map((a: Agent) => a.id));
        for (const agent of page2.data!) {
          expect(page1Ids.has(agent.id)).toBe(false);
        }
      }
    });

    it('POST /search cursor with filters', async () => {
      const allIds = new Set<string>();
      let cursor: string | undefined;
      let iterations = 0;

      while (iterations < 3) {
        const body: Record<string, unknown> = {
          query: 'agent',
          limit: 20,
          filters: { active: true },
        };
        if (cursor) body.cursor = cursor;

        const { json } = await post('/search', body);
        assertSuccess(json);

        if (json.data!.length === 0) break;

        for (const agent of json.data!) {
          expect(allIds.has(agent.id)).toBe(false);
          expect(agent.active).toBe(true);
          allIds.add(agent.id);
        }

        cursor = json.meta?.nextCursor;
        iterations++;

        if (!json.meta?.hasMore) break;
      }
    });
  });

  describe('Pagination - Consistency Across Methods', () => {
    it('offset and page return equivalent results', async () => {
      const limit = 10;

      // page=2 should be equivalent to offset=10
      const { json: withPage } = await get('/agents', { limit, page: 2 });
      const { json: withOffset } = await get('/agents', { limit, offset: 10 });

      assertSuccess(withPage);
      assertSuccess(withOffset);

      const pageIds = withPage.data!.map((a: Agent) => a.id);
      const offsetIds = withOffset.data!.map((a: Agent) => a.id);
      expect(pageIds).toEqual(offsetIds);
    });

    it('total count is consistent across pages', async () => {
      const { json: page1 } = await get('/agents', { limit: 10, page: 1 });
      const { json: page2 } = await get('/agents', { limit: 10, page: 2 });

      assertSuccess(page1);
      assertSuccess(page2);

      expect(page1.meta?.total).toBe(page2.meta?.total);
    });

    it('filtered total is consistent across pages', async () => {
      const { json: page1 } = await get('/agents', {
        active: true,
        limit: 10,
        page: 1,
      });
      const { json: page2 } = await get('/agents', {
        active: true,
        limit: 10,
        page: 2,
      });

      assertSuccess(page1);
      assertSuccess(page2);

      expect(page1.meta?.total).toBe(page2.meta?.total);
    });
  });

  describe('Pagination - Edge Cases', () => {
    it('page beyond available data returns empty', async () => {
      const { json: first } = await get('/agents', { limit: 100 });
      assertSuccess(first);

      const total = first.meta?.total ?? 0;
      const beyondPage = Math.ceil(total / 10) + 10;

      const { json: beyond } = await get('/agents', { limit: 10, page: beyondPage });
      assertSuccess(beyond);
      expect(beyond.data!.length).toBe(0);
    });

    it('very large offset returns empty', async () => {
      const { json } = await get('/agents', { limit: 10, offset: 100000 });
      assertSuccess(json);
      expect(json.data!.length).toBe(0);
    });

    it('invalid cursor is handled gracefully', async () => {
      const { json } = await get('/agents', { limit: 10, cursor: 'invalid-cursor-123' });
      // Should either return first page or error gracefully
      if (json.success) {
        expect(json.data).toBeDefined();
      }
    });

    it('negative page is handled', async () => {
      const { json } = await get('/agents', { limit: 10, page: -1 });
      // Should treat as page 1 or error
      if (json.success) {
        expect(json.data).toBeDefined();
      }
    });

    it('negative offset is handled', async () => {
      const { json } = await get('/agents', { limit: 10, offset: -10 });
      // Should treat as offset 0 or error
      if (json.success) {
        expect(json.data).toBeDefined();
      }
    });
  });
}
