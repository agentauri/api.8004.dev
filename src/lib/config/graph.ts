/**
 * The Graph Network configuration
 * Single source of truth for subgraph IDs and URLs
 * @module lib/config/graph
 */

// Import and re-export key manager
import {
  GraphKeyManager as GraphKeyManagerClass,
  createGraphKeyManager as createKeyManager,
  isGraphRetryableError as isRetryableError,
  type KeyRotationStrategy as RotationStrategy,
  type GraphKeyManagerConfig as KeyManagerConfig,
} from './graph-key-manager';

export {
  GraphKeyManagerClass as GraphKeyManager,
  createKeyManager as createGraphKeyManager,
  isRetryableError as isGraphRetryableError,
  type RotationStrategy as KeyRotationStrategy,
  type KeyManagerConfig as GraphKeyManagerConfig,
};

/**
 * Subgraph IDs for each chain on The Graph Network
 * These are deployment IDs on the decentralized network
 *
 * Currently ETH Mainnet and ETH Sepolia have v1.0 contracts deployed.
 * Other chains will be added when their contracts are deployed.
 */
export const SUBGRAPH_IDS: Record<number, string> = {
  1: 'FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k', // Ethereum Mainnet (v1.0)
  11155111: '6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT', // Ethereum Sepolia (v1.0)
};

/**
 * The Graph Gateway base URL
 */
export const GRAPH_GATEWAY_URL = 'https://gateway.thegraph.com/api';

/**
 * Default Graph API key from agent0-sdk (public key for ERC-8004 subgraphs)
 * This is a public API key provided by agent0lab for querying ERC-8004 subgraphs.
 * Can be overridden by GRAPH_API_KEY environment variable.
 */
export const DEFAULT_GRAPH_API_KEY = '00a452ad3cd1900273ea62c1bf283f93';

/**
 * Build subgraph URL for a specific chain
 * @param chainId - Chain ID
 * @param graphApiKey - The Graph API key
 * @returns Subgraph URL or undefined if chain not supported
 */
export function buildSubgraphUrl(chainId: number, graphApiKey: string): string | undefined {
  const subgraphId = SUBGRAPH_IDS[chainId];
  if (!subgraphId) return undefined;
  return `${GRAPH_GATEWAY_URL}/${graphApiKey}/subgraphs/id/${subgraphId}`;
}

/**
 * Build all subgraph URLs for all supported chains
 * @param graphApiKey - The Graph API key
 * @returns Map of chainId to subgraph URL
 */
export function buildSubgraphUrls(graphApiKey: string): Record<number, string> {
  const urls: Record<number, string> = {};
  for (const chainIdStr of Object.keys(SUBGRAPH_IDS)) {
    const chainId = Number(chainIdStr);
    const url = buildSubgraphUrl(chainId, graphApiKey);
    if (url) urls[chainId] = url;
  }
  return urls;
}

/**
 * Get supported chain IDs that have subgraph deployments
 */
export function getSupportedGraphChainIds(): number[] {
  return Object.keys(SUBGRAPH_IDS).map(Number);
}

/**
 * Check if a chain has a subgraph deployment
 */
export function hasSubgraphDeployment(chainId: number): boolean {
  return chainId in SUBGRAPH_IDS;
}

/**
 * Create a GraphKeyManager for the given environment
 * Uses round-robin strategy by default
 * @param userKey - User-provided API key (env.GRAPH_API_KEY)
 * @param strategy - Key rotation strategy (default: 'round-robin')
 */
export function getGraphKeyManager(
  userKey?: string,
  strategy: RotationStrategy = 'round-robin'
): GraphKeyManagerClass {
  return createKeyManager({
    sdkKey: DEFAULT_GRAPH_API_KEY,
    userKey,
    strategy,
  });
}
