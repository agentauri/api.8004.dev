/**
 * Pagination Cache Service tests
 * @module test/unit/services/pagination-cache
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CachedPaginationSet,
  decodeOffset,
  deduplicateAgents,
  encodeOffset,
  generatePaginationCacheKey,
  getCachedPaginationSet,
  getPaginatedSlice,
  interleaveChainResults,
  type PaginationCacheParams,
  setCachedPaginationSet,
  sortAgents,
} from '@/services/pagination-cache';
import type { AgentSummary } from '@/types';

// Mock agent factory
function createMockAgent(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    id: '11155111:1',
    chainId: 11155111,
    tokenId: '1',
    name: 'Test Agent',
    description: 'A test agent',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    supportedTrust: [],
    operators: [],
    oasfSource: 'none',
    ...overrides,
  };
}

describe('generatePaginationCacheKey', () => {
  it('generates consistent keys for same params', () => {
    const params: PaginationCacheParams = {
      chainIds: [11155111, 84532],
      active: true,
      hasMcp: true,
    };

    const key1 = generatePaginationCacheKey(params);
    const key2 = generatePaginationCacheKey(params);

    expect(key1).toBe(key2);
  });

  it('generates same key regardless of chainIds order', () => {
    const params1: PaginationCacheParams = { chainIds: [84532, 11155111] };
    const params2: PaginationCacheParams = { chainIds: [11155111, 84532] };

    const key1 = generatePaginationCacheKey(params1);
    const key2 = generatePaginationCacheKey(params2);

    expect(key1).toBe(key2);
  });

  it('generates different keys for different params', () => {
    const params1: PaginationCacheParams = { active: true };
    const params2: PaginationCacheParams = { active: false };

    const key1 = generatePaginationCacheKey(params1);
    const key2 = generatePaginationCacheKey(params2);

    expect(key1).not.toBe(key2);
  });

  it('includes all filter types in key generation', () => {
    const params: PaginationCacheParams = {
      chainIds: [11155111],
      active: true,
      hasMcp: true,
      hasA2a: false,
      hasX402: true,
      mcpTools: ['tool1', 'tool2'],
      a2aSkills: ['skill1'],
      hasRegistrationFile: true,
      sort: 'name',
      order: 'asc',
    };

    const key = generatePaginationCacheKey(params);
    expect(key).toContain('pagination:');
  });

  it('normalizes mcpTools and a2aSkills order', () => {
    const params1: PaginationCacheParams = { mcpTools: ['b', 'a', 'c'] };
    const params2: PaginationCacheParams = { mcpTools: ['a', 'b', 'c'] };

    const key1 = generatePaginationCacheKey(params1);
    const key2 = generatePaginationCacheKey(params2);

    expect(key1).toBe(key2);
  });

  it('handles empty params', () => {
    const key = generatePaginationCacheKey({});
    expect(key).toContain('pagination:');
  });
});

describe('encodeOffset / decodeOffset', () => {
  it('encodes and decodes offset correctly', () => {
    const offset = 42;
    const encoded = encodeOffset(offset);
    const decoded = decodeOffset(encoded);

    expect(decoded).toBe(offset);
  });

  it('encodes offset as base64url', () => {
    const encoded = encodeOffset(100);
    // Should be base64url format (no +, /, or = padding)
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });

  it('returns 0 for invalid cursor', () => {
    expect(decodeOffset('invalid-cursor')).toBe(0);
    expect(decodeOffset('')).toBe(0);
  });

  it('handles large offsets', () => {
    const largeOffset = 999999;
    const encoded = encodeOffset(largeOffset);
    const decoded = decodeOffset(encoded);

    expect(decoded).toBe(largeOffset);
  });

  it('returns 0 when _global_offset is missing', () => {
    // Create a valid base64url without _global_offset
    const encoded = Buffer.from(JSON.stringify({ other: 123 })).toString('base64url');
    expect(decodeOffset(encoded)).toBe(0);
  });
});

describe('getCachedPaginationSet / setCachedPaginationSet', () => {
  const testKey = 'pagination:test-key';

  afterEach(async () => {
    await env.CACHE.delete(testKey);
    await env.CACHE.delete('pagination:invalid-structure');
    await env.CACHE.delete('pagination:invalid-json');
  });

  it('returns null for non-existent cache key', async () => {
    const result = await getCachedPaginationSet(env.CACHE, 'nonexistent-key');
    expect(result).toBeNull();
  });

  it('stores and retrieves pagination set', async () => {
    const items = [
      createMockAgent({ id: '11155111:1', tokenId: '1' }),
      createMockAgent({ id: '11155111:2', tokenId: '2' }),
    ];

    await setCachedPaginationSet(env.CACHE, testKey, items, 'abc123');
    const result = await getCachedPaginationSet(env.CACHE, testKey);

    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(2);
    expect(result?.total).toBe(2);
    expect(result?.filterHash).toBe('abc123');
    expect(result?.cachedAt).toBeDefined();
  });

  it('returns null for invalid cache structure', async () => {
    // Store invalid structure (missing items array)
    await env.CACHE.put('pagination:invalid-structure', JSON.stringify({ total: 5 }));

    const result = await getCachedPaginationSet(env.CACHE, 'pagination:invalid-structure');
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    await env.CACHE.put('pagination:invalid-json', 'not valid json');

    const result = await getCachedPaginationSet(env.CACHE, 'pagination:invalid-json');
    expect(result).toBeNull();
  });

  it('handles cache write errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create a mock KV that throws on put
    const brokenKV = {
      put: vi.fn().mockRejectedValue(new Error('KV write failed')),
    } as unknown as KVNamespace;

    const items = [createMockAgent()];

    // Should not throw
    await expect(
      setCachedPaginationSet(brokenKV, 'test-key', items, 'hash')
    ).resolves.not.toThrow();

    consoleSpy.mockRestore();
  });
});

describe('sortAgents', () => {
  const agents = [
    createMockAgent({ id: '1', tokenId: '10', name: 'Charlie', reputationScore: 80 }),
    createMockAgent({ id: '2', tokenId: '5', name: 'Alice', reputationScore: 95 }),
    createMockAgent({ id: '3', tokenId: '15', name: 'Bob', reputationScore: 70 }),
  ];

  it('sorts by name ascending', () => {
    const sorted = sortAgents(agents, 'name', 'asc');
    expect(sorted[0]?.name).toBe('Alice');
    expect(sorted[1]?.name).toBe('Bob');
    expect(sorted[2]?.name).toBe('Charlie');
  });

  it('sorts by name descending', () => {
    const sorted = sortAgents(agents, 'name', 'desc');
    expect(sorted[0]?.name).toBe('Charlie');
    expect(sorted[1]?.name).toBe('Bob');
    expect(sorted[2]?.name).toBe('Alice');
  });

  it('sorts by reputation ascending', () => {
    const sorted = sortAgents(agents, 'reputation', 'asc');
    expect(sorted[0]?.reputationScore).toBe(70);
    expect(sorted[1]?.reputationScore).toBe(80);
    expect(sorted[2]?.reputationScore).toBe(95);
  });

  it('sorts by reputation descending', () => {
    const sorted = sortAgents(agents, 'reputation', 'desc');
    expect(sorted[0]?.reputationScore).toBe(95);
    expect(sorted[1]?.reputationScore).toBe(80);
    expect(sorted[2]?.reputationScore).toBe(70);
  });

  it('sorts by createdAt (tokenId) descending by default', () => {
    const sorted = sortAgents(agents, 'createdAt', 'desc');
    expect(sorted[0]?.tokenId).toBe('15');
    expect(sorted[1]?.tokenId).toBe('10');
    expect(sorted[2]?.tokenId).toBe('5');
  });

  it('sorts by relevance (searchScore)', () => {
    const agentsWithScores = [
      createMockAgent({ id: '1', searchScore: 0.9 }),
      createMockAgent({ id: '2', searchScore: 0.7 }),
      createMockAgent({ id: '3', searchScore: 0.95 }),
    ];

    const sorted = sortAgents(agentsWithScores, 'relevance', 'desc');
    expect(sorted[0]?.searchScore).toBe(0.95);
    expect(sorted[1]?.searchScore).toBe(0.9);
    expect(sorted[2]?.searchScore).toBe(0.7);
  });

  it('does not mutate original array', () => {
    const original = [...agents];
    sortAgents(agents, 'name', 'asc');
    expect(agents).toEqual(original);
  });

  it('handles missing reputation scores', () => {
    const agentsNoRep = [
      createMockAgent({ id: '1', reputationScore: undefined }),
      createMockAgent({ id: '2', reputationScore: 50 }),
    ];

    const sorted = sortAgents(agentsNoRep, 'reputation', 'desc');
    expect(sorted[0]?.reputationScore).toBe(50);
  });

  it('handles missing names', () => {
    const agentsNoName = [
      createMockAgent({ id: '1', name: undefined as unknown as string }),
      createMockAgent({ id: '2', name: 'Alice' }),
    ];

    const sorted = sortAgents(agentsNoName, 'name', 'asc');
    expect(sorted[0]?.name).toBeUndefined();
  });
});

describe('getPaginatedSlice', () => {
  const cachedSet: CachedPaginationSet = {
    items: [
      createMockAgent({ id: '1', tokenId: '1', name: 'Agent 1' }),
      createMockAgent({ id: '2', tokenId: '2', name: 'Agent 2' }),
      createMockAgent({ id: '3', tokenId: '3', name: 'Agent 3' }),
      createMockAgent({ id: '4', tokenId: '4', name: 'Agent 4' }),
      createMockAgent({ id: '5', tokenId: '5', name: 'Agent 5' }),
    ],
    total: 5,
    filterHash: 'test',
    cachedAt: Date.now(),
  };

  it('returns first page with hasMore=true', () => {
    const result = getPaginatedSlice(cachedSet, 0, 2);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe('1');
    expect(result.items[1]?.id).toBe('2');
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(5);
    expect(result.nextCursor).toBeDefined();
  });

  it('returns middle page correctly', () => {
    const result = getPaginatedSlice(cachedSet, 2, 2);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe('3');
    expect(result.items[1]?.id).toBe('4');
    expect(result.hasMore).toBe(true);
  });

  it('returns last page with hasMore=false', () => {
    const result = getPaginatedSlice(cachedSet, 4, 2);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('5');
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  it('applies sort before slicing', () => {
    const result = getPaginatedSlice(cachedSet, 0, 2, 'name', 'desc');

    // Descending by name: Agent 5, Agent 4, Agent 3, Agent 2, Agent 1
    expect(result.items[0]?.name).toBe('Agent 5');
    expect(result.items[1]?.name).toBe('Agent 4');
  });

  it('returns cursor that decodes to next offset', () => {
    const result = getPaginatedSlice(cachedSet, 0, 2);

    expect(result.nextCursor).toBeDefined();
    const nextOffset = decodeOffset(result.nextCursor as string);
    expect(nextOffset).toBe(2);
  });
});

describe('deduplicateAgents', () => {
  it('removes duplicate agents by ID', () => {
    const agents = [
      createMockAgent({ id: '1', name: 'First' }),
      createMockAgent({ id: '2', name: 'Second' }),
      createMockAgent({ id: '1', name: 'Duplicate' }),
      createMockAgent({ id: '3', name: 'Third' }),
    ];

    const result = deduplicateAgents(agents);

    expect(result).toHaveLength(3);
    expect(result.map((a) => a.id)).toEqual(['1', '2', '3']);
    expect(result[0]?.name).toBe('First'); // Keeps first occurrence
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateAgents([])).toEqual([]);
  });

  it('returns same array if no duplicates', () => {
    const agents = [
      createMockAgent({ id: '1' }),
      createMockAgent({ id: '2' }),
      createMockAgent({ id: '3' }),
    ];

    const result = deduplicateAgents(agents);
    expect(result).toHaveLength(3);
  });
});

describe('interleaveChainResults', () => {
  it('interleaves results from multiple chains', () => {
    const chainResults = [
      {
        chainId: 11155111,
        items: [
          createMockAgent({ id: '11155111:1', chainId: 11155111, tokenId: '1' }),
          createMockAgent({ id: '11155111:2', chainId: 11155111, tokenId: '2' }),
        ],
      },
      {
        chainId: 84532,
        items: [
          createMockAgent({ id: '84532:1', chainId: 84532, tokenId: '1' }),
          createMockAgent({ id: '84532:2', chainId: 84532, tokenId: '2' }),
        ],
      },
    ];

    const result = interleaveChainResults(chainResults);

    // Should interleave: chain1[0], chain2[0], chain1[1], chain2[1]
    expect(result).toHaveLength(4);
    // Items are sorted by tokenId desc within chain first, then interleaved
    // So we get highest tokenId from each chain first
    expect(result[0]?.chainId).toBe(11155111);
    expect(result[1]?.chainId).toBe(84532);
    expect(result[2]?.chainId).toBe(11155111);
    expect(result[3]?.chainId).toBe(84532);
  });

  it('handles unequal chain sizes', () => {
    const chainResults = [
      {
        chainId: 11155111,
        items: [
          createMockAgent({ id: '11155111:1', chainId: 11155111 }),
          createMockAgent({ id: '11155111:2', chainId: 11155111 }),
          createMockAgent({ id: '11155111:3', chainId: 11155111 }),
        ],
      },
      {
        chainId: 84532,
        items: [createMockAgent({ id: '84532:1', chainId: 84532 })],
      },
    ];

    const result = interleaveChainResults(chainResults);

    expect(result).toHaveLength(4);
  });

  it('returns empty array for empty input', () => {
    expect(interleaveChainResults([])).toEqual([]);
  });

  it('returns empty array when all chains are empty', () => {
    const chainResults = [
      { chainId: 11155111, items: [] },
      { chainId: 84532, items: [] },
    ];

    expect(interleaveChainResults(chainResults)).toEqual([]);
  });

  it('handles single chain', () => {
    const chainResults = [
      {
        chainId: 11155111,
        items: [
          createMockAgent({ id: '1', tokenId: '10' }),
          createMockAgent({ id: '2', tokenId: '5' }),
        ],
      },
    ];

    const result = interleaveChainResults(chainResults);

    expect(result).toHaveLength(2);
    // Should be sorted by tokenId descending
    expect(result[0]?.tokenId).toBe('10');
    expect(result[1]?.tokenId).toBe('5');
  });
});
