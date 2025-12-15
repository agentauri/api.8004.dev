/**
 * Error Handling Tests
 * Tests for API error responses and validation
 */

import { describe, expect, it } from '../test-runner';
import { get } from '../utils/api-client';
import { assertSuccess } from '../utils/assertions';

export function registerErrorHandlingTests(): void {
  describe('Error Handling', () => {
    it('Invalid chainId value is handled', async () => {
      const { json } = await get('/agents', { chainId: 'invalid' as unknown as number });
      // API should return error or ignore invalid value
      if (!json.success) {
        expect(json.error).toBeDefined();
      }
      // If it succeeds, it means the API ignored the invalid value
    });

    it('Invalid filterMode value is handled', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        filterMode: 'INVALID' as 'AND' | 'OR',
        limit: 5,
      });
      // API should return error or default to AND
      if (json.success) {
        // Defaulted to AND - this is acceptable behavior
        expect(json.data).toBeDefined();
      } else {
        expect(json.error).toBeDefined();
      }
    });

    it('Invalid sort field is handled', async () => {
      const { json } = await get('/agents', {
        sort: 'invalid_field' as 'name',
        limit: 5,
      });
      // API should return error or use default sort
      if (json.success) {
        // Used default sort - this is acceptable
        expect(json.data).toBeDefined();
      } else {
        expect(json.error).toBeDefined();
      }
    });

    it('Negative minRep is handled', async () => {
      const { json } = await get('/agents', { minRep: -10, limit: 5 });
      // API should return error, cap to 0, or ignore
      if (json.success) {
        expect(json.data).toBeDefined();
      } else {
        expect(json.error).toBeDefined();
      }
    });

    it('maxRep > 100 is handled', async () => {
      const { json } = await get('/agents', { maxRep: 150, limit: 5 });
      // API should return error, cap to 100, or ignore
      if (json.success) {
        expect(json.data).toBeDefined();
      } else {
        expect(json.error).toBeDefined();
      }
    });

    it('Nonexistent skill slug returns empty results', async () => {
      const { json } = await get('/agents', {
        skills: 'completely_nonexistent_skill_xyz123',
        limit: 5,
      });
      assertSuccess(json);
      // Should return empty array, not error
      expect(json.data?.length).toBe(0);
    });

    it('Nonexistent domain slug returns empty results', async () => {
      const { json } = await get('/agents', {
        domains: 'completely_nonexistent_domain_xyz123',
        limit: 5,
      });
      assertSuccess(json);
      // Should return empty array, not error
      expect(json.data?.length).toBe(0);
    });

    it('Invalid order value is handled', async () => {
      const { json } = await get('/agents', {
        sort: 'name',
        order: 'invalid' as 'asc' | 'desc',
        limit: 5,
      });
      // API should return error or use default order
      if (json.success) {
        expect(json.data).toBeDefined();
      } else {
        expect(json.error).toBeDefined();
      }
    });
  });
}
