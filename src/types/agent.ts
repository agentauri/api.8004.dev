/**
 * Agent-related type definitions
 * @module types/agent
 */

import type { OASFClassification } from './classification';
import type { MetadataAttribute, OASFEndpoint, OASFSource, SocialLinks } from './ipfs';
import type { AgentReputation } from './reputation';
import type { SearchMode } from './search';

/**
 * Supported blockchain chain IDs
 * - 1: Ethereum Mainnet
 * - 11155111: Ethereum Sepolia
 * - 84532: Base Sepolia
 * - 80002: Polygon Amoy
 * - 59141: Linea Sepolia
 * - 296: Hedera Testnet
 * - 998: HyperEVM Testnet
 * - 1351057110: SKALE Base Sepolia
 */
export type SupportedChainId = 1 | 11155111 | 84532 | 80002 | 59141 | 296 | 998 | 1351057110;

/**
 * Supported trust methods
 */
export type TrustMethod = 'x402' | 'eas';

/**
 * OASF 0.8 capability definition
 * Capabilities define what the agent can do (e.g., communication, payment)
 */
export interface AgentCapability {
  /** Capability name (e.g., 'communication', 'payment', 'storage') */
  name: string;
  /** Optional version of the capability */
  version?: string;
}

/**
 * Agent summary for list views
 */
export interface AgentSummary {
  /** Agent ID in format chainId:tokenId */
  id: string;
  /** Blockchain chain ID */
  chainId: number;
  /** Token ID on the chain */
  tokenId: string;
  /** Agent display name */
  name: string;
  /** Agent description */
  description: string;
  /** Agent image URL */
  image?: string;
  /** Whether the agent is currently active */
  active: boolean;
  /** Whether the agent has MCP endpoint */
  hasMcp: boolean;
  /** Whether the agent has A2A endpoint */
  hasA2a: boolean;
  /** Whether the agent supports x402 payments */
  x402Support: boolean;
  /** Supported trust/payment methods */
  supportedTrust: TrustMethod[];
  /** OASF classification data */
  oasf?: OASFClassification;
  /** Source of OASF classification */
  oasfSource?: OASFSource;
  /** Semantic search relevance score (0-1) */
  searchScore?: number;
  /** Average reputation score (0-100) */
  reputationScore?: number;
  /** Total feedback count */
  reputationCount?: number;
  /** Owner wallet address (single address) */
  owner?: string;
  /** Operator addresses (can manage the agent) */
  operators?: string[];
  /** ENS name */
  ens?: string;
  /** DID identifier */
  did?: string;
  /** Agent's own wallet address */
  walletAddress?: string;
  /** Reasons why this agent matched the search query (search results only) */
  matchReasons?: string[];
  /** Supported input modes (derived from MCP prompts) */
  inputModes?: string[];
  /** Supported output modes (derived from MCP resources) */
  outputModes?: string[];
  /** MCP protocol version */
  mcpVersion?: string;
  /** A2A protocol version */
  a2aVersion?: string;
  // NOTE: agentWalletChainId removed in ERC-8004 v1.0
  /** Supported trust models (from subgraph) */
  supportedTrusts?: string[];
  /** ERC-8004 spec version ('v0.4' for pre-v1.0, 'v1.0' for current) */
  erc8004Version?: string;
  /** OASF skills declared by agent creator in registration file */
  declaredOasfSkills?: string[];
  /** OASF domains declared by agent creator in registration file */
  declaredOasfDomains?: string[];
  /** Agent creation timestamp (ISO string) */
  createdAt?: string;
  /** Agent last update timestamp (ISO string) */
  updatedAt?: string;
  /** Trust score (0-100) from PageRank */
  trustScore?: number;
  /** Curator wallet addresses (agents with 90+ STAR ratings) */
  curatedBy?: string[];
  /** Whether agent has been curated */
  isCurated?: boolean;
}

/**
 * MCP tool with detailed information
 */
export interface McpToolDetail {
  /** Tool name (identifier) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP prompt argument
 */
export interface McpPromptArgument {
  /** Argument name */
  name: string;
  /** Argument description */
  description?: string;
  /** Whether this argument is required */
  required?: boolean;
}

/**
 * MCP prompt with detailed information
 */
export interface McpPromptDetail {
  /** Prompt name (identifier) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Prompt arguments */
  arguments?: McpPromptArgument[];
}

/**
 * MCP resource with detailed information
 */
export interface McpResourceDetail {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** MIME type of the resource content */
  mimeType?: string;
}

/**
 * MCP capabilities fetched from MCP endpoint
 */
export interface McpCapabilitiesDetail {
  /** Available tools with descriptions */
  tools: McpToolDetail[];
  /** Available prompts with descriptions */
  prompts: McpPromptDetail[];
  /** Available resources with descriptions */
  resources: McpResourceDetail[];
  /** When capabilities were last fetched */
  fetchedAt?: string;
  /** Error message if fetch failed */
  error?: string;
}

/**
 * MCP endpoint configuration
 */
export interface McpEndpoint {
  /** MCP server URL */
  url: string;
  /** MCP protocol version */
  version: string;
}

/**
 * A2A endpoint configuration
 */
export interface A2aEndpoint {
  /** A2A server URL */
  url: string;
  /** A2A protocol version */
  version: string;
}

/**
 * Agent endpoint configurations
 */
export interface AgentEndpoints {
  /** MCP endpoint */
  mcp?: McpEndpoint;
  /** A2A endpoint */
  a2a?: A2aEndpoint;
  /** ENS name */
  ens?: string;
  /** DID identifier */
  did?: string;
  /** Agent wallet address (v1.0: now on-chain verified) */
  agentWallet?: string;
  // NOTE: agentWalletChainId removed in ERC-8004 v1.0
  /** OASF endpoint with creator-defined skills/domains */
  oasf?: OASFEndpoint;
}

/**
 * Agent on-chain registration details
 */
export interface AgentRegistration {
  /** Blockchain chain ID */
  chainId: number;
  /** Token ID on the chain */
  tokenId: string;
  /** ERC-8004 contract address */
  contractAddress: string;
  /** IPFS/HTTP metadata URI */
  metadataUri: string;
  /** Owner wallet address */
  owner: string;
  /** Registration timestamp */
  registeredAt: string;
}

/**
 * IPFS metadata included in agent detail response
 */
export interface AgentIPFSMetadata {
  /** Social media links */
  socialLinks?: SocialLinks;
  /** External URL (website, documentation) */
  externalUrl?: string;
  /** NFT-style attributes */
  attributes?: MetadataAttribute[];
}

/**
 * Warning severity levels
 */
export type WarningSeverity = 'low' | 'medium' | 'high';

/**
 * Warning type categories
 */
export type WarningType = 'metadata' | 'endpoint' | 'reputation';

/**
 * Agent warning for quality/health indicators
 */
export interface AgentWarning {
  /** Warning type category */
  type: WarningType;
  /** Warning message */
  message: string;
  /** Severity level */
  severity: WarningSeverity;
}

/**
 * Agent health check result
 */
export interface AgentHealthCheck {
  /** Check category */
  category: 'metadata' | 'endpoints' | 'reputation';
  /** Pass/warning/fail status */
  status: 'pass' | 'warning' | 'fail';
  /** Score for this check (0-100) */
  score: number;
  /** Description of the check result */
  message: string;
}

/**
 * Aggregated agent health score
 */
export interface AgentHealthScore {
  /** Overall health score (0-100) */
  overallScore: number;
  /** Individual check results */
  checks: AgentHealthCheck[];
}

/**
 * Full agent details including endpoints and registration
 */
export interface AgentDetail extends AgentSummary {
  /** Agent endpoint configurations */
  endpoints: AgentEndpoints;
  /** On-chain registration details */
  registration: AgentRegistration;
  /** List of MCP tool names */
  mcpTools: string[];
  /** List of A2A skill names */
  a2aSkills: string[];
  /** List of MCP prompt names */
  mcpPrompts?: string[];
  /** List of MCP resource names */
  mcpResources?: string[];
  /** Detailed MCP capabilities (tools, prompts, resources with descriptions) */
  mcpCapabilities?: McpCapabilitiesDetail;
  /** Full reputation data */
  reputation?: AgentReputation;
  /** Metadata fetched from IPFS */
  ipfsMetadata?: AgentIPFSMetadata;
  /** ISO timestamp when agent was last updated on-chain */
  lastUpdatedAt?: string;
  /** Quality/health warnings for this agent */
  warnings?: AgentWarning[];
  /** Aggregated health score and checks */
  healthScore?: AgentHealthScore;
  /** OASF 0.8 capabilities (array format) */
  capabilities?: AgentCapability[];
  /** ERC-8004 registry contract address (CAIP-10 format) */
  agentRegistry?: string;
}

/**
 * Chain stats breakdown for agent list results
 */
export interface AgentListChainStats {
  chainId: number;
  name: string;
  totalCount: number;
  withRegistrationFileCount: number;
  activeCount: number;
}

/**
 * Platform-wide stats included in agent list results
 */
export interface AgentListStats {
  /** Total agents across all chains */
  total: number;
  /** Agents with registration file across all chains */
  withRegistrationFile: number;
  /** Active agents across all chains */
  active: number;
  /** Breakdown by chain */
  byChain: AgentListChainStats[];
}

/**
 * Agent list API response
 */
export interface AgentListResponse {
  success: true;
  data: AgentSummary[];
  meta: {
    total: number;
    hasMore: boolean;
    nextCursor?: string;
    /** Platform-wide agent statistics */
    stats?: AgentListStats;
    /** Search mode used when q= parameter is provided */
    searchMode?: SearchMode;
  };
}

/**
 * Single agent detail API response
 */
export interface AgentDetailResponse {
  success: true;
  data: AgentDetail;
}
