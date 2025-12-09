/**
 * IPFS service tests
 * @module test/unit/services/ipfs
 */

import { env } from 'cloudflare:test';
import { createCacheService } from '@/services/cache';
import {
  convertIpfsUri,
  createIPFSService,
  DEFAULT_IPFS_GATEWAY,
  DEFAULT_IPFS_TIMEOUT_MS,
  extractOasfEndpoint,
} from '@/services/ipfs';
import type { IPFSEndpoint } from '@/types/ipfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('convertIpfsUri', () => {
  it('converts ipfs:// URI to HTTP gateway URL', () => {
    const result = convertIpfsUri('ipfs://QmTest123');
    expect(result).toBe('https://ipfs.io/ipfs/QmTest123');
  });

  it('converts ipfs:// URI with custom gateway', () => {
    const result = convertIpfsUri('ipfs://QmTest123', 'https://gateway.pinata.cloud/ipfs/');
    expect(result).toBe('https://gateway.pinata.cloud/ipfs/QmTest123');
  });

  it('returns HTTP URL as-is', () => {
    const result = convertIpfsUri('https://example.com/metadata.json');
    expect(result).toBe('https://example.com/metadata.json');
  });

  it('returns HTTPS URL as-is', () => {
    const result = convertIpfsUri('https://ipfs.io/ipfs/QmTest123');
    expect(result).toBe('https://ipfs.io/ipfs/QmTest123');
  });

  it('handles ipfs:// with path', () => {
    const result = convertIpfsUri('ipfs://QmHash/metadata.json');
    expect(result).toBe('https://ipfs.io/ipfs/QmHash/metadata.json');
  });
});

describe('extractOasfEndpoint', () => {
  it('returns undefined for undefined endpoints', () => {
    expect(extractOasfEndpoint(undefined)).toBeUndefined();
  });

  it('returns undefined for empty endpoints array', () => {
    expect(extractOasfEndpoint([])).toBeUndefined();
  });

  it('returns undefined when no OASF endpoint exists', () => {
    const endpoints: IPFSEndpoint[] = [
      { type: 'MCP', value: 'https://mcp.example.com' },
      { type: 'A2A', value: 'https://a2a.example.com' },
    ];
    expect(extractOasfEndpoint(endpoints)).toBeUndefined();
  });

  it('extracts OASF endpoint with uppercase type', () => {
    const endpoints: IPFSEndpoint[] = [
      { type: 'OASF', value: 'https://oasf.example.com' },
    ];
    const result = extractOasfEndpoint(endpoints);
    expect(result).toEqual({
      url: 'https://oasf.example.com',
      skills: undefined,
      domains: undefined,
      version: undefined,
    });
  });

  it('extracts OASF endpoint with lowercase type', () => {
    const endpoints: IPFSEndpoint[] = [
      { type: 'oasf', value: 'https://oasf.example.com' },
    ];
    const result = extractOasfEndpoint(endpoints);
    expect(result).toEqual({
      url: 'https://oasf.example.com',
      skills: undefined,
      domains: undefined,
      version: undefined,
    });
  });

  it('extracts OASF endpoint with meta fields', () => {
    const endpoints: IPFSEndpoint[] = [
      {
        type: 'OASF',
        value: 'https://oasf.example.com',
        meta: {
          skills: ['natural_language_processing/text_generation'],
          domains: ['technology/software_development'],
          version: '0.8.0',
        },
      },
    ];
    const result = extractOasfEndpoint(endpoints);
    expect(result).toEqual({
      url: 'https://oasf.example.com',
      skills: ['natural_language_processing/text_generation'],
      domains: ['technology/software_development'],
      version: '0.8.0',
    });
  });

  it('returns first OASF endpoint if multiple exist', () => {
    const endpoints: IPFSEndpoint[] = [
      { type: 'OASF', value: 'https://first.example.com' },
      { type: 'OASF', value: 'https://second.example.com' },
    ];
    const result = extractOasfEndpoint(endpoints);
    expect(result?.url).toBe('https://first.example.com');
  });
});

describe('DEFAULT constants', () => {
  it('has correct default gateway', () => {
    expect(DEFAULT_IPFS_GATEWAY).toBe('https://ipfs.io/ipfs/');
  });

  it('has correct default timeout', () => {
    expect(DEFAULT_IPFS_TIMEOUT_MS).toBe(10_000);
  });
});

describe('createIPFSService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates IPFS service instance', () => {
    const cache = createCacheService(env.CACHE, 300);
    const service = createIPFSService(cache);
    expect(service).toBeDefined();
    expect(service.fetchMetadata).toBeDefined();
  });

  describe('fetchMetadata', () => {
    it('returns null for empty metadataUri', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      const result = await service.fetchMetadata('', 'test-agent');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null for whitespace-only metadataUri', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      const result = await service.fetchMetadata('   ', 'test-agent');
      expect(result).toBeNull();
    });

    it('fetches and parses valid metadata', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Test Agent',
            description: 'A test agent',
            image: 'ipfs://QmImage',
            externalUrl: 'https://example.com',
            socialLinks: {
              twitter: '@testagent',
              github: 'testagent',
            },
            endpoints: [
              {
                type: 'OASF',
                value: 'https://oasf.example.com',
                meta: {
                  skills: ['natural_language_processing/text_generation'],
                  domains: ['technology/software_development'],
                },
              },
            ],
            attributes: [
              { trait_type: 'Category', value: 'AI' },
            ],
          }),
      });

      const result = await service.fetchMetadata('ipfs://QmTest', 'test-agent');

      expect(result).toEqual({
        name: 'Test Agent',
        description: 'A test agent',
        image: 'ipfs://QmImage',
        externalUrl: 'https://example.com',
        socialLinks: {
          twitter: '@testagent',
          github: 'testagent',
        },
        endpoints: [
          {
            type: 'OASF',
            value: 'https://oasf.example.com',
            meta: {
              skills: ['natural_language_processing/text_generation'],
              domains: ['technology/software_development'],
            },
          },
        ],
        attributes: [
          { trait_type: 'Category', value: 'AI' },
        ],
        oasfEndpoint: {
          url: 'https://oasf.example.com',
          skills: ['natural_language_processing/text_generation'],
          domains: ['technology/software_development'],
          version: undefined,
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ipfs.io/ipfs/QmTest',
        expect.objectContaining({
          headers: { Accept: 'application/json' },
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('handles alternative naming conventions (external_url, social_links)', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Test Agent',
            external_url: 'https://example.com',
            social_links: {
              discord: 'testagent',
            },
          }),
      });

      const result = await service.fetchMetadata('https://example.com/meta.json', 'test-agent');

      expect(result?.externalUrl).toBe('https://example.com');
      expect(result?.socialLinks).toEqual({ discord: 'testagent' });
    });

    it('returns cached metadata on subsequent calls', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Cached Agent',
          }),
      });

      // First call
      await service.fetchMetadata('ipfs://QmCached', 'cached-agent');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should return cached
      const result = await service.fetchMetadata('ipfs://QmCached', 'cached-agent');
      expect(result?.name).toBe('Cached Agent');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns null for non-ok response', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.fetchMetadata('ipfs://QmNotFound', 'not-found');
      expect(result).toBeNull();
    });

    it('returns null for fetch error', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.fetchMetadata('ipfs://QmError', 'error-agent');
      expect(result).toBeNull();
    });

    it('handles JSON parse error gracefully', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const result = await service.fetchMetadata('ipfs://QmInvalid', 'invalid-agent');
      expect(result).toBeNull();
    });

    it('uses custom gateway URL from config', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache, {
        gatewayUrl: 'https://custom.gateway.io/ipfs/',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: 'Custom' }),
      });

      await service.fetchMetadata('ipfs://QmCustom', 'custom-agent');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.gateway.io/ipfs/QmCustom',
        expect.anything()
      );
    });

    it('handles metadata without OASF endpoint', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'No OASF Agent',
            endpoints: [
              { type: 'MCP', value: 'https://mcp.example.com' },
            ],
          }),
      });

      const result = await service.fetchMetadata('ipfs://QmNoOasf', 'no-oasf');
      expect(result?.oasfEndpoint).toBeUndefined();
    });

    it('handles metadata with invalid validation but still extracts data', async () => {
      const cache = createCacheService(env.CACHE, 300);
      const service = createIPFSService(cache);

      // Metadata that fails Zod validation but still has extractable data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Partial Agent',
            externalUrl: 'not-a-valid-url', // Invalid URL but we still extract it
            customField: 'custom value', // Extra fields are allowed
          }),
      });

      const result = await service.fetchMetadata('ipfs://QmPartial', 'partial');
      expect(result?.name).toBe('Partial Agent');
    });
  });
});
