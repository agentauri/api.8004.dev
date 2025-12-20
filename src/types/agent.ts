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
 */
export type SupportedChainId = 11155111 | 84532 | 80002;

/**
 * Supported trust methods
 */
export type TrustMethod = 'x402' | 'eas';

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
  /** Agent wallet address */
  agentWallet?: string;
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
