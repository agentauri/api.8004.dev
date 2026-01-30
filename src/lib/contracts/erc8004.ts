/**
 * ERC-8004 Contract Addresses
 *
 * Official contract addresses for the ERC-8004 Agent Registry protocol.
 * Updated for ERC-8004 v1.0 (January 2026).
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

/**
 * Contract addresses per chain
 */
export interface ERC8004ChainContracts {
  /** IdentityRegistry contract address (ERC-721 agent NFTs) */
  identityRegistry: `0x${string}`;
  /** ReputationRegistry contract address (feedback/reputation) */
  reputationRegistry: `0x${string}`;
}

/**
 * ERC-8004 contract addresses by chain ID
 *
 * Note: ETH Mainnet and ETH Sepolia are currently deployed (January 2026).
 * Other testnets pending deployment - contact @lentan for updates.
 */
export const ERC8004_CONTRACTS: Record<number, ERC8004ChainContracts> = {
  // Ethereum Mainnet - DEPLOYED (Genesis Month)
  1: {
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  },
  // Ethereum Sepolia (Testnet) - DEPLOYED
  11155111: {
    identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
  },
  // Base Sepolia - Pending deployment
  // 84532: { ... }
  // Polygon Amoy - Pending deployment
  // 80002: { ... }
  // Linea Sepolia - Pending deployment
  // 59141: { ... }
  // Hedera Testnet - Pending deployment
  // 296: { ... }
  // HyperEVM Testnet - Pending deployment
  // 998: { ... }
  // SKALE Base Sepolia - Pending deployment
  // 1351057110: { ... }
};

/**
 * Get contract addresses for a specific chain
 * @param chainId - The chain ID to get contracts for
 * @returns Contract addresses or undefined if chain not supported
 */
export function getERC8004Contracts(chainId: number): ERC8004ChainContracts | undefined {
  return ERC8004_CONTRACTS[chainId];
}

/**
 * Get the IdentityRegistry address for a chain
 * @param chainId - The chain ID
 * @returns Contract address or undefined
 */
export function getIdentityRegistry(chainId: number): `0x${string}` | undefined {
  return ERC8004_CONTRACTS[chainId]?.identityRegistry;
}

/**
 * Get the ReputationRegistry address for a chain
 * @param chainId - The chain ID
 * @returns Contract address or undefined
 */
export function getReputationRegistry(chainId: number): `0x${string}` | undefined {
  return ERC8004_CONTRACTS[chainId]?.reputationRegistry;
}

/**
 * Check if a chain has ERC-8004 contracts deployed
 * @param chainId - The chain ID to check
 * @returns true if contracts are deployed
 */
export function isERC8004Supported(chainId: number): boolean {
  return chainId in ERC8004_CONTRACTS;
}

/**
 * Get all supported chain IDs with ERC-8004 contracts
 * @returns Array of chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(ERC8004_CONTRACTS).map(Number);
}

/**
 * Format contract address in CAIP-10 format
 * @param chainId - The chain ID
 * @param address - The contract address
 * @returns CAIP-10 formatted string (e.g., "eip155:11155111:0x8004...")
 */
export function toCAIP10(chainId: number, address: string): string {
  return `eip155:${chainId}:${address}`;
}

/**
 * Get IdentityRegistry in CAIP-10 format
 * @param chainId - The chain ID
 * @returns CAIP-10 formatted address or undefined
 */
export function getIdentityRegistryCAIP10(chainId: number): string | undefined {
  const address = getIdentityRegistry(chainId);
  return address ? toCAIP10(chainId, address) : undefined;
}
