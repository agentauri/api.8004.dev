/**
 * Centralized agent data transformations
 * Provides consistent mapping between different agent representations
 * @module lib/utils/agent-transform
 */

import type { AgentSummary, OASFClassification, OASFSource, TrustMethod } from '@/types';

/**
 * Common OASF classification builder
 * Creates consistent OASF structure from skills/domains data
 */
export function buildOASFClassification(params: {
  skills: string[];
  domains: string[];
  skillsWithConfidence?: Array<{ slug: string; confidence: number }>;
  domainsWithConfidence?: Array<{ slug: string; confidence: number }>;
  confidence?: number;
  classifiedAt?: string;
  modelVersion?: string;
}): OASFClassification | undefined {
  const {
    skills,
    domains,
    skillsWithConfidence,
    domainsWithConfidence,
    confidence = 1,
    classifiedAt = new Date().toISOString(),
    modelVersion = 'qdrant-indexed',
  } = params;

  // Use enriched data when available
  const hasEnriched = (skillsWithConfidence?.length ?? 0) > 0;
  const hasBasic = skills.length > 0 || domains.length > 0;

  if (!hasEnriched && !hasBasic) {
    return undefined;
  }

  return hasEnriched
    ? {
        skills: skillsWithConfidence ?? [],
        domains: domainsWithConfidence ?? [],
        confidence,
        classifiedAt,
        modelVersion,
      }
    : {
        skills: skills.map((slug) => ({ slug, confidence: 1 })),
        domains: domains.map((slug) => ({ slug, confidence: 1 })),
        confidence: 1,
        classifiedAt,
        modelVersion,
      };
}

/**
 * Derive supported trust methods from agent features
 */
export function deriveSupportedTrust(x402Support: boolean): TrustMethod[] {
  const methods: TrustMethod[] = [];
  if (x402Support) methods.push('x402');
  return methods;
}

/**
 * Determine OASF source based on classification presence
 */
export function determineOASFSource(oasf: OASFClassification | undefined): OASFSource {
  return oasf ? 'llm-classification' : 'none';
}

/**
 * Parse agent ID into components
 */
export function parseAgentIdComponents(agentId: string): { chainId: number; tokenId: string } {
  const parts = agentId.split(':');
  const chainIdStr = parts[0] || '0';
  const tokenId = parts[1] || '0';
  return {
    chainId: Number.parseInt(chainIdStr, 10),
    tokenId,
  };
}

/**
 * Normalize optional string values
 * Converts null/empty strings to undefined
 */
export function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (!value || value === '') return undefined;
  return value;
}

/**
 * Normalize optional array values
 * Returns undefined for empty arrays
 */
export function normalizeOptionalArray<T>(arr: T[] | undefined): T[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr;
}

/**
 * Base agent fields builder
 * Creates common AgentSummary fields from various input formats
 */
export interface BaseAgentInput {
  agentId: string;
  name: string;
  description: string;
  image?: string | null;
  active: boolean;
  hasMcp: boolean;
  hasA2a: boolean;
  x402Support: boolean;
  operators?: string[];
  ens?: string | null;
  did?: string | null;
  walletAddress?: string | null;
  owner?: string;
  reputationScore?: number;
  searchScore?: number;
  inputModes?: string[];
  outputModes?: string[];
  erc8004Version?: string;
}

/**
 * Build AgentSummary from base input
 */
export function buildAgentSummary(
  input: BaseAgentInput,
  oasf?: OASFClassification
): AgentSummary {
  const { chainId, tokenId } = parseAgentIdComponents(input.agentId);

  return {
    id: input.agentId,
    chainId,
    tokenId,
    name: input.name,
    description: input.description,
    image: normalizeOptionalString(input.image),
    active: input.active,
    hasMcp: input.hasMcp,
    hasA2a: input.hasA2a,
    x402Support: input.x402Support,
    supportedTrust: deriveSupportedTrust(input.x402Support),
    oasf,
    oasfSource: determineOASFSource(oasf),
    searchScore: input.searchScore,
    reputationScore: input.reputationScore,
    owner: input.owner,
    operators: normalizeOptionalArray(input.operators),
    ens: normalizeOptionalString(input.ens),
    did: normalizeOptionalString(input.did),
    walletAddress: normalizeOptionalString(input.walletAddress),
    inputModes: normalizeOptionalArray(input.inputModes),
    outputModes: normalizeOptionalArray(input.outputModes),
    erc8004Version: input.erc8004Version,
  };
}
