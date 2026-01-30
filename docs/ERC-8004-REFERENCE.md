# ERC-8004 Reference Guide

This document tracks the current state of the ERC-8004 ecosystem. Keep this updated as the spec evolves.

**Last Updated**: January 2026

---

## Official Resources

| Resource | URL |
|----------|-----|
| **EIP Specification** | https://eips.ethereum.org/EIPS/eip-8004 |
| **Spec Changes Guide (v1.0)** | https://github.com/erc-8004/erc-8004-contracts/blob/master/SpecsJan26Update.md |
| **Contracts Repo** | https://github.com/erc-8004/erc-8004-contracts |
| **ABIs** | https://github.com/erc-8004/erc-8004-contracts/tree/master/abis |
| **Subgraph Repo** | https://github.com/agent0lab/subgraph |
| **SDK (agent0-ts)** | https://github.com/agent0lab/agent0-ts |
| **SDK (agent0-py)** | https://github.com/agent0lab/agent0-py |
| **Python SDK v1.0.0 Notes** | https://github.com/agent0lab/agent0-py/blob/main/RELEASE_NOTES_1.0.0.md |

---

## Current Deployment Status (January 2026)

### Contracts v1.0

| Chain | Chain ID | IdentityRegistry | ReputationRegistry | Status |
|-------|----------|------------------|-------------------|--------|
| **ETH Mainnet** | 1 | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | **DEPLOYED** (Genesis Month) |
| **ETH Sepolia** | 11155111 | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | **DEPLOYED** |
| Base Sepolia | 84532 | - | - | Pending |
| Polygon Amoy | 80002 | - | - | Pending |
| Linea Sepolia | 59141 | - | - | Pending |
| Hedera Testnet | 296 | - | - | Pending |
| HyperEVM Testnet | 998 | - | - | Pending |
| SKALE Base Sepolia | 1351057110 | - | - | Pending |

**Ethereum Mainnet Details:**
- Start Block: `24339924`
- Subgraph ID: `FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k`

**Infrastructure Addresses (Deterministic across all chains):**
- CREATE2 Factory: `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`
- ValidationRegistry: `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`

### Subgraphs

| Chain | Chain ID | Subgraph ID | Status | Notes |
|-------|----------|-------------|--------|-------|
| **ETH Mainnet** | 1 | `FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k` | **ACTIVE** | Genesis Month deployment |
| **ETH Sepolia** | 11155111 | `6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT` | **ACTIVE** | Testnet |
| Base Sepolia | 84532 | - | **REMOVED** | Awaiting v1.0 contract deployment |
| Polygon Amoy | 80002 | - | **REMOVED** | Awaiting v1.0 contract deployment |
| Linea Sepolia | 59141 | - | **REMOVED** | Awaiting v1.0 contract deployment |
| Hedera Testnet | 296 | - | **REMOVED** | Awaiting v1.0 contract deployment |
| HyperEVM Testnet | 998 | - | **REMOVED** | Awaiting v1.0 contract deployment |
| SKALE Base Sepolia | 1351057110 | - | **REMOVED** | Awaiting v1.0 contract deployment |

**Note**: v0.4 subgraphs have been deprecated and removed. ETH Mainnet and ETH Sepolia v1.0 are currently active.
Other chains will be re-enabled when v1.0 contracts are deployed.

**Contact**: @lentan to add more chains

---

## ERC-8004 v1.0 Breaking Changes (Jan 2026)

### Summary

The v1.0 update is a **significant simplification**:
- Removed on-chain pre-authorization requirement
- Shifted security model to off-chain filtering
- Added endpoint tracking for feedback attribution
- Formalized agent identity with URI and registry definitions

### Function Signature Changes

#### `giveFeedback()` - MAJOR UPDATE

**Before (v0.4):**
```solidity
giveFeedback(
  uint256 agentId,
  uint8 score,
  bytes32 tag1,        // OLD: bytes32
  bytes32 tag2,        // OLD: bytes32
  string fileuri,      // OLD: fileuri
  bytes32 filehash,    // OLD: filehash
  bytes feedbackAuth   // REMOVED
)
```

**After (v1.0):**
```solidity
giveFeedback(
  uint256 agentId,
  int128 value,        // MAINNET: Replaces uint8 score (signed 128-bit for precision)
  uint8 valueDecimals, // MAINNET: Decimal places for value interpretation
  string tag1,         // string (was bytes32)
  string tag2,         // string (was bytes32)
  string endpoint,     // endpoint reference
  string feedbackURI,  // RENAMED: feedbackURI
  bytes32 feedbackHash // RENAMED: feedbackHash
)
```

### Field Changes

| Change Type | Field | Details |
|-------------|-------|---------|
| **REMOVED** | `feedbackAuth` | No longer required for feedback submission |
| **REPLACED** | `score` → `value` + `valueDecimals` | `uint8 score (0-100)` → `int128 value + uint8 valueDecimals` for precision |
| **ADDED** | `endpoint` | Optional endpoint reference in feedback |
| **ADDED** | `feedbackIndex` | Per-client feedback index (event-only) |
| **TYPE CHANGE** | `tag1`, `tag2` | `bytes32` → `string` |
| **RENAMED** | `fileuri` → `feedbackURI` | URI reference |
| **RENAMED** | `filehash` → `feedbackHash` | Hash reference |
| **MOVED** | `agentWallet` | From off-chain to on-chain (via `setAgentWallet()` with EIP-712 signature) |

### Agent Wallet Verification

- `agentWallet` is now set on-chain via `setAgentWallet()` with EIP-712/ERC-1271 signature
- Resets to zero address on agent transfer
- Read from `Agent` entity, NOT `AgentRegistrationFile`

---

## Subgraph Schema (v1.0)

### Core Entities

#### Agent
```graphql
type Agent @entity {
  id: ID!                           # Format: "chainId:agentId"
  chainId: BigInt!
  agentId: BigInt!
  agentURI: String
  agentWallet: Bytes                # NEW: On-chain wallet (v1.0)
  owner: Bytes!
  operators: [Bytes]!
  createdAt: BigInt!
  updatedAt: BigInt!
  registrationFile: AgentRegistrationFile
  feedback: [Feedback]!
  validations: [Validation]!
}
```

#### Feedback
```graphql
type Feedback @entity {
  id: ID!                           # Format: "chainId:agentId:clientAddress:index"
  agent: Agent!
  clientAddress: Bytes!
  value: BigDecimal!                # MAINNET: Replaces score (computed from int128 value + uint8 valueDecimals)
  tag1: String                      # string (was bytes32 in v0.4)
  tag2: String                      # string (was bytes32 in v0.4)
  endpoint: String                  # endpoint reference (v1.0)
  feedbackIndex: Int!               # per-client index (v1.0)
  feedbackUri: String
  feedbackHash: Bytes!
  isRevoked: Boolean!
  createdAt: BigInt!
  responses: [FeedbackResponse]!
}
```

> **Note (Mainnet Readiness)**: The `score` field has been replaced by `value` (BigDecimal).
> The subgraph computes `value` from the raw contract values (int128 value + uint8 valueDecimals).
> For backward compatibility, values typically remain in the 0-100 range.

#### AgentRegistrationFile (Off-chain from IPFS)
```graphql
type AgentRegistrationFile @entity {
  id: ID!
  name: String
  description: String
  image: String
  active: Boolean
  x402support: Boolean
  mcpEndpoint: String
  mcpVersion: String
  a2aEndpoint: String
  a2aVersion: String
  ens: String
  did: String
  # NOTE: agentWallet is now on Agent entity, not here
}
```

---

## Migration Checklist

### Backend Changes Required

- [x] Database: Add `feedback_index` and `endpoint` columns (migrations 0019-0020)
- [x] Graph sync: Query `agentWallet` from `Agent` entity (graph-sync-worker.ts)
- [x] API responses: Include new fields (`feedbackIndex`, `endpoint`) (feedbacks.ts)
- [x] Validation: Handle string tags instead of bytes32 (graph-feedback-worker.ts)
- [x] SDK service: Update interfaces for v1.0 schema (sdk.ts)
- [x] Type definitions: Remove legacy `agentWalletChainId` (types/agent.ts)
- [x] **Mainnet Readiness**: Query `value` (BigDecimal) instead of `score` from subgraph (graph-feedback-worker.ts)

### SDK Status (agent0-sdk v1.4.2)

The `agentWallet` query bug from v0.31.0 has been resolved. The backend now uses agent0-sdk v1.4.2 which includes:
- Mainnet registry defaults and subgraph configuration
- Multi-chain support with correct `agentWallet` queries
- Renamed `averageScore` → `averageValue`, `minAverageScore` → `minAverageValue`
- `x402Support` casing fix in search result metadata

---

## Our Implementation Status

### Graph Sync Worker (`src/services/sync/graph-sync-worker.ts`)

| Chain | Status | Notes |
|-------|--------|-------|
| ETH Mainnet (1) | **ACTIVE** | Using v1.0 query (Genesis Month) |
| ETH Sepolia (11155111) | **ACTIVE** | Using updated v1.0 query |
| Other chains | Disabled | Waiting for contract/subgraph deployment |

### Database Schema

| Field | Table | Status |
|-------|-------|--------|
| `feedback_index` | `agent_feedback` | ✅ Complete (migration 0019) |
| `endpoint` | `agent_feedback` | ✅ Complete (migration 0019) |
| `feedback_hash` | `agent_feedback` | ✅ Complete (migration 0020) |

---

## Contacts

- **Multi-chain deployment**: Contact @lentan
- **SDK issues**: https://github.com/agent0lab/agent0-ts/issues

---

## Version History

| Date | Change |
|------|--------|
| Jan 30 2026 | Mainnet sync enabled, subgraph ID updated, agent0-sdk v1.4.2 |
| Jan 2026 | v1.0 spec update (breaking changes) |
| Oct 2025 | v0.4 initial testnet deployment |
