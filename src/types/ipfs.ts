/**
 * IPFS Metadata type definitions
 * @module types/ipfs
 */

/**
 * Social links from IPFS metadata
 */
export interface SocialLinks {
  /** Website URL */
  website?: string;
  /** Twitter/X handle or URL */
  twitter?: string;
  /** Discord invite or server ID */
  discord?: string;
  /** GitHub username or URL */
  github?: string;
  /** Telegram username or URL */
  telegram?: string;
}

/**
 * Metadata attribute (NFT-style trait)
 */
export interface MetadataAttribute {
  /** Trait type/name */
  trait_type: string;
  /** Trait value */
  value: string | number | boolean;
}

/**
 * Endpoint from IPFS registration file
 */
export interface IPFSEndpoint {
  /** Endpoint type: MCP, A2A, OASF, ENS, DID, wallet */
  type: 'MCP' | 'A2A' | 'OASF' | 'ENS' | 'DID' | 'wallet' | string;
  /** Endpoint URL or value */
  value: string;
  /** Optional metadata for the endpoint */
  meta?: {
    /** OASF skills (for type=OASF) */
    skills?: string[];
    /** OASF domains (for type=OASF) */
    domains?: string[];
    /** Protocol version */
    version?: string;
    /** Additional metadata */
    [key: string]: unknown;
  };
}

/**
 * OASF endpoint extracted from IPFS metadata
 */
export interface OASFEndpoint {
  /** OASF schema URL (e.g., ipfs:// or https://) */
  url: string;
  /** Creator-defined skills */
  skills?: string[];
  /** Creator-defined domains */
  domains?: string[];
  /** OASF schema version */
  version?: string;
}

/**
 * Complete IPFS metadata from registration file
 */
export interface IPFSMetadata {
  /** Agent name (may override on-chain) */
  name?: string;
  /** Agent description (may override on-chain) */
  description?: string;
  /** Agent image URL */
  image?: string;
  /** External URL (website, documentation) */
  externalUrl?: string;
  /** Social media links */
  socialLinks?: SocialLinks;
  /** All endpoints from registration file */
  endpoints?: IPFSEndpoint[];
  /** NFT-style attributes */
  attributes?: MetadataAttribute[];
  /** Extracted OASF endpoint (convenience field) */
  oasfEndpoint?: OASFEndpoint;
}

/**
 * Source of OASF classification
 */
export type OASFSource = 'creator-defined' | 'llm-classification' | 'none';
