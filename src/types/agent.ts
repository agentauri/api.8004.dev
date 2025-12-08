/**
 * Agent-related type definitions
 * @module types/agent
 */

import type { OASFClassification } from './classification';

/**
 * Supported blockchain chain IDs
 */
export type SupportedChainId = 11155111 | 84532 | 80002;

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
  /** OASF classification data */
  oasf?: OASFClassification;
  /** Semantic search relevance score (0-1) */
  searchScore?: number;
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
  };
}

/**
 * Single agent detail API response
 */
export interface AgentDetailResponse {
  success: true;
  data: AgentDetail;
}
