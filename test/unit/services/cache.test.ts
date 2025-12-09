/**
 * Cache service tests
 * @module test/unit/services/cache
 */

import { env } from 'cloudflare:test';
import { CACHE_KEYS, CACHE_TTL, createCacheService } from '@/services/cache';
import { describe, expect, it } from 'vitest';

describe('createCacheService', () => {
  it('creates cache service instance', () => {
    const cache = createCacheService(env.CACHE, 300);
    expect(cache).toBeDefined();
    expect(cache.get).toBeDefined();
    expect(cache.set).toBeDefined();
    expect(cache.delete).toBeDefined();
    expect(cache.generateKey).toBeDefined();
  });

  describe('get/set', () => {
    it('returns null for non-existent key', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('stores and retrieves value', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const data = { foo: 'bar' };

      await cache.set('test-key', data);
      const result = await cache.get('test-key');

      expect(result).toEqual(data);
    });

    it('stores complex objects', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const data = {
        id: 1,
        nested: { value: 'test' },
        array: [1, 2, 3],
      };

      await cache.set('complex-key', data);
      const result = await cache.get<typeof data>('complex-key');

      expect(result).toEqual(data);
    });
  });

  describe('delete', () => {
    it('deletes existing key', async () => {
      const cache = createCacheService(env.CACHE, 300);

      await cache.set('delete-test', { value: 1 });
      await cache.delete('delete-test');

      const result = await cache.get('delete-test');
      expect(result).toBeNull();
    });
  });

  describe('generateKey', () => {
    it('generates consistent keys', () => {
      const cache = createCacheService(env.CACHE, 300);

      const key1 = cache.generateKey('prefix', { a: 1, b: 2 });
      const key2 = cache.generateKey('prefix', { a: 1, b: 2 });

      expect(key1).toBe(key2);
    });

    it('generates different keys for different params', () => {
      const cache = createCacheService(env.CACHE, 300);

      const key1 = cache.generateKey('prefix', { a: 1 });
      const key2 = cache.generateKey('prefix', { a: 2 });

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different prefixes', () => {
      const cache = createCacheService(env.CACHE, 300);

      const key1 = cache.generateKey('prefix1', { a: 1 });
      const key2 = cache.generateKey('prefix2', { a: 1 });

      expect(key1).not.toBe(key2);
    });
  });
});

describe('CACHE_KEYS', () => {
  it('generates agents list key', () => {
    expect(CACHE_KEYS.agentsList('abc123')).toBe('agents:list:abc123');
  });

  it('generates agent detail key', () => {
    expect(CACHE_KEYS.agentDetail('11155111:1')).toBe('agents:detail:11155111:1');
  });

  it('generates classification key', () => {
    expect(CACHE_KEYS.classification('11155111:1')).toBe('classification:11155111:1');
  });

  it('generates chain stats key', () => {
    expect(CACHE_KEYS.chainStats()).toBe('chains:stats');
  });

  it('generates taxonomy key', () => {
    expect(CACHE_KEYS.taxonomy('skill')).toBe('taxonomy:skill');
  });

  it('generates search key', () => {
    expect(CACHE_KEYS.search('abc123')).toBe('search:abc123');
  });

  it('generates IPFS metadata key', () => {
    expect(CACHE_KEYS.ipfsMetadata('11155111:1')).toBe('ipfs:metadata:11155111:1');
  });
});

describe('CACHE_TTL', () => {
  it('has correct TTL values', () => {
    expect(CACHE_TTL.AGENTS).toBe(300);
    expect(CACHE_TTL.AGENT_DETAIL).toBe(300);
    expect(CACHE_TTL.CLASSIFICATION).toBe(86400);
    expect(CACHE_TTL.CHAIN_STATS).toBe(900);
    expect(CACHE_TTL.TAXONOMY).toBe(3600);
    expect(CACHE_TTL.SEARCH).toBe(300);
    expect(CACHE_TTL.IPFS_METADATA).toBe(3600);
  });
});
