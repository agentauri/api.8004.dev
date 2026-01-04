/**
 * Validation tests
 * @module test/unit/lib/validation
 */

import { describe, expect, it } from 'vitest';
import {
  agentIdSchema,
  chainIdSchema,
  classifyRequestSchema,
  listAgentsQuerySchema,
  parseAgentId,
  parseClassificationRow,
  SUPPORTED_CHAIN_IDS,
  searchModeInputSchema,
  searchRequestSchema,
  taxonomyQuerySchema,
} from '@/lib/utils/validation';

describe('chainIdSchema', () => {
  it('accepts valid chain IDs', () => {
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      expect(chainIdSchema.parse(chainId)).toBe(chainId);
      expect(chainIdSchema.parse(String(chainId))).toBe(chainId);
    }
  });

  it('rejects invalid chain IDs', () => {
    expect(() => chainIdSchema.parse(1)).toThrow();
    expect(() => chainIdSchema.parse(999999)).toThrow();
    expect(() => chainIdSchema.parse('invalid')).toThrow();
  });
});

describe('agentIdSchema', () => {
  it('accepts valid agent IDs', () => {
    expect(agentIdSchema.parse('11155111:1')).toBe('11155111:1');
    expect(agentIdSchema.parse('84532:123')).toBe('84532:123');
    expect(agentIdSchema.parse('80002:999999')).toBe('80002:999999');
  });

  it('rejects invalid agent IDs', () => {
    expect(() => agentIdSchema.parse('invalid')).toThrow();
    expect(() => agentIdSchema.parse('11155111')).toThrow();
    expect(() => agentIdSchema.parse(':1')).toThrow();
    expect(() => agentIdSchema.parse('abc:123')).toThrow();
  });
});

describe('parseAgentId', () => {
  it('parses valid agent IDs', () => {
    expect(parseAgentId('11155111:1')).toEqual({ chainId: 11155111, tokenId: '1' });
    expect(parseAgentId('84532:123')).toEqual({ chainId: 84532, tokenId: '123' });
  });
});

describe('searchModeInputSchema', () => {
  it('accepts semantic mode', () => {
    expect(searchModeInputSchema.parse('semantic')).toBe('semantic');
  });

  it('accepts name mode', () => {
    expect(searchModeInputSchema.parse('name')).toBe('name');
  });

  it('accepts auto mode', () => {
    expect(searchModeInputSchema.parse('auto')).toBe('auto');
  });

  it('defaults to auto when undefined', () => {
    expect(searchModeInputSchema.parse(undefined)).toBe('auto');
  });

  it('rejects invalid modes', () => {
    expect(() => searchModeInputSchema.parse('invalid')).toThrow();
    expect(() => searchModeInputSchema.parse('vector')).toThrow();
    expect(() => searchModeInputSchema.parse('fallback')).toThrow();
  });
});

describe('listAgentsQuerySchema', () => {
  it('accepts empty query', () => {
    const result = listAgentsQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('accepts valid query with all fields', () => {
    const result = listAgentsQuerySchema.parse({
      q: 'test',
      chainId: '11155111',
      active: 'true',
      mcp: 'true',
      a2a: 'false',
      skills: 'skill1,skill2',
      domains: 'domain1,domain2',
      minScore: '0.5',
      limit: '10',
    });

    expect(result.q).toBe('test');
    expect(result.chainId).toBe(11155111);
    expect(result.active).toBe(true);
    expect(result.mcp).toBe(true);
    expect(result.a2a).toBe(false);
    expect(result.skills).toEqual(['skill1', 'skill2']);
    expect(result.domains).toEqual(['domain1', 'domain2']);
    expect(result.minScore).toBe(0.5);
    expect(result.limit).toBe(10);
  });

  it('accepts chains as CSV format', () => {
    const result = listAgentsQuerySchema.parse({
      chains: '11155111,84532',
    });
    expect(result.chains).toEqual([11155111, 84532]);
  });

  it('accepts chainIds as array format (from chainIds[]=X&chainIds[]=Y)', () => {
    const result = listAgentsQuerySchema.parse({
      chainIds: ['11155111', '84532'],
    });
    expect(result.chainIds).toEqual([11155111, 84532]);
  });

  it('accepts chainIds as number array', () => {
    const result = listAgentsQuerySchema.parse({
      chainIds: [11155111, 84532],
    });
    expect(result.chainIds).toEqual([11155111, 84532]);
  });

  it('rejects invalid chain IDs in chainIds array', () => {
    expect(() =>
      listAgentsQuerySchema.parse({
        chainIds: [11155111, 999999],
      })
    ).toThrow();
  });

  it('rejects invalid chain IDs in chains CSV', () => {
    expect(() =>
      listAgentsQuerySchema.parse({
        chains: '11155111,999999',
      })
    ).toThrow();
  });

  it('enforces limit constraints', () => {
    // Valid limits
    expect(listAgentsQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(listAgentsQuerySchema.parse({ limit: '100' }).limit).toBe(100);

    // Limit below minimum should throw
    expect(() => listAgentsQuerySchema.parse({ limit: '0' })).toThrow();

    // Limit above maximum should be clamped to 100 (not throw)
    expect(listAgentsQuerySchema.parse({ limit: '101' }).limit).toBe(100);
    expect(listAgentsQuerySchema.parse({ limit: '1000' }).limit).toBe(100);
  });

  it('accepts minRep and maxRep parameters', () => {
    const result = listAgentsQuerySchema.parse({
      minRep: '50',
      maxRep: '90',
    });
    expect(result.minRep).toBe(50);
    expect(result.maxRep).toBe(90);
  });

  it('enforces minRep/maxRep constraints (0-100)', () => {
    expect(listAgentsQuerySchema.parse({ minRep: '0' }).minRep).toBe(0);
    expect(listAgentsQuerySchema.parse({ minRep: '100' }).minRep).toBe(100);
    expect(listAgentsQuerySchema.parse({ maxRep: '0' }).maxRep).toBe(0);
    expect(listAgentsQuerySchema.parse({ maxRep: '100' }).maxRep).toBe(100);
    expect(() => listAgentsQuerySchema.parse({ minRep: '-1' })).toThrow();
    expect(() => listAgentsQuerySchema.parse({ minRep: '101' })).toThrow();
    expect(() => listAgentsQuerySchema.parse({ maxRep: '-1' })).toThrow();
    expect(() => listAgentsQuerySchema.parse({ maxRep: '101' })).toThrow();
  });

  it('accepts reputation as sort field', () => {
    const result = listAgentsQuerySchema.parse({
      sort: 'reputation',
      order: 'desc',
    });
    expect(result.sort).toBe('reputation');
    expect(result.order).toBe('desc');
  });

  it('validates minRep <= maxRep', () => {
    // Valid: minRep < maxRep
    expect(() => listAgentsQuerySchema.parse({ minRep: '10', maxRep: '90' })).not.toThrow();

    // Valid: minRep = maxRep
    expect(() => listAgentsQuerySchema.parse({ minRep: '50', maxRep: '50' })).not.toThrow();

    // Valid: minRep > maxRep (impossible range - returns empty results, doesn't throw)
    expect(() => listAgentsQuerySchema.parse({ minRep: '90', maxRep: '10' })).not.toThrow();
  });

  it('accepts searchMode parameter', () => {
    // When not provided, searchMode defaults to 'auto' (Zod 4 applies .default())
    expect(listAgentsQuerySchema.parse({}).searchMode).toBe('auto');

    // Explicit modes
    expect(listAgentsQuerySchema.parse({ searchMode: 'semantic' }).searchMode).toBe('semantic');
    expect(listAgentsQuerySchema.parse({ searchMode: 'name' }).searchMode).toBe('name');
    expect(listAgentsQuerySchema.parse({ searchMode: 'auto' }).searchMode).toBe('auto');
  });

  it('rejects invalid searchMode values', () => {
    expect(() => listAgentsQuerySchema.parse({ searchMode: 'invalid' })).toThrow();
    expect(() => listAgentsQuerySchema.parse({ searchMode: 'vector' })).toThrow();
  });

  it('accepts searchMode with q parameter', () => {
    const result = listAgentsQuerySchema.parse({
      q: 'test agent',
      searchMode: 'name',
    });
    expect(result.q).toBe('test agent');
    expect(result.searchMode).toBe('name');
  });
});

describe('searchRequestSchema', () => {
  it('requires query', () => {
    expect(() => searchRequestSchema.parse({})).toThrow();
    expect(() => searchRequestSchema.parse({ query: '' })).toThrow();
  });

  it('accepts valid search request', () => {
    const result = searchRequestSchema.parse({
      query: 'test',
      filters: {
        chainIds: [11155111],
        active: true,
      },
      minScore: 0.5,
      limit: 10,
    });

    expect(result.query).toBe('test');
    expect(result.filters?.chainIds).toEqual([11155111]);
    expect(result.minScore).toBe(0.5);
    expect(result.limit).toBe(10);
  });

  it('uses defaults', () => {
    const result = searchRequestSchema.parse({ query: 'test' });
    expect(result.minScore).toBe(0.3);
    expect(result.limit).toBe(20);
  });

  it('clamps limit above maximum to 100', () => {
    const result = searchRequestSchema.parse({ query: 'test', limit: 500 });
    expect(result.limit).toBe(100);
  });

  it('rejects limit below minimum', () => {
    expect(() => searchRequestSchema.parse({ query: 'test', limit: 0 })).toThrow();
    expect(() => searchRequestSchema.parse({ query: 'test', limit: -1 })).toThrow();
  });

  it('accepts searchMode parameter', () => {
    // When not provided, searchMode defaults to 'auto' (Zod 4 applies .default())
    expect(searchRequestSchema.parse({ query: 'test' }).searchMode).toBe('auto');

    // Explicit modes
    expect(searchRequestSchema.parse({ query: 'test', searchMode: 'semantic' }).searchMode).toBe(
      'semantic'
    );
    expect(searchRequestSchema.parse({ query: 'test', searchMode: 'name' }).searchMode).toBe(
      'name'
    );
    expect(searchRequestSchema.parse({ query: 'test', searchMode: 'auto' }).searchMode).toBe(
      'auto'
    );
  });

  it('rejects invalid searchMode values', () => {
    expect(() => searchRequestSchema.parse({ query: 'test', searchMode: 'invalid' })).toThrow();
    expect(() => searchRequestSchema.parse({ query: 'test', searchMode: 'vector' })).toThrow();
  });
});

describe('classifyRequestSchema', () => {
  it('uses default force = false', () => {
    const result = classifyRequestSchema.parse({});
    expect(result.force).toBe(false);
  });

  it('accepts force = true', () => {
    const result = classifyRequestSchema.parse({ force: true });
    expect(result.force).toBe(true);
  });
});

describe('taxonomyQuerySchema', () => {
  it('defaults to all', () => {
    const result = taxonomyQuerySchema.parse({});
    expect(result.type).toBe('all');
  });

  it('accepts valid types', () => {
    expect(taxonomyQuerySchema.parse({ type: 'skill' }).type).toBe('skill');
    expect(taxonomyQuerySchema.parse({ type: 'domain' }).type).toBe('domain');
    expect(taxonomyQuerySchema.parse({ type: 'all' }).type).toBe('all');
  });

  it('rejects invalid types', () => {
    expect(() => taxonomyQuerySchema.parse({ type: 'invalid' })).toThrow();
  });
});

describe('parseClassificationRow', () => {
  it('returns undefined for null input', () => {
    expect(parseClassificationRow(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(parseClassificationRow(undefined)).toBeUndefined();
  });

  it('parses valid classification row', () => {
    const row = {
      skills: JSON.stringify([{ slug: 'nlp', confidence: 0.9 }]),
      domains: JSON.stringify([{ slug: 'finance', confidence: 0.8 }]),
      confidence: 0.85,
      classified_at: '2024-01-01T00:00:00Z',
      model_version: 'claude-3-haiku-20240307',
    };

    const result = parseClassificationRow(row);

    expect(result).toEqual({
      skills: [{ slug: 'nlp', confidence: 0.9 }],
      domains: [{ slug: 'finance', confidence: 0.8 }],
      confidence: 0.85,
      classifiedAt: '2024-01-01T00:00:00Z',
      modelVersion: 'claude-3-haiku-20240307',
    });
  });

  it('returns undefined for invalid JSON in skills', () => {
    const row = {
      skills: 'invalid json',
      domains: JSON.stringify([]),
      confidence: 0.85,
      classified_at: '2024-01-01T00:00:00Z',
      model_version: 'claude-3-haiku-20240307',
    };

    expect(parseClassificationRow(row)).toBeUndefined();
  });

  it('returns undefined for invalid JSON in domains', () => {
    const row = {
      skills: JSON.stringify([]),
      domains: 'invalid json',
      confidence: 0.85,
      classified_at: '2024-01-01T00:00:00Z',
      model_version: 'claude-3-haiku-20240307',
    };

    expect(parseClassificationRow(row)).toBeUndefined();
  });

  it('handles empty arrays', () => {
    const row = {
      skills: '[]',
      domains: '[]',
      confidence: 0.5,
      classified_at: '2024-01-01T00:00:00Z',
      model_version: 'claude-3-haiku-20240307',
    };

    const result = parseClassificationRow(row);

    expect(result).toEqual({
      skills: [],
      domains: [],
      confidence: 0.5,
      classifiedAt: '2024-01-01T00:00:00Z',
      modelVersion: 'claude-3-haiku-20240307',
    });
  });
});
