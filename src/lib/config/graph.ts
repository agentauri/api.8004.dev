/**
 * The Graph Network configuration
 * Single source of truth for subgraph IDs and URLs
 * @module lib/config/graph
 */

// Import and re-export key manager
import {
  createGraphKeyManager as createKeyManager,
  GraphKeyManager as GraphKeyManagerClass,
  isGraphRetryableError as isRetryableError,
  type GraphKeyManagerConfig as KeyManagerConfig,
  type KeyRotationStrategy as RotationStrategy,
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
 * Updated February 2026 with all deployed v1.0 subgraphs.
 */
export const SUBGRAPH_IDS: Record<number, string> = {
  // Mainnets
  1: 'FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k', // Ethereum Mainnet
  137: '9q16PZv1JudvtnCAf44cBoxg82yK9SSsFvrjCY9xnneF', // Polygon Mainnet
  8453: '43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb', // Base Mainnet
  56: 'D6aWqowLkWqBgcqmpNKXuNikPkob24ADXCciiP8Hvn1K', // BSC Mainnet
  143: '4tvLxkczjhSaMiqRrCV1EyheYHyJ7Ad8jub1UUyukBjg', // Monad Mainnet
  // Testnets
  11155111: '6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT', // Ethereum Sepolia
  84532: '4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u', // Base Sepolia
  97: 'BTjind17gmRZ6YhT9peaCM13SvWuqztsmqyfjpntbg3Z', // BSC Chapel Testnet
  10143: '8iiMH9sj471jbp7AwUuuyBXvPJqCEsobuHBeUEKQSxhU', // Monad Testnet
};

/**
 * The Graph Gateway base URL
 */
export const GRAPH_GATEWAY_URL = 'https://gateway.thegraph.com/api';

/**
 * Per-chain Graph API keys from agent0-sdk
 * Each chain may have a different API key authorized for its subgraph.
 * These are public API keys provided by agent0lab for querying ERC-8004 subgraphs.
 */
export const CHAIN_GRAPH_API_KEYS: Record<number, string> = {
  // Mainnets - different keys per chain
  1: '7fd2e7d89ce3ef24cd0d4590298f0b2c', // Ethereum Mainnet
  137: '782d61ed390e625b8867995389699b4c', // Polygon Mainnet
  8453: '7fd2e7d89ce3ef24cd0d4590298f0b2c', // Base Mainnet (uses Ethereum key)
  56: '7fd2e7d89ce3ef24cd0d4590298f0b2c', // BSC Mainnet (uses Ethereum key)
  143: '7fd2e7d89ce3ef24cd0d4590298f0b2c', // Monad Mainnet (uses Ethereum key)
  // Testnets - use Sepolia key
  11155111: '00a452ad3cd1900273ea62c1bf283f93', // Ethereum Sepolia
  84532: '00a452ad3cd1900273ea62c1bf283f93', // Base Sepolia
  97: '00a452ad3cd1900273ea62c1bf283f93', // BSC Chapel Testnet
  10143: '00a452ad3cd1900273ea62c1bf283f93', // Monad Testnet
};

/**
 * Default Graph API key (Sepolia key, used as fallback)
 * @deprecated Use getChainGraphApiKey() for chain-specific keys
 */
export const DEFAULT_GRAPH_API_KEY = '00a452ad3cd1900273ea62c1bf283f93';

/**
 * Get the Graph API key for a specific chain
 * @param chainId - Chain ID
 * @param userOverride - Optional user-provided key that overrides SDK default
 * @returns API key for the chain
 */
export function getChainGraphApiKey(chainId: number, userOverride?: string): string {
  // User override takes precedence if provided
  if (userOverride) return userOverride;
  // Return chain-specific key or fall back to default
  return CHAIN_GRAPH_API_KEYS[chainId] ?? DEFAULT_GRAPH_API_KEY;
}

/**
 * Build subgraph URL for a specific chain
 * @param chainId - Chain ID
 * @param graphApiKey - Optional Graph API key override (uses chain-specific default if not provided)
 * @returns Subgraph URL or undefined if chain not supported
 */
export function buildSubgraphUrl(chainId: number, graphApiKey?: string): string | undefined {
  const subgraphId = SUBGRAPH_IDS[chainId];
  if (!subgraphId) return undefined;
  const apiKey = getChainGraphApiKey(chainId, graphApiKey);
  return `${GRAPH_GATEWAY_URL}/${apiKey}/subgraphs/id/${subgraphId}`;
}

/**
 * Build all subgraph URLs for all supported chains
 * Uses chain-specific API keys by default
 * @param graphApiKeyOverride - Optional single API key to use for all chains (overrides chain-specific keys)
 * @returns Map of chainId to subgraph URL
 */
export function buildSubgraphUrls(graphApiKeyOverride?: string): Record<number, string> {
  const urls: Record<number, string> = {};
  for (const chainIdStr of Object.keys(SUBGRAPH_IDS)) {
    const chainId = Number(chainIdStr);
    const url = buildSubgraphUrl(chainId, graphApiKeyOverride);
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
 * @deprecated Use executeWithChainKey() for chain-specific key handling
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

/**
 * Execute a function with chain-specific API key and optional user key fallback
 * Uses the SDK's chain-specific key first, then falls back to user key on retryable errors
 *
 * @param chainId - Chain ID to get the API key for
 * @param userKey - Optional user-provided API key for fallback
 * @param fn - Function that takes the subgraph URL and returns a promise
 * @returns Result of the function
 * @throws Last error if both keys fail
 */
export async function executeWithChainKey<T>(
  chainId: number,
  userKey: string | undefined,
  fn: (subgraphUrl: string) => Promise<T>
): Promise<T> {
  // Get chain-specific SDK key
  const sdkKey = CHAIN_GRAPH_API_KEYS[chainId] ?? DEFAULT_GRAPH_API_KEY;
  const primaryUrl = buildSubgraphUrl(chainId, sdkKey);

  if (!primaryUrl) {
    throw new Error(`No subgraph deployment for chain ${chainId}`);
  }

  try {
    return await fn(primaryUrl);
  } catch (primaryError) {
    // If no user key or error is not retryable, throw immediately
    if (!userKey || userKey === sdkKey || !isRetryableError(primaryError)) {
      throw primaryError;
    }

    // Log retry attempt
    console.info(
      `[GraphChainKey] SDK key for chain ${chainId} failed, retrying with user key: ${
        primaryError instanceof Error ? primaryError.message : 'Unknown error'
      }`
    );

    try {
      const fallbackUrl = buildSubgraphUrl(chainId, userKey);
      if (!fallbackUrl) {
        throw primaryError;
      }
      return await fn(fallbackUrl);
    } catch (fallbackError) {
      // Log fallback failure
      console.error(
        `[GraphChainKey] User key also failed for chain ${chainId}: ${
          fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        }`
      );
      // Throw the original error (more informative)
      throw primaryError;
    }
  }
}
