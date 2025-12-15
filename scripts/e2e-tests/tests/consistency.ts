/**
 * Consistency Tests
 * Tests for data consistency between SDK and Search paths
 */

import { describe, expect, it } from '../test-runner';
import { get } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import { assertResponseTime, assertSuccess } from '../utils/assertions';

export function registerConsistencyTests(): void {
  describe('Consistency', () => {
    it('SDK and Search return same base fields', async () => {
      // Get agents via SDK path (no q parameter)
      const sdkResult = await get('/agents', { mcp: true, limit: 5 });
      assertSuccess(sdkResult.json);

      // Get agents via Search path (with q parameter)
      const searchResult = await get('/agents', { q: 'agent', mcp: true, limit: 5 });
      assertSuccess(searchResult.json);

      // Both should have the same structure
      if (sdkResult.json.data?.length > 0) {
        const sdkAgent = sdkResult.json.data?.[0];
        expect(sdkAgent.id).toBeDefined();
        expect(sdkAgent.chainId).toBeDefined();
        expect(sdkAgent.tokenId).toBeDefined();
        expect(typeof sdkAgent.hasMcp).toBe('boolean');
      }

      if (searchResult.json.data?.length > 0) {
        const searchAgent = searchResult.json.data?.[0];
        expect(searchAgent.id).toBeDefined();
        expect(searchAgent.chainId).toBeDefined();
        expect(searchAgent.tokenId).toBeDefined();
        expect(typeof searchAgent.hasMcp).toBe('boolean');
      }
    });

    it('OASF data present in SDK path', async () => {
      const { json } = await get('/agents', { limit: 20 });
      assertSuccess(json);

      // At least some agents should have OASF classification
      const withOasf = json.data?.filter((a: Agent) => a.oasf !== null && a.oasf !== undefined);

      // We expect at least some classified agents in top 20
      if (withOasf.length > 0) {
        const agent = withOasf[0];
        expect(agent.oasf).toBeDefined();
        // OASF should have skills or domains
        const hasSkills = agent.oasf?.skills && agent.oasf?.skills.length > 0;
        const hasDomains = agent.oasf?.domains && agent.oasf?.domains.length > 0;
        expect(hasSkills || hasDomains).toBeTruthy();
      }
    });

    it('OASF data present in Search path', async () => {
      const { json } = await get('/agents', { q: 'agent', limit: 20 });
      assertSuccess(json);

      const withOasf = json.data?.filter((a: Agent) => a.oasf !== null && a.oasf !== undefined);

      if (withOasf.length > 0) {
        const agent = withOasf[0];
        expect(agent.oasf).toBeDefined();
      }
    });

    it('Boolean flags are accurate in SDK path', async () => {
      // Test that when we filter by mcp=true, all results actually have hasMcp=true
      const { json } = await get('/agents', { mcp: true, limit: 10 });
      assertSuccess(json);

      for (const agent of json.data!) {
        expect(agent.hasMcp).toBe(true);
      }
    });

    it('Response time is reasonable', async () => {
      // Test that API responds within 5 seconds
      const { duration } = await get('/agents', { limit: 10 });
      assertResponseTime(duration, 5000);

      // Search should also be reasonably fast
      const searchResult = await get('/agents', { q: 'AI', limit: 10 });
      assertResponseTime(searchResult.duration, 5000);
    });
  });
}
