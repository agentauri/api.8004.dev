/**
 * OASF Filter Tests
 * Tests for skills/domains filtering with exact slug matching (OASF v1.0.0)
 * Note: OASF uses flat structure - no hierarchies
 */

import { describe, it } from '../test-runner';
import { get } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import {
  assertAllMatch,
  assertBooleanFlag,
  assertHasDomain,
  assertHasSkill,
  assertSuccess,
} from '../utils/assertions';

export function registerAgentsOASFTests(): void {
  describe('OASF Filters (Flat Structure)', () => {
    it('Exact skill match works', async () => {
      const { json } = await get('/agents', { skills: 'advanced_reasoning_planning', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, 'advanced_reasoning_planning');
      }
    });

    it('Single skill filter returns matching agents', async () => {
      const { json } = await get('/agents', { skills: 'natural_language_processing', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        // All agents should have the exact skill
        assertAllMatch(
          json.data!,
          (a: Agent) => {
            if (!a.oasf?.skills) return false;
            return a.oasf.skills.some((s) => s.slug === 'natural_language_processing');
          },
          'has natural_language_processing skill'
        );
      }
    });

    it('Exact domain match works', async () => {
      const { json } = await get('/agents', { domains: 'technology', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasDomain(json.data!, 'technology');
      }
    });

    it('Single domain filter returns matching agents', async () => {
      const { json } = await get('/agents', { domains: 'finance_business', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => {
            if (!a.oasf?.domains) return false;
            return a.oasf.domains.some((d) => d.slug === 'finance_business');
          },
          'has finance_business domain'
        );
      }
    });

    it('Multiple skills filter works (OR within skills)', async () => {
      const { json } = await get('/agents', {
        skills: 'advanced_reasoning_planning,agent_orchestration',
        limit: 10,
      });
      assertSuccess(json);
      // Results should have at least one of the requested skills
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => {
            if (!a.oasf?.skills) return false;
            return a.oasf.skills.some(
              (s) => s.slug === 'advanced_reasoning_planning' || s.slug === 'agent_orchestration'
            );
          },
          'has advanced_reasoning_planning or agent_orchestration skill'
        );
      }
    });

    it('Multiple domains filter works (OR within domains)', async () => {
      const { json } = await get('/agents', { domains: 'technology,finance_business', limit: 10 });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => {
            if (!a.oasf?.domains) return false;
            return a.oasf.domains.some(
              (d) => d.slug === 'technology' || d.slug === 'finance_business'
            );
          },
          'has technology or finance_business domain'
        );
      }
    });

    it('Skills + domains combined filter (AND between skills and domains)', async () => {
      const { json } = await get('/agents', {
        skills: 'tool_interaction',
        domains: 'technology',
        limit: 10,
      });
      assertSuccess(json);
      // Should have both skill AND domain
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, 'tool_interaction');
        assertHasDomain(json.data!, 'technology');
      }
    });

    it('OASF + boolean filters combined', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        skills: 'tool_interaction',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(json.data!, (a: Agent) => a.hasMcp === true, 'hasMcp === true');
        assertHasSkill(json.data!, 'tool_interaction');
      }
    });
  });

  // ========== OASF + Active Filter Combinations ==========
  describe('OASF + Active Filter', () => {
    it('skills + active=true returns only active agents with skill', async () => {
      const { json } = await get('/agents', {
        skills: 'tool_interaction',
        active: true,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, 'tool_interaction');
        assertBooleanFlag(json.data!, 'active', true);
      }
    });

    it('skills + active=false returns only inactive agents with skill', async () => {
      const { json } = await get('/agents', {
        skills: 'tool_interaction',
        active: false,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, 'tool_interaction');
        assertBooleanFlag(json.data!, 'active', false);
      }
    });

    it('domains + active=true returns only active agents with domain', async () => {
      const { json } = await get('/agents', {
        domains: 'technology',
        active: true,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasDomain(json.data!, 'technology');
        assertBooleanFlag(json.data!, 'active', true);
      }
    });

    it('domains + active=false returns only inactive agents with domain', async () => {
      const { json } = await get('/agents', {
        domains: 'technology',
        active: false,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasDomain(json.data!, 'technology');
        assertBooleanFlag(json.data!, 'active', false);
      }
    });

    it('skills + domains + active=true triple filter works', async () => {
      const { json } = await get('/agents', {
        skills: 'tool_interaction',
        domains: 'technology',
        active: true,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertHasSkill(json.data!, 'tool_interaction');
        assertHasDomain(json.data!, 'technology');
        assertBooleanFlag(json.data!, 'active', true);
      }
    });
  });
}
