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
| **ETH Sepolia** | 11155111 | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | **DEPLOYED** |
| Base Sepolia | 84532 | - | - | Pending |
| Polygon Amoy | 80002 | - | - | Pending |
| Linea Sepolia | 59141 | - | - | Pending |
| Hedera Testnet | 296 | - | - | Pending |
| HyperEVM Testnet | 998 | - | - | Pending |
| SKALE Base Sepolia | 1351057110 | - | - | Pending |

**Infrastructure Addresses (Deterministic across all chains):**
- CREATE2 Factory: `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`
- ValidationRegistry: `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`

### Subgraphs

| Chain | Chain ID | Version | Status | Notes |
|-------|----------|---------|--------|-------|
| **ETH Sepolia** | 11155111 | v1.0 | **ACTIVE** | Updated to v1.0 schema |
| Base Sepolia | 84532 | v0.4 | **ACTIVE** | Backward compatibility |
| Polygon Amoy | 80002 | v0.4 | **ACTIVE** | Backward compatibility |
| Linea Sepolia | 59141 | v0.4 | **ACTIVE** | Backward compatibility |
| Hedera Testnet | 296 | v0.4 | **ACTIVE** | Backward compatibility |
| HyperEVM Testnet | 998 | v0.4 | **ACTIVE** | Backward compatibility |
| SKALE Base Sepolia | 1351057110 | v0.4 | **ACTIVE** | Backward compatibility |

**Note**: v0.4 subgraphs are synced for backward compatibility with pre-v1.0 agents.

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
  uint8 score,
  string tag1,         // NEW: string
  string tag2,         // NEW: string
  string endpoint,     // NEW: endpoint reference
  string feedbackURI,  // RENAMED: feedbackURI
  bytes32 feedbackHash // RENAMED: feedbackHash
)
```

### Field Changes

| Change Type | Field | Details |
|-------------|-------|---------|
| **REMOVED** | `feedbackAuth` | No longer required for feedback submission |
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
  score: Int!                       # 0-100
  tag1: String                      # NEW: string (was bytes32)
  tag2: String                      # NEW: string (was bytes32)
  endpoint: String                  # NEW: endpoint reference (v1.0)
  feedbackIndex: Int!               # NEW: per-client index (v1.0)
  feedbackUri: String
  feedbackHash: Bytes!
  isRevoked: Boolean!
  createdAt: BigInt!
  responses: [FeedbackResponse]!
}
```

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

### SDK Issues (agent0-sdk v0.31.0)

**Known Bug**: SDK queries `agentWallet` on `AgentRegistrationFile` instead of `Agent`
- **Impact**: `searchAgents()` returns 0 agents
- **Workaround**: Use direct Graph queries (which we do in `graph-sync-worker.ts`)
- **Status**: Waiting for SDK fix - our backend is not affected (uses direct queries)

---

## Our Implementation Status

### Graph Sync Worker (`src/services/sync/graph-sync-worker.ts`)

| Chain | Status | Notes |
|-------|--------|-------|
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
| Jan 2026 | v1.0 spec update (breaking changes) |
| Oct 2025 | v0.4 initial testnet deployment |
