/**
 * Validation tests
 * @module test/unit/lib/validation
 */

import {
  SUPPORTED_CHAIN_IDS,
  agentIdSchema,
  chainIdSchema,
  classifyRequestSchema,
  listAgentsQuerySchema,
  parseAgentId,
  searchRequestSchema,
  taxonomyQuerySchema,
  validateBody,
  validateQuery,
} from '@/lib/utils/validation';
import { describe, expect, it } from 'vitest';

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

  it('enforces limit constraints', () => {
    expect(listAgentsQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(listAgentsQuerySchema.parse({ limit: '100' }).limit).toBe(100);
    expect(() => listAgentsQuerySchema.parse({ limit: '0' })).toThrow();
    expect(() => listAgentsQuerySchema.parse({ limit: '101' })).toThrow();
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

describe('validateBody', () => {
  it('parses valid JSON body', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test search' }),
    });

    const result = await validateBody(request, searchRequestSchema);

    expect(result.query).toBe('test search');
    expect(result.limit).toBe(20); // default
  });

  it('throws on invalid body', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' }), // empty query is invalid
    });

    await expect(validateBody(request, searchRequestSchema)).rejects.toThrow();
  });
});

describe('validateQuery', () => {
  it('parses valid query parameters', () => {
    const query = { type: 'skill' };
    const result = validateQuery(query, taxonomyQuerySchema);

    expect(result.type).toBe('skill');
  });

  it('applies defaults', () => {
    const query = {};
    const result = validateQuery(query, taxonomyQuerySchema);

    expect(result.type).toBe('all');
  });

  it('throws on invalid query', () => {
    const query = { type: 'invalid' };
    expect(() => validateQuery(query, taxonomyQuerySchema)).toThrow();
  });
});
