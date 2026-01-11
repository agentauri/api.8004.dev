/**
 * The Graph Network configuration
 * Single source of truth for subgraph IDs and URLs
 * @module lib/config/graph
 */

/**
 * Subgraph IDs for each chain on The Graph Network
 * These are deployment IDs on the decentralized network
 */
export const SUBGRAPH_IDS: Record<number, string> = {
  11155111: '6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT', // Ethereum Sepolia
  84532: 'GjQEDgEKqoh5Yc8MUgxoQoRATEJdEiH7HbocfR1aFiHa', // Base Sepolia
  80002: '2A1JB18r1mF2VNP4QBH4mmxd74kbHoM6xLXC8ABAKf7j', // Polygon Amoy
  59141: '7GyxsUkWZ5aDNEqZQhFnMQk8CDxCDgT9WZKqFkNJ7YPx', // Linea Sepolia
  296: '5GwJ2UKQK3WQhJNqvCqV9EFKBYD6wPYJvFqEPmBKcFsP', // Hedera Testnet
  998: '3L8DKCwQwpLEYF7m3mE8PCvr8qJcJBvXTk3a9f9sLQrP', // HyperEVM Testnet
  1351057110: 'HvYWvsPKqWrSzV8VT4mjLGwPNMgVFgRiNMZFdJUg8BPf', // SKALE Base Sepolia
};

/**
 * The Graph Gateway base URL
 */
export const GRAPH_GATEWAY_URL = 'https://gateway.thegraph.com/api';

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
