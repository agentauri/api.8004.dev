/**
 * Qdrant Payload Builder
 *
 * Centralized utility for building consistent AgentPayload objects
 * from various input sources (SDK, Graph, etc.)
 *
 * @module lib/qdrant/payload-builder
 */

import type { AgentPayload } from './types';

/**
 * Base input for building agent payloads
 * Common fields that all input sources provide
 */
export interface PayloadBuilderInput {
  /** Full agent ID (chainId:tokenId) */
  agentId: string;
  /** Chain ID */
  chainId: number;
  /** Token ID */
  tokenId: string;
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Image URL */
  image?: string;
  /** Whether agent is active */
  active: boolean;
  /** MCP endpoint URL */
  mcpEndpoint?: string;
  /** A2A endpoint URL */
  a2aEndpoint?: string;
  /** Whether agent supports x402 payments */
  x402Support?: boolean;
  /** Whether agent has registration file */
  hasRegistrationFile: boolean;
  /** ENS name */
  ens?: string;
  /** DID identifier */
  did?: string;
  /** Wallet address */
  walletAddress?: string;
  /** Owner address */
  owner: string;
  /** Operator addresses */
  operators: string[];
  /** MCP tool names */
  mcpTools?: string[];
  /** MCP prompt names */
  mcpPrompts?: string[];
  /** MCP resource names */
  mcpResources?: string[];
  /** A2A skill names */
  a2aSkills?: string[];
  /** Created at timestamp */
  createdAt?: string;
  /** MCP version */
  mcpVersion?: string;
  /** A2A version */
  a2aVersion?: string;
  /** Supported trust systems */
  supportedTrusts?: string[];
  /** Agent URI */
  agentUri?: string;
  /** Updated at timestamp */
  updatedAt?: string;
  /** @deprecated Removed in ERC-8004 v1.0, always 0 */
  agentWalletChainId?: number;
  /** ERC-8004 version (always 'v1.0') */
  erc8004Version?: 'v1.0';

  // Gap 4: Declared OASF fields (v1.0)
  /** OASF skills declared in registration file */
  oasfSkills?: string[];
  /** OASF domains declared in registration file */
  oasfDomains?: string[];

  // Gap 5: New endpoint fields (v1.0)
  /** Email contact endpoint */
  emailEndpoint?: string;
  /** OASF API endpoint */
  oasfEndpoint?: string;
  /** OASF API version */
  oasfVersion?: string;
}

/**
 * Optional enrichment data for payloads
 * Data that may come from other services (A2A, D1, etc.)
 */
export interface PayloadEnrichment {
  /** Input modes from A2A AgentCard */
  inputModes?: string[];
  /** Output modes from A2A AgentCard */
  outputModes?: string[];
  /** OASF skills */
  skills?: string[];
  /** OASF domains */
  domains?: string[];
  /** Reputation score (0-100) */
  reputation?: number;
  /** Trust score (0-100) */
  trustScore?: number;
  /** A2A endpoint reachable */
  isReachableA2a?: boolean;
  /** MCP endpoint reachable */
  isReachableMcp?: boolean;
  /** Curator wallet addresses */
  curatedBy?: string[];
  /** Whether agent is curated */
  isCurated?: boolean;

  // Gap 6: Reachability attestations
  /** Last MCP reachability check timestamp */
  lastReachabilityCheckMcp?: string;
  /** Last A2A reachability check timestamp */
  lastReachabilityCheckA2a?: string;
  /** Wallet address of the reachability attestor */
  reachabilityAttestor?: string;
}

/**
 * Build AgentPayload from input and optional enrichment data
 *
 * @param input - Base agent data from SDK or Graph
 * @param enrichment - Optional enrichment data from other sources
 * @returns Complete AgentPayload for Qdrant
 */
export function buildAgentPayload(
  input: PayloadBuilderInput,
  enrichment?: PayloadEnrichment
): AgentPayload {
  return {
    // Core identifiers
    agent_id: input.agentId,
    chain_id: input.chainId,
    token_id: input.tokenId,

    // Basic info
    name: input.name,
    description: input.description,
    image: input.image ?? '',
    active: input.active,

    // Protocol support
    has_mcp: !!input.mcpEndpoint,
    has_a2a: !!input.a2aEndpoint,
    x402_support: input.x402Support ?? false,
    has_registration_file: input.hasRegistrationFile,

    // Endpoints
    mcp_endpoint: input.mcpEndpoint ?? '',
    a2a_endpoint: input.a2aEndpoint ?? '',

    // Identity
    ens: input.ens ?? '',
    did: input.did ?? '',
    wallet_address: input.walletAddress ?? '',
    owner: (input.owner ?? '').toLowerCase(),
    operators: input.operators ?? [],

    // Capabilities
    mcp_tools: input.mcpTools ?? [],
    mcp_prompts: input.mcpPrompts ?? [],
    mcp_resources: input.mcpResources ?? [],
    a2a_skills: input.a2aSkills ?? [],

    // I/O modes (from A2A AgentCard or enrichment)
    input_modes: enrichment?.inputModes ?? [],
    output_modes: enrichment?.outputModes ?? [],

    // Classification (from D1 or enrichment)
    skills: enrichment?.skills ?? [],
    domains: enrichment?.domains ?? [],

    // Reputation & trust
    reputation: enrichment?.reputation ?? 0,
    trust_score: enrichment?.trustScore ?? 0,

    // Reachability status
    is_reachable_a2a: enrichment?.isReachableA2a ?? false,
    is_reachable_mcp: enrichment?.isReachableMcp ?? false,

    // Timestamps
    created_at: input.createdAt ?? new Date().toISOString(),
    updated_at: input.updatedAt ?? '',

    // Version info
    mcp_version: input.mcpVersion ?? '',
    a2a_version: input.a2aVersion ?? '',
    agent_wallet_chain_id: input.agentWalletChainId ?? 0,
    supported_trusts: input.supportedTrusts ?? [],
    agent_uri: input.agentUri ?? '',
    erc_8004_version: input.erc8004Version ?? 'v1.0',

    // Curation
    curated_by: enrichment?.curatedBy ?? [],
    is_curated: enrichment?.isCurated ?? false,

    // Gap 4: Declared OASF fields
    declared_oasf_skills: input.oasfSkills ?? [],
    declared_oasf_domains: input.oasfDomains ?? [],

    // Gap 5: New endpoint fields
    email_endpoint: input.emailEndpoint ?? '',
    oasf_endpoint: input.oasfEndpoint ?? '',
    oasf_version: input.oasfVersion ?? '',

    // Gap 6: Reachability attestations
    last_reachability_check_mcp: enrichment?.lastReachabilityCheckMcp ?? '',
    last_reachability_check_a2a: enrichment?.lastReachabilityCheckA2a ?? '',
    reachability_attestor: enrichment?.reachabilityAttestor ?? '',
  };
}

/**
 * Create default payload with minimal required fields
 * Useful for agents without registration files
 *
 * @param agentId - Full agent ID (chainId:tokenId)
 * @param chainId - Chain ID
 * @param tokenId - Token ID
 * @param owner - Owner address
 * @returns Minimal AgentPayload
 */
export function buildMinimalPayload(
  agentId: string,
  chainId: number,
  tokenId: string,
  owner: string
): AgentPayload {
  return buildAgentPayload({
    agentId,
    chainId,
    tokenId,
    name: `Agent #${tokenId}`,
    description: '',
    active: false,
    hasRegistrationFile: false,
    owner,
    operators: [],
  });
}
