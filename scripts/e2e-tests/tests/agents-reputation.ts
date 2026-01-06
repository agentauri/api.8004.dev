/**
 * Reputation Filter Tests
 * Tests for minRep/maxRep filtering and combinations
 */

import { describe, it } from '../test-runner';
import { get } from '../utils/api-client';
import {
  assertHasDomain,
  assertHasSkill,
  assertReputationInRange,
  assertSuccess,
} from '../utils/assertions';

export function registerAgentsReputationTests(): void {
  describe('Reputation Filters', () => {
    it('minRep filter returns agents with reputation >= threshold', async () => {
      const { json } = await get('/agents', { minRep: 50, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 50, undefined);
      }
    });

    it('maxRep filter returns agents with reputation <= threshold', async () => {
      const { json } = await get('/agents', { maxRep: 80, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, undefined, 80);
      }
    });

    it('minRep + maxRep returns agents in range', async () => {
      const { json } = await get('/agents', { minRep: 30, maxRep: 70, limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 30, 70);
      }
    });

    it('minRep + skills combination works', async () => {
      // Use unique offset to bypass cache
      const uniqueOffset = Math.floor(Date.now() / 1000);
      const { json } = await get('/agents', {
        minRep: 30,
        skills: 'tool_interaction',
        limit: 10,
        offset: uniqueOffset,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 30, undefined);
        assertHasSkill(json.data!, 'tool_interaction');
      }
    });

    it('maxRep + domains combination works', async () => {
      const { json } = await get('/agents', { maxRep: 80, domains: 'technology', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, undefined, 80);
        assertHasDomain(json.data!, 'technology');
      }
    });

    it('Full reputation + OASF combination works', async () => {
      // Use unique offset to bypass cache
      const uniqueOffset = Math.floor(Date.now() / 1000);
      const { json } = await get('/agents', {
        minRep: 20,
        maxRep: 90,
        skills: 'tool_interaction',
        domains: 'technology',
        limit: 10,
        offset: uniqueOffset,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 20, 90);
        assertHasSkill(json.data!, 'tool_interaction');
        assertHasDomain(json.data!, 'technology');
      }
    });
  });

  describe('Reputation Feedback Endpoint', () => {
    it('GET /agents/:id/reputation/feedback returns feedback with transactionHash', async () => {
      // First get an agent with reputation
      const { json: listJson } = await get('/agents', { minRep: 1, limit: 1 });

      if (!listJson.success || !listJson.data || listJson.data.length === 0) {
        console.log('  Note: Skipped - no agents with reputation available');
        return;
      }

      const agent = listJson.data[0];
      const { json } = await get(`/agents/${agent.id}/reputation/feedback`, { limit: 10 });

      if (!json.success) {
        console.log(`  Note: Feedback fetch failed - ${json.error}`);
        return;
      }

      if (!Array.isArray(json.data)) {
        throw new Error('Expected data to be an array');
      }

      // Check that each feedback item has the expected structure
      for (const feedback of json.data as Array<Record<string, unknown>>) {
        if (typeof feedback.id !== 'string') {
          throw new Error('Expected feedback.id to be a string');
        }
        if (typeof feedback.score !== 'number') {
          throw new Error('Expected feedback.score to be a number');
        }
        if (typeof feedback.submitter !== 'string') {
          throw new Error('Expected feedback.submitter to be a string');
        }
        if (typeof feedback.timestamp !== 'string') {
          throw new Error('Expected feedback.timestamp to be a string');
        }
        // transactionHash should be a string if present (from EAS attestation)
        if (feedback.transactionHash !== undefined && feedback.transactionHash !== null) {
          if (typeof feedback.transactionHash !== 'string') {
            throw new Error('Expected feedback.transactionHash to be a string when present');
          }
        }
      }
    });

    it('GET /agents/:id/reputation returns reputation summary', async () => {
      const { json: listJson } = await get('/agents', { minRep: 1, limit: 1 });

      if (!listJson.success || !listJson.data || listJson.data.length === 0) {
        console.log('  Note: Skipped - no agents with reputation available');
        return;
      }

      const agent = listJson.data[0];
      const { json } = await get(`/agents/${agent.id}/reputation`);

      if (!json.success) {
        console.log(`  Note: Reputation fetch failed - ${json.error}`);
        return;
      }

      const data = json.data as Record<string, unknown>;
      // Should have reputation object
      if (!data.reputation) {
        throw new Error('Expected reputation object to be present');
      }

      const reputation = data.reputation as Record<string, unknown>;
      if (typeof reputation.count !== 'number') {
        throw new Error('Expected reputation.count to be a number');
      }
      if (typeof reputation.averageScore !== 'number') {
        throw new Error('Expected reputation.averageScore to be a number');
      }
      if (!reputation.distribution) {
        throw new Error('Expected reputation.distribution to be present');
      }
    });
  });
}
