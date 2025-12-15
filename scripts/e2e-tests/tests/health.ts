/**
 * Health & Basic Tests
 * Tests for basic API functionality
 */

import { describe, expect, it } from '../test-runner';
import { get } from '../utils/api-client';
import {
  assertHasMeta,
  assertResponseTime,
  assertStatus,
  assertSuccess,
} from '../utils/assertions';

export function registerHealthTests(): void {
  describe('Health & Basic', () => {
    it('Health endpoint responds 200', async () => {
      const { response, json } = await get('/health');
      assertStatus(response, 200);
      expect(json.status).toBe('ok');
    });

    it('Agents list returns data', async () => {
      const { json, duration } = await get('/agents', { limit: 5 });
      assertSuccess(json);
      expect(Array.isArray(json.data)).toBe(true);
      assertResponseTime(duration, 5000);
    });

    it('Response structure is valid', async () => {
      const { json } = await get('/agents', { limit: 3 });
      assertSuccess(json);
      assertHasMeta(json);
      expect(json.meta?.total).toBeGreaterThan(0);
      expect(typeof json.meta?.hasMore).toBe('boolean');
    });

    it('Agent has required fields', async () => {
      const { json } = await get('/agents', { limit: 1 });
      assertSuccess(json);
      const agent = json.data?.[0];
      expect(agent.id).toBeDefined();
      expect(agent.chainId).toBeDefined();
      expect(agent.tokenId).toBeDefined();
      expect(typeof agent.name).toBe('string'); // name can be empty string
    });

    it('Invalid endpoint returns 404', async () => {
      const { response } = await get('/nonexistent-endpoint');
      assertStatus(response, 404);
    });
  });
}
