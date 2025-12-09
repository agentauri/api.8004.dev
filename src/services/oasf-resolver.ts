/**
 * OASF Classification Resolver
 * Resolves classification from multiple sources with priority
 * @module services/oasf-resolver
 */

import { OASF_VERSION, validateDomainSlug, validateSkillSlug } from '../lib/oasf/taxonomy';
import type { ParsedClassification } from '../lib/utils/validation';
import type {
  DomainClassification,
  OASFClassification,
  SkillClassification,
} from '../types/classification';
import type { IPFSMetadata, OASFSource } from '../types/ipfs';

/**
 * Resolved classification with source tracking
 */
export interface ResolvedClassification {
  /** Classified skills */
  skills: SkillClassification[];
  /** Classified domains */
  domains: DomainClassification[];
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Source of classification */
  source: OASFSource;
  /** ISO timestamp when classified (if from LLM) */
  classifiedAt?: string;
  /** Model version (if from LLM) or OASF version (if creator-defined) */
  modelVersion?: string;
}

/**
 * Convert OASF classification to full classification response
 */
export function toOASFClassification(
  resolved: ResolvedClassification
): OASFClassification | undefined {
  if (resolved.source === 'none') {
    return undefined;
  }

  return {
    skills: resolved.skills,
    domains: resolved.domains,
    confidence: resolved.confidence,
    classifiedAt: resolved.classifiedAt || new Date().toISOString(),
    modelVersion: resolved.modelVersion || OASF_VERSION,
    source: resolved.source === 'creator-defined' ? 'creator-defined' : 'llm-classification',
  };
}

/**
 * Extract and validate skills from IPFS OASF endpoint
 * @param skills - Raw skill slugs from IPFS
 * @returns Validated skill classifications with confidence 1.0
 */
function extractCreatorSkills(skills: string[] | undefined): SkillClassification[] {
  if (!skills || skills.length === 0) {
    return [];
  }

  return skills
    .filter((slug) => validateSkillSlug(slug))
    .map((slug) => ({
      slug,
      confidence: 1.0, // Creator-defined = full confidence
    }));
}

/**
 * Extract and validate domains from IPFS OASF endpoint
 * @param domains - Raw domain slugs from IPFS
 * @returns Validated domain classifications with confidence 1.0
 */
function extractCreatorDomains(domains: string[] | undefined): DomainClassification[] {
  if (!domains || domains.length === 0) {
    return [];
  }

  return domains
    .filter((slug) => validateDomainSlug(slug))
    .map((slug) => ({
      slug,
      confidence: 1.0, // Creator-defined = full confidence
    }));
}

/**
 * Check if IPFS metadata has valid OASF endpoint with skills or domains
 * @param ipfsMetadata - IPFS metadata or null
 * @returns True if has valid OASF data
 */
export function hasCreatorDefinedOasf(ipfsMetadata: IPFSMetadata | null): boolean {
  if (!ipfsMetadata?.oasfEndpoint) {
    return false;
  }

  const { skills, domains } = ipfsMetadata.oasfEndpoint;

  // Check if there are any valid skills or domains
  const validSkills = extractCreatorSkills(skills);
  const validDomains = extractCreatorDomains(domains);

  return validSkills.length > 0 || validDomains.length > 0;
}

/**
 * Resolve OASF classification from IPFS metadata (creator-defined)
 * @param ipfsMetadata - IPFS metadata with OASF endpoint
 * @returns Resolved classification from creator
 */
function resolveFromIPFS(ipfsMetadata: IPFSMetadata): ResolvedClassification {
  const oasfEndpoint = ipfsMetadata.oasfEndpoint;

  if (!oasfEndpoint) {
    return {
      skills: [],
      domains: [],
      confidence: 0,
      source: 'none',
    };
  }

  const skills = extractCreatorSkills(oasfEndpoint.skills);
  const domains = extractCreatorDomains(oasfEndpoint.domains);

  // If no valid skills/domains after validation, treat as no classification
  if (skills.length === 0 && domains.length === 0) {
    return {
      skills: [],
      domains: [],
      confidence: 0,
      source: 'none',
    };
  }

  return {
    skills,
    domains,
    confidence: 1.0, // Creator-defined = full confidence
    source: 'creator-defined',
    classifiedAt: new Date().toISOString(),
    modelVersion: oasfEndpoint.version || OASF_VERSION,
  };
}

/**
 * Resolve OASF classification from database (LLM-classified)
 * @param dbClassification - Parsed classification from database
 * @returns Resolved classification from LLM
 */
function resolveFromDatabase(dbClassification: ParsedClassification): ResolvedClassification {
  return {
    skills: dbClassification.skills,
    domains: dbClassification.domains,
    confidence: dbClassification.confidence,
    source: 'llm-classification',
    classifiedAt: dbClassification.classifiedAt,
    modelVersion: dbClassification.modelVersion,
  };
}

/**
 * Resolve OASF classification with priority:
 * 1. Creator-defined OASF from IPFS (highest priority, confidence 1.0)
 * 2. LLM classification from database
 * 3. No classification available
 *
 * @param ipfsMetadata - IPFS metadata with potential OASF endpoint (or null)
 * @param dbClassification - Database classification (or undefined)
 * @returns Resolved classification with source tracking
 */
export function resolveClassification(
  ipfsMetadata: IPFSMetadata | null,
  dbClassification: ParsedClassification | undefined
): ResolvedClassification {
  // Priority 1: Creator-defined OASF from IPFS
  if (ipfsMetadata && hasCreatorDefinedOasf(ipfsMetadata)) {
    return resolveFromIPFS(ipfsMetadata);
  }

  // Priority 2: LLM classification from database
  if (dbClassification) {
    return resolveFromDatabase(dbClassification);
  }

  // Priority 3: No classification available
  return {
    skills: [],
    domains: [],
    confidence: 0,
    source: 'none',
  };
}
