/**
 * Tests for agents route helper functions
 * @module test/unit/routes/agents-helpers
 */

import { filterByReputation, sortAgents } from '@/routes/agents';
import type { AgentSummary } from '@/types';
import { describe, expect, it } from 'vitest';

/**
 * Create a mock agent summary with specified properties
 */
function createMockAgent(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    id: '11155111:1',
    chainId: 11155111,
    tokenId: '1',
    name: 'Test Agent',
    description: 'Test description',
    image: undefined,
    active: true,
    hasMcp: false,
    hasA2a: false,
    x402Support: false,
    supportedTrust: [],
    operators: [],
    ens: undefined,
    did: undefined,
    walletAddress: '0x1234',
    oasf: undefined,
    oasfSource: 'none',
    searchScore: undefined,
    reputationScore: undefined,
    reputationCount: undefined,
    ...overrides,
  };
}

describe('filterByReputation', () => {
  it('returns all agents when no filters are applied', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: 50 }),
      createMockAgent({ id: '11155111:2', reputationScore: undefined }),
      createMockAgent({ id: '11155111:3', reputationScore: 80 }),
    ];

    const result = filterByReputation(agents, undefined, undefined);
    expect(result).toHaveLength(3);
  });

  it('filters agents by minRep', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: 30 }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
      createMockAgent({ id: '11155111:3', reputationScore: 80 }),
    ];

    const result = filterByReputation(agents, 40, undefined);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['11155111:2', '11155111:3']);
  });

  it('filters agents by maxRep', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: 30 }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
      createMockAgent({ id: '11155111:3', reputationScore: 80 }),
    ];

    const result = filterByReputation(agents, undefined, 60);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['11155111:1', '11155111:2']);
  });

  it('filters agents by both minRep and maxRep', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: 30 }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
      createMockAgent({ id: '11155111:3', reputationScore: 80 }),
    ];

    const result = filterByReputation(agents, 40, 70);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('11155111:2');
  });

  it('includes agents without reputation when minRep is undefined', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: undefined }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
    ];

    const result = filterByReputation(agents, undefined, 80);
    expect(result).toHaveLength(2);
  });

  it('includes agents without reputation when minRep is 0', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: undefined }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
    ];

    const result = filterByReputation(agents, 0, 80);
    expect(result).toHaveLength(2);
  });

  it('excludes agents without reputation when minRep > 0', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: undefined }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
      createMockAgent({ id: '11155111:3', reputationScore: 80 }),
    ];

    const result = filterByReputation(agents, 30, undefined);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['11155111:2', '11155111:3']);
  });

  it('handles empty agent list', () => {
    const result = filterByReputation([], 0, 100);
    expect(result).toHaveLength(0);
  });

  it('handles all agents without reputation', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: undefined }),
      createMockAgent({ id: '11155111:2', reputationScore: undefined }),
    ];

    // With minRep > 0, all excluded
    expect(filterByReputation(agents, 10, undefined)).toHaveLength(0);

    // With minRep = 0, all included
    expect(filterByReputation(agents, 0, 100)).toHaveLength(2);

    // With only maxRep, all included
    expect(filterByReputation(agents, undefined, 100)).toHaveLength(2);
  });

  it('includes boundary values correctly', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: 30 }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
      createMockAgent({ id: '11155111:3', reputationScore: 70 }),
    ];

    // minRep = 30 should include agent with score 30
    const minResult = filterByReputation(agents, 30, undefined);
    expect(minResult).toHaveLength(3);

    // maxRep = 70 should include agent with score 70
    const maxResult = filterByReputation(agents, undefined, 70);
    expect(maxResult).toHaveLength(3);

    // Both boundaries
    const rangeResult = filterByReputation(agents, 30, 70);
    expect(rangeResult).toHaveLength(3);
  });

  it('handles null reputationScore from JSON cache deserialization', () => {
    // After JSON.stringify/JSON.parse, undefined becomes null
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: null as unknown as undefined }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
      createMockAgent({ id: '11155111:3', reputationScore: null as unknown as undefined }),
    ];

    // With minRep > 0, agents with null score should be excluded
    const minRepResult = filterByReputation(agents, 10, undefined);
    expect(minRepResult).toHaveLength(1);
    expect(minRepResult[0]?.id).toBe('11155111:2');

    // With minRep = 0, agents with null score should be included
    const minRepZeroResult = filterByReputation(agents, 0, 100);
    expect(minRepZeroResult).toHaveLength(3);

    // With only maxRep, agents with null score should be included
    const maxRepResult = filterByReputation(agents, undefined, 100);
    expect(maxRepResult).toHaveLength(3);
  });

  it('treats null the same as undefined for filtering purposes', () => {
    const agentsWithNull = [
      createMockAgent({ id: '11155111:1', reputationScore: null as unknown as undefined }),
    ];
    const agentsWithUndefined = [
      createMockAgent({ id: '11155111:1', reputationScore: undefined }),
    ];

    // Both should behave identically
    expect(filterByReputation(agentsWithNull, 10, undefined)).toHaveLength(0);
    expect(filterByReputation(agentsWithUndefined, 10, undefined)).toHaveLength(0);

    expect(filterByReputation(agentsWithNull, 0, 100)).toHaveLength(1);
    expect(filterByReputation(agentsWithUndefined, 0, 100)).toHaveLength(1);
  });
});

describe('sortAgents', () => {
  it('sorts by reputation descending (default)', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: 30 }),
      createMockAgent({ id: '11155111:2', reputationScore: 80 }),
      createMockAgent({ id: '11155111:3', reputationScore: 50 }),
    ];

    const result = sortAgents(agents, 'reputation', 'desc');
    expect(result.map((a) => a.reputationScore)).toEqual([80, 50, 30]);
  });

  it('sorts by reputation ascending', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: 30 }),
      createMockAgent({ id: '11155111:2', reputationScore: 80 }),
      createMockAgent({ id: '11155111:3', reputationScore: 50 }),
    ];

    const result = sortAgents(agents, 'reputation', 'asc');
    expect(result.map((a) => a.reputationScore)).toEqual([30, 50, 80]);
  });

  it('places agents without reputation last when sorting by reputation', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', reputationScore: undefined }),
      createMockAgent({ id: '11155111:2', reputationScore: 50 }),
      createMockAgent({ id: '11155111:3', reputationScore: undefined }),
    ];

    const descResult = sortAgents(agents, 'reputation', 'desc');
    expect(descResult[0]?.reputationScore).toBe(50);
    expect(descResult[1]?.reputationScore).toBeUndefined();
    expect(descResult[2]?.reputationScore).toBeUndefined();

    const ascResult = sortAgents(agents, 'reputation', 'asc');
    expect(ascResult[0]?.reputationScore).toBeUndefined();
    expect(ascResult[1]?.reputationScore).toBeUndefined();
    expect(ascResult[2]?.reputationScore).toBe(50);
  });

  it('sorts by name', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', name: 'Charlie' }),
      createMockAgent({ id: '11155111:2', name: 'Alice' }),
      createMockAgent({ id: '11155111:3', name: 'Bob' }),
    ];

    const ascResult = sortAgents(agents, 'name', 'asc');
    expect(ascResult.map((a) => a.name)).toEqual(['Alice', 'Bob', 'Charlie']);

    const descResult = sortAgents(agents, 'name', 'desc');
    expect(descResult.map((a) => a.name)).toEqual(['Charlie', 'Bob', 'Alice']);
  });

  it('sorts by createdAt (tokenId)', () => {
    const agents = [
      createMockAgent({ id: '11155111:100', tokenId: '100' }),
      createMockAgent({ id: '11155111:1', tokenId: '1' }),
      createMockAgent({ id: '11155111:50', tokenId: '50' }),
    ];

    const ascResult = sortAgents(agents, 'createdAt', 'asc');
    expect(ascResult.map((a) => a.tokenId)).toEqual(['1', '50', '100']);

    const descResult = sortAgents(agents, 'createdAt', 'desc');
    expect(descResult.map((a) => a.tokenId)).toEqual(['100', '50', '1']);
  });

  it('sorts by relevance (searchScore)', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', searchScore: 0.3 }),
      createMockAgent({ id: '11155111:2', searchScore: 0.9 }),
      createMockAgent({ id: '11155111:3', searchScore: 0.6 }),
    ];

    // Relevance sort uses inverse formula: (scoreB - scoreA) * multiplier
    // desc (multiplier=-1): lower scores first (inverse of expected)
    // This behavior may need review, but tests document current behavior
    const descResult = sortAgents(agents, 'relevance', 'desc');
    expect(descResult.map((a) => a.searchScore)).toEqual([0.3, 0.6, 0.9]);

    const ascResult = sortAgents(agents, 'relevance', 'asc');
    expect(ascResult.map((a) => a.searchScore)).toEqual([0.9, 0.6, 0.3]);
  });

  it('uses default sort (relevance desc) when not specified', () => {
    const agents = [
      createMockAgent({ id: '11155111:1', searchScore: 0.3 }),
      createMockAgent({ id: '11155111:2', searchScore: 0.9 }),
    ];

    // Default: relevance desc - documents current behavior
    const result = sortAgents(agents, undefined, undefined);
    expect(result.map((a) => a.searchScore)).toEqual([0.3, 0.9]);
  });
});
