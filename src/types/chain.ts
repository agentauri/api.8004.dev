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
  /** Short chain name (e.g., "sepolia", "base-sepolia") */
  shortName: string;
  /** Block explorer URL */
  explorerUrl: string;
  /** Total number of registered agents (all agents, no filter) */
  totalCount: number;
  /** Number of agents with registration file (have metadata) */
  withRegistrationFileCount: number;
  /** Number of active agents (active: true AND has registration file) */
  activeCount: number;
  /** Status of the stats fetch - 'ok', 'error' if RPC/subgraph failed, or 'cached' for fallback data */
  status?: 'ok' | 'error' | 'cached';
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

/**
 * Platform-wide statistics
 */
export interface PlatformStats {
  /** Total number of registered agents across all chains (all agents, no filter) */
  totalAgents: number;
  /** Number of agents with registration file across all chains (have metadata) */
  withRegistrationFile: number;
  /** Number of active agents across all chains */
  activeAgents: number;
  /** Per-chain breakdown */
  chainBreakdown: ChainStats[];
}

/**
 * Platform stats API response
 */
export interface PlatformStatsResponse {
  success: true;
  data: PlatformStats;
}
