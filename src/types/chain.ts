/**
 * Chain-related type definitions
 * @module types/chain
 */

/**
 * Statistics for a single chain
 */
export interface ChainStats {
  /** Blockchain chain ID */
  chainId: number;
  /** Chain display name */
  name: string;
  /** Total number of registered agents */
  agentCount: number;
  /** Number of active agents */
  activeCount: number;
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  /** Blockchain chain ID */
  chainId: number;
  /** Chain display name */
  name: string;
  /** Environment variable key for RPC URL */
  rpcEnvKey: 'SEPOLIA_RPC_URL' | 'BASE_SEPOLIA_RPC_URL' | 'POLYGON_AMOY_RPC_URL';
}

/**
 * Chain statistics API response
 */
export interface ChainStatsResponse {
  success: true;
  data: ChainStats[];
}
