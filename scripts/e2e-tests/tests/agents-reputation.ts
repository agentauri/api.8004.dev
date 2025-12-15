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
      const { json } = await get('/agents', { minRep: 30, skills: 'tool_interaction', limit: 10 });
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
      const { json } = await get('/agents', {
        minRep: 20,
        maxRep: 90,
        skills: 'tool_interaction',
        domains: 'technology',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertReputationInRange(json.data!, 20, 90);
        assertHasSkill(json.data!, 'tool_interaction');
        assertHasDomain(json.data!, 'technology');
      }
    });
  });
}
