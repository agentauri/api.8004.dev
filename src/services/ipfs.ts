/**
 * IPFS Metadata service for fetching registration files
 * @module services/ipfs
 */

import { z } from 'zod';
import { fetchWithTimeout } from '../lib/utils/fetch';
import type { IPFSEndpoint, IPFSMetadata, OASFEndpoint, SocialLinks } from '../types/ipfs';
import type { CacheService } from './cache';
import { CACHE_KEYS, CACHE_TTL } from './cache';

/**
 * Default IPFS gateway URL
 */
export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/**
 * Default timeout for IPFS fetches (10 seconds)
 */
export const DEFAULT_IPFS_TIMEOUT_MS = 10_000;

/**
 * Zod schema for social links validation
 */
const socialLinksSchema = z
  .object({
    website: z.string().url().optional(),
    twitter: z.string().optional(),
    discord: z.string().optional(),
    github: z.string().optional(),
    telegram: z.string().optional(),
  })
  .passthrough();

/**
 * Zod schema for metadata attribute validation
 */
const metadataAttributeSchema = z.object({
  trait_type: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

/**
 * Zod schema for endpoint validation
 */
const endpointSchema = z.object({
  type: z.string(),
  value: z.string(),
  meta: z
    .object({
      skills: z.array(z.string()).optional(),
      domains: z.array(z.string()).optional(),
      version: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

/**
 * Zod schema for IPFS metadata validation (permissive)
 */
const ipfsMetadataSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    externalUrl: z.string().url().optional(),
    external_url: z.string().url().optional(), // Alternative naming
    socialLinks: socialLinksSchema.optional(),
    social_links: socialLinksSchema.optional(), // Alternative naming
    endpoints: z.array(endpointSchema).optional(),
    attributes: z.array(metadataAttributeSchema).optional(),
  })
  .passthrough();

/**
 * IPFS Service interface
 */
export interface IPFSService {
  /**
   * Fetch metadata from an IPFS/HTTP URI
   * @param metadataUri - The ipfs:// or https:// URI
   * @param agentId - Agent ID for caching
   * @returns Parsed metadata or null if fetch fails
   */
  fetchMetadata(metadataUri: string, agentId: string): Promise<IPFSMetadata | null>;
}

/**
 * Convert an IPFS URI to an HTTP gateway URL
 * @param uri - The ipfs:// or https:// URI
 * @param gateway - The IPFS gateway base URL
 * @returns HTTP URL
 */
export function convertIpfsUri(uri: string, gateway: string = DEFAULT_IPFS_GATEWAY): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    return `${gateway}${cid}`;
  }

  // Already an HTTP URL
  return uri;
}

/**
 * Extract OASF endpoint from endpoints array
 * @param endpoints - Array of endpoints from registration file
 * @returns OASF endpoint or undefined
 */
export function extractOasfEndpoint(
  endpoints: IPFSEndpoint[] | undefined
): OASFEndpoint | undefined {
  if (!endpoints) return undefined;

  const oasfEndpoint = endpoints.find(
    (ep) => ep.type === 'OASF' || ep.type.toLowerCase() === 'oasf'
  );

  if (!oasfEndpoint) return undefined;

  return {
    url: oasfEndpoint.value,
    skills: oasfEndpoint.meta?.skills,
    domains: oasfEndpoint.meta?.domains,
    version: oasfEndpoint.meta?.version,
  };
}

/**
 * Normalize social links from different naming conventions
 */
function normalizeSocialLinks(data: Record<string, unknown>): SocialLinks | undefined {
  const socialLinks = (data.socialLinks || data.social_links) as SocialLinks | undefined;
  return socialLinks;
}

/**
 * Normalize external URL from different naming conventions
 */
function normalizeExternalUrl(data: Record<string, unknown>): string | undefined {
  return (data.externalUrl || data.external_url) as string | undefined;
}

/**
 * IPFS Service configuration
 */
export interface IPFSServiceConfig {
  /** IPFS gateway URL (default: https://ipfs.io/ipfs/) */
  gatewayUrl?: string;
  /** Timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
}

/**
 * Create an IPFS service instance
 * @param cache - Cache service for storing fetched metadata
 * @param config - Optional configuration
 * @returns IPFS service instance
 */
export function createIPFSService(
  cache: CacheService,
  config: IPFSServiceConfig = {}
): IPFSService {
  const gatewayUrl = config.gatewayUrl || DEFAULT_IPFS_GATEWAY;
  const timeoutMs = config.timeoutMs || DEFAULT_IPFS_TIMEOUT_MS;

  return {
    async fetchMetadata(metadataUri: string, agentId: string): Promise<IPFSMetadata | null> {
      // Check cache first
      const cacheKey = CACHE_KEYS.ipfsMetadata(agentId);
      const cached = await cache.get<IPFSMetadata>(cacheKey);
      if (cached) {
        return cached;
      }

      // Validate URI
      if (!metadataUri || metadataUri.trim() === '') {
        return null;
      }

      try {
        // Convert IPFS URI to HTTP
        const httpUrl = convertIpfsUri(metadataUri, gatewayUrl);

        // Fetch with timeout
        const response = await fetchWithTimeout(
          httpUrl,
          {
            headers: {
              Accept: 'application/json',
            },
          },
          timeoutMs
        );

        if (!response.ok) {
          console.warn(`IPFS fetch failed for ${agentId}: HTTP ${response.status}`);
          return null;
        }

        // Parse JSON
        const rawData = await response.json();

        // Validate with Zod (permissive)
        const parseResult = ipfsMetadataSchema.safeParse(rawData);
        if (!parseResult.success) {
          console.warn(
            `IPFS metadata validation failed for ${agentId}:`,
            parseResult.error.message
          );
          // Still try to use the data with safe extraction
        }

        const data = rawData as Record<string, unknown>;

        // Normalize and build metadata object
        const metadata: IPFSMetadata = {
          name: data.name as string | undefined,
          description: data.description as string | undefined,
          image: data.image as string | undefined,
          externalUrl: normalizeExternalUrl(data),
          socialLinks: normalizeSocialLinks(data),
          endpoints: data.endpoints as IPFSEndpoint[] | undefined,
          attributes: data.attributes as IPFSMetadata['attributes'],
        };

        // Extract OASF endpoint for convenience
        metadata.oasfEndpoint = extractOasfEndpoint(metadata.endpoints);

        // Cache the result
        await cache.set(cacheKey, metadata, CACHE_TTL.IPFS_METADATA);

        return metadata;
      } catch (error) {
        // Log but don't throw - return null for graceful degradation
        console.error(
          `IPFS fetch error for ${agentId}:`,
          error instanceof Error ? error.message : error
        );
        return null;
      }
    },
  };
}
