/**
 * Advanced Multi-Filter Combination Tests
 * Tests for complex filter combinations (chains + protocols + OASF + sorting)
 */

import { describe, it } from '../test-runner';
import { get } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import {
  assertAllMatch,
  assertBooleanFlag,
  assertChainId,
  assertHasDomain,
  assertHasSkill,
  assertReputationInRange,
  assertSorted,
  assertSuccess,
} from '../utils/assertions';

export function registerAgentsAdvancedTests(): void {
  describe('Multi-Filter Combinations', () => {
    it('MCP + A2A + specific chain (AND)', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        chainId: 11155111,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true && a.hasA2a === true && a.chainId === 11155111,
          'hasMcp AND hasA2a AND chainId=11155111'
        );
      }
    });

    it('MCP + A2A + specific chain (OR)', async () => {
      const { json } = await get('/agents', {
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        chainId: 11155111,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => (a.hasMcp === true || a.hasA2a === true) && a.chainId === 11155111,
          '(hasMcp OR hasA2a) AND chainId=11155111'
        );
      }
    });

    it('Skills + MCP filter combination', async () => {
      const { json } = await get('/agents', {
        skills: 'advanced_reasoning_planning',
        mcp: true,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertHasSkill(json.data!, 'advanced_reasoning_planning');
      }
    });

    it('Domains + A2A filter combination', async () => {
      const { json } = await get('/agents', {
        domains: 'technology',
        a2a: true,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasA2a', true);
        assertHasDomain(json.data!, 'technology');
      }
    });

    it('Skills + domains + MCP + A2A (AND mode)', async () => {
      const { json } = await get('/agents', {
        skills: 'tool_interaction',
        domains: 'technology',
        mcp: true,
        a2a: true,
        filterMode: 'AND',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true && a.hasA2a === true,
          'hasMcp AND hasA2a'
        );
        assertHasSkill(json.data!, 'tool_interaction');
        assertHasDomain(json.data!, 'technology');
      }
    });

    it('Skills + domains + MCP + A2A (OR mode)', async () => {
      const { json } = await get('/agents', {
        skills: 'tool_interaction',
        domains: 'technology',
        mcp: true,
        a2a: true,
        filterMode: 'OR',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertAllMatch(
          json.data!,
          (a: Agent) => a.hasMcp === true || a.hasA2a === true,
          'hasMcp OR hasA2a'
        );
        // In OR mode, OASF filters are also OR'd (flat slugs - exact match)
        assertAllMatch(
          json.data!,
          (a: Agent) => {
            const hasSkill = a.oasf?.skills?.some((s) => s.slug === 'tool_interaction');
            const hasDomain = a.oasf?.domains?.some((d) => d.slug === 'technology');
            return hasSkill || hasDomain || a.hasMcp || a.hasA2a;
          },
          'has at least one matching filter'
        );
      }
    });

    it('Sort + active filter combination', async () => {
      const { json } = await get('/agents', {
        sort: 'reputation',
        order: 'desc',
        active: true,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'active', true);
      }
    });

    it('Sort + MCP + chain filter combination', async () => {
      const { json } = await get('/agents', {
        sort: 'name',
        order: 'asc',
        mcp: true,
        chainId: 11155111,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertChainId(json.data!, 11155111);
        // Verify sorting (filter out empty names)
        const withNames = json.data?.filter((a) => a.name && a.name.length > 0);
        if (withNames.length > 1) {
          assertSorted(withNames, 'name', 'asc');
        }
      }
    });
  });

  // ========== x402 Complex Combinations ==========
  describe('x402 Complex Combinations', () => {
    it('x402=true + skills + chainId triple filter', async () => {
      const { json } = await get('/agents', {
        x402: true,
        skills: 'tool_interaction',
        chainId: 11155111,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'x402Support', true);
        assertHasSkill(json.data!, 'tool_interaction');
        assertChainId(json.data!, 11155111);
      }
    });

    it('x402=true + minRep filter works', async () => {
      const { json } = await get('/agents', {
        x402: true,
        minRep: 2.0,
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'x402Support', true);
        assertReputationInRange(json.data!, 2.0, undefined);
      }
    });

    it('x402=true + mcp=true + a2a=true + skills quadruple filter', async () => {
      const { json } = await get('/agents', {
        x402: true,
        mcp: true,
        a2a: true,
        skills: 'tool_interaction',
        limit: 10,
      });
      assertSuccess(json);
      if (json.data?.length > 0) {
        assertBooleanFlag(json.data!, 'x402Support', true);
        assertBooleanFlag(json.data!, 'hasMcp', true);
        assertBooleanFlag(json.data!, 'hasA2a', true);
        assertHasSkill(json.data!, 'tool_interaction');
      }
    });
  });
}
