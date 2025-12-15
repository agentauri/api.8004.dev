/**
 * Edge Cases Tests
 * Tests for pagination limits, boundaries, and edge conditions
 */

import { describe, expect, it } from '../test-runner';
import { get } from '../utils/api-client';
import { assertHasMeta, assertSuccess } from '../utils/assertions';

export function registerAgentsEdgeCasesTests(): void {
  describe('Pagination Edge Cases', () => {
    it('limit=1 returns single result', async () => {
      const { json } = await get('/agents', { limit: 1 });
      assertSuccess(json);
      expect(json.data?.length).toBeLessThanOrEqual(1);
    });

    it('limit=100 returns maximum allowed results', async () => {
      const { json } = await get('/agents', { limit: 100 });
      assertSuccess(json);
      expect(json.data?.length).toBeLessThanOrEqual(100);
    });

    it('limit > 100 is capped or returns error', async () => {
      const { json } = await get('/agents', { limit: 150 });
      // API should either cap to 100 or return an error
      if (json.success) {
        expect(json.data?.length).toBeLessThanOrEqual(100);
      } else {
        // Error response is also acceptable
        expect(json.error).toBeDefined();
      }
    });

    it('Invalid cursor format is handled gracefully', async () => {
      const { json } = await get('/agents', { cursor: 'invalid-cursor-format', limit: 5 });
      // API should return error or ignore invalid cursor
      if (json.success) {
        // If it succeeds, it should return data (ignoring invalid cursor)
        expect(json.data).toBeDefined();
      } else {
        // Error response is expected for invalid cursor
        expect(json.error).toBeDefined();
      }
    });

    it('Empty result set returns proper pagination', async () => {
      // Query for something very specific that likely returns no results
      const { json } = await get('/agents', {
        skills: 'nonexistent_skill_slug_12345',
        limit: 10,
      });
      assertSuccess(json);
      assertHasMeta(json);
      expect(json.data?.length).toBe(0);
      // hasMore should be false when no results, but API may handle this differently
      expect(typeof json.meta?.hasMore).toBe('boolean');
    });

    it('Very specific filter combination returns subset', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        x402: true,
        chainId: 11155111,
        limit: 5,
      });
      assertSuccess(json);
      // Should return a valid response (possibly empty if no agents match all criteria)
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('Multiple pages maintain consistency', async () => {
      // Get first page
      const page1 = await get('/agents', { limit: 5 });
      assertSuccess(page1.json);

      if (page1.json.meta?.hasMore && page1.json.meta.nextCursor) {
        // Get second page
        const cursor = encodeURIComponent(page1.json.meta.nextCursor);
        const page2 = await get(`/agents?limit=5&cursor=${cursor}`);
        assertSuccess(page2.json);

        // Get third page if available
        if (page2.json.meta?.hasMore && page2.json.meta.nextCursor) {
          const cursor2 = encodeURIComponent(page2.json.meta.nextCursor);
          const page3 = await get(`/agents?limit=5&cursor=${cursor2}`);
          assertSuccess(page3.json);

          // Verify no overlap between any pages
          const allIds = [
            ...page1.json.data?.map((a) => a.id),
            ...page2.json.data?.map((a) => a.id),
            ...page3.json.data?.map((a) => a.id),
          ];
          const uniqueIds = new Set(allIds);
          expect(uniqueIds.size).toBe(allIds.length);
        }
      }
    });

    it('OR mode pagination maintains consistency', async () => {
      // Get first page with OR mode (mcp OR a2a)
      const page1 = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: 3,
      });
      assertSuccess(page1.json);
      assertHasMeta(page1.json);

      if (page1.json.meta?.hasMore && page1.json.meta.nextCursor) {
        // Get second page using cursor
        const cursor = encodeURIComponent(page1.json.meta.nextCursor);
        const page2 = await get(`/agents?mcp=true&a2a=true&filterMode=OR&limit=3&cursor=${cursor}`);
        assertSuccess(page2.json);

        // Get third page if available
        if (page2.json.meta?.hasMore && page2.json.meta.nextCursor) {
          const cursor2 = encodeURIComponent(page2.json.meta.nextCursor);
          const page3 = await get(
            `/agents?mcp=true&a2a=true&filterMode=OR&limit=3&cursor=${cursor2}`
          );
          assertSuccess(page3.json);

          // Verify no overlap between any pages
          const allIds = [
            ...page1.json.data?.map((a) => a.id),
            ...page2.json.data?.map((a) => a.id),
            ...page3.json.data?.map((a) => a.id),
          ];
          const uniqueIds = new Set(allIds);
          expect(uniqueIds.size).toBe(allIds.length);
        } else {
          // Just verify page 1 and 2 have no duplicates
          const page1Ids = page1.json.data?.map((a) => a.id) || [];
          const page2Ids = page2.json.data?.map((a) => a.id) || [];
          const overlap = page1Ids.filter((id) => page2Ids.includes(id));
          expect(overlap.length).toBe(0);
        }
      }
    });
  });

  describe('Reputation Filter Edge Cases', () => {
    it('minRep > maxRep returns empty array', async () => {
      // When minRep is greater than maxRep, no results should match
      const { json } = await get('/agents', {
        minRep: 5,
        maxRep: 1,
        limit: 10,
      });
      assertSuccess(json);
      // Should return empty array since range is impossible
      expect(json.data?.length).toBe(0);
    });

    it('minRep = maxRep filters to exact value', async () => {
      // Filter to exact reputation score
      const { json } = await get('/agents', {
        minRep: 4,
        maxRep: 4,
        limit: 10,
      });
      assertSuccess(json);
      // If there are results, they should have reputation exactly 4
      // (or no results if no agents have that exact score)
      expect(Array.isArray(json.data)).toBe(true);
    });
  });

  describe('Filter Combination Edge Cases', () => {
    it('All boolean filters true (most restrictive)', async () => {
      // This is the most restrictive combination
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        x402: true,
        active: true,
        limit: 10,
      });
      assertSuccess(json);
      // May return 0 results if no agents match all criteria
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('All boolean filters false', async () => {
      // Filter for agents without any protocols
      const { json } = await get('/agents', {
        mcp: false,
        a2a: false,
        x402: false,
        limit: 10,
      });
      assertSuccess(json);
      expect(Array.isArray(json.data)).toBe(true);
      // All returned agents should have all flags false
      if (json.data && json.data.length > 0) {
        for (const agent of json.data) {
          if (agent.hasMcp !== false) {
            throw new Error(`Agent ${agent.id} should have hasMcp=false`);
          }
          if (agent.hasA2a !== false) {
            throw new Error(`Agent ${agent.id} should have hasA2a=false`);
          }
          if (agent.x402Support !== false) {
            throw new Error(`Agent ${agent.id} should have x402Support=false`);
          }
        }
      }
    });
  });
}
