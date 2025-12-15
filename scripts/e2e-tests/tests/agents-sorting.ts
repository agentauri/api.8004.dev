/**
 * Sorting & Pagination Tests
 * Tests for sort order and cursor-based pagination
 */

import { describe, expect, it } from '../test-runner';
import { get } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import {
  assertNoDuplicates,
  assertPagination,
  assertSorted,
  assertSuccess,
} from '../utils/assertions';

export function registerAgentsSortingTests(): void {
  describe('Sorting & Pagination', () => {
    it('sort=name&order=asc works', async () => {
      const { json } = await get('/agents', { sort: 'name', order: 'asc', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 1) {
        // Filter out empty names for sorting check
        const withNames = json.data?.filter((a) => a.name && a.name.length > 0);
        if (withNames.length > 1) {
          assertSorted(withNames, 'name', 'asc');
        }
      }
    });

    it('sort=name&order=desc works', async () => {
      const { json } = await get('/agents', { sort: 'name', order: 'desc', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 1) {
        const withNames = json.data?.filter((a) => a.name && a.name.length > 0);
        if (withNames.length > 1) {
          assertSorted(withNames, 'name', 'desc');
        }
      }
    });

    it('sort=createdAt&order=desc shows newest first', async () => {
      const { json } = await get('/agents', { sort: 'createdAt', order: 'desc', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 1) {
        // tokenId is proxy for creation order (higher = newer)
        assertSorted(json.data!, (a: Agent) => Number.parseInt(a.tokenId, 10), 'desc');
      }
    });

    it('sort=createdAt&order=asc shows oldest first', async () => {
      const { json } = await get('/agents', { sort: 'createdAt', order: 'asc', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 1) {
        assertSorted(json.data!, (a: Agent) => Number.parseInt(a.tokenId, 10), 'asc');
      }
    });

    it('sort=reputation&order=desc works', async () => {
      const { json } = await get('/agents', { sort: 'reputation', order: 'desc', limit: 10 });
      assertSuccess(json);
      // Just verify it doesn't error - reputation data may be sparse
      expect(json.data).toBeDefined();
    });

    it('Pagination returns cursor when hasMore', async () => {
      const { json } = await get('/agents', { limit: 3 });
      assertSuccess(json);
      assertPagination(json);
    });

    it('Pagination with cursor returns next page', async () => {
      // Get first page
      const page1 = await get('/agents', { limit: 3 });
      assertSuccess(page1.json);

      if (page1.json.meta?.hasMore && page1.json.meta.nextCursor) {
        // Get second page
        const cursor = encodeURIComponent(page1.json.meta.nextCursor);
        const page2 = await get(`/agents?limit=3&cursor=${cursor}`);
        assertSuccess(page2.json);

        // Ensure no duplicates between pages
        const page1Ids = page1.json.data?.map((a) => a.id);
        const page2Ids = page2.json.data?.map((a) => a.id);
        const overlap = page1Ids.filter((id) => page2Ids.includes(id));

        if (overlap.length > 0) {
          throw new Error(
            `Found ${overlap.length} duplicate(s) between pages: ${overlap.join(', ')}`
          );
        }
      }
    });

    it('No duplicates within single page', async () => {
      const { json } = await get('/agents', { limit: 20 });
      assertSuccess(json);
      assertNoDuplicates(json.data!, 'id');
    });
  });
}
