# CLAUDE.md - 8004 Backend Service

## Project Overview

This is the backend service for **8004.dev**, providing a unified REST API that aggregates data from multiple sources for the ERC-8004 agent explorer frontend.

### What This Service Does

1. **Vector Search**: Native Qdrant-based semantic search with 50+ filters
2. **Agent Data Aggregation**: Fetches agent data from The Graph subgraph via agent0-sdk
3. **OASF Classification**: Multi-provider AI classification (Gemini primary, Claude fallback)
4. **Reputation System**: Dual feedback from EAS attestations + on-chain data
5. **Trust Graph**: PageRank-based trust scoring between agents
6. **Intent Templates**: Pre-defined multi-agent workflow templates
7. **Team Composition**: AI-powered complementary agent discovery
8. **Real-time Events**: Server-Sent Events for live updates
9. **MCP Server**: Model Context Protocol for AI tool integration

---

## Project Rules

### Language

- **English only**: All code, comments, documentation, commit messages, variable names, and file names MUST be in English
- No exceptions for any text in the repository

### Test Coverage

- **70% branch coverage required**: CI pipeline enforces minimum 70% branch coverage
- Run `pnpm run test:coverage` to verify coverage before committing
- Coverage reports are generated in `coverage/` directory

### API Testing After Changes

- **Mandatory production verification**: After every code modification that affects API behavior, you MUST test the APIs in production
- Use `curl` with the API key to verify results:
  ```bash
  curl -s "https://api.8004.dev/api/v1/agents?limit=5" \
    -H "X-API-Key: $API_KEY" | jq
  ```
- Be aware of KV cache (5-minute TTL) - use different query parameters to bypass cached responses

### Open Source Ready

This project is designed to be open source (MIT License). All contributions must:
- Include JSDoc comments on public APIs
- Never commit secrets in code
- Use `.env.example` as environment template
- Update `CHANGELOG.md` for notable changes
- Follow `CONTRIBUTING.md` workflow

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Cloudflare Workers |
| Framework | Hono.js v4 |
| Vector Database | Qdrant Cloud |
| SQL Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Queue | Cloudflare Queues |
| Embeddings | Venice AI (text-embedding-bge-m3, 1024 dim) |
| LLM | Gemini API + Claude API (fallback) |

---

## Project Structure

```
api.8004.dev/
├── src/
│   ├── index.ts                    # Main entry, queue/scheduled handlers
│   ├── routes/                     # API route handlers (28 files)
│   │   ├── agents-qdrant.ts        # /api/v1/agents (Qdrant-based)
│   │   ├── analytics.ts            # /api/v1/analytics
│   │   ├── chains.ts               # /api/v1/chains
│   │   ├── classify.ts             # /api/v1/agents/:id/classify
│   │   ├── compose.ts              # /api/v1/compose (team building)
│   │   ├── events.ts               # /api/v1/events (SSE)
│   │   ├── feedbacks.ts            # /api/v1/feedbacks
│   │   ├── health.ts               # /api/v1/health
│   │   ├── intents.ts              # /api/v1/intents (workflows)
│   │   ├── keys.ts                 # /api/v1/keys (API key management)
│   │   ├── leaderboard.ts          # /api/v1/leaderboard
│   │   ├── openapi.ts              # /api/v1/openapi
│   │   ├── reputation.ts           # /api/v1/agents/:id/reputation
│   │   ├── scripts.ts              # Public scripts
│   │   ├── search-qdrant.ts        # /api/v1/search (vector search)
│   │   ├── stats.ts                # /api/v1/stats
│   │   ├── taxonomy.ts             # /api/v1/taxonomy
│   │   ├── verification.ts         # /api/v1/verification
│   │   └── validations.ts          # Request validation schemas
│   ├── services/                   # Business logic (30+ services)
│   │   ├── qdrant.ts               # Qdrant Cloud client
│   │   ├── qdrant-search.ts        # High-level search service
│   │   ├── embedding.ts            # Venice AI embeddings
│   │   ├── reranker.ts             # Search result reranking
│   │   ├── classifier.ts           # OASF classification
│   │   ├── sdk.ts                  # agent0-sdk integration
│   │   ├── reputation.ts           # Reputation aggregation
│   │   ├── trust-graph.ts          # PageRank trust scores
│   │   ├── reliability.ts          # Endpoint reliability tracking
│   │   ├── complementarity.ts      # Agent complementarity analysis
│   │   ├── intent.ts               # Intent template matching
│   │   ├── compose.ts              # Team composition
│   │   ├── a2a-client.ts           # Agent-to-Agent protocol
│   │   ├── eas-indexer.ts          # EAS attestation indexer
│   │   ├── ipfs.ts                 # IPFS gateway client
│   │   ├── cache.ts                # KV cache utilities
│   │   ├── sse.ts                  # Server-Sent Events
│   │   └── sync/                   # Data synchronization workers
│   │       ├── graph-sync-worker.ts
│   │       ├── d1-sync-worker.ts
│   │       ├── graph-feedback-worker.ts
│   │       └── reconciliation-worker.ts
│   ├── db/
│   │   ├── schema.ts               # D1 schema types
│   │   └── queries.ts              # Database queries
│   ├── lib/
│   │   ├── middleware/             # Hono middleware
│   │   ├── oasf/                   # OASF taxonomy (136 skills, 204 domains)
│   │   ├── qdrant/                 # Qdrant filter builders
│   │   ├── ai/                     # AI utilities
│   │   └── utils/                  # Errors, validation, rate-limit
│   ├── mcp/                        # Model Context Protocol
│   └── types/                      # TypeScript type definitions
├── migrations/                     # D1 database migrations (24 files)
├── test/                           # Unit & integration tests
└── scripts/                        # E2E tests, utilities
```

---

## Commands

```bash
# Install dependencies
pnpm install

# Development server
pnpm run dev

# Type checking
pnpm run typecheck

# Run tests
pnpm run test

# Run tests with coverage
pnpm run test:coverage

# Deploy to production
pnpm run deploy

# Database migrations (production)
npx wrangler d1 execute 8004-backend-db --remote --file=./migrations/XXXX.sql
```

---

## Environment Variables

### Required

```bash
# AI Providers
GOOGLE_AI_API_KEY          # Gemini API (primary classifier)
ANTHROPIC_API_KEY          # Claude API (fallback classifier)

# Vector Search
QDRANT_URL                 # Qdrant Cloud URL
QDRANT_API_KEY             # Qdrant API key
QDRANT_COLLECTION          # Collection name (default: agents)
VENICE_API_KEY             # Venice AI for embeddings

# Blockchain RPC
SEPOLIA_RPC_URL            # Ethereum Sepolia
BASE_SEPOLIA_RPC_URL       # Base Sepolia
POLYGON_AMOY_RPC_URL       # Polygon Amoy
LINEA_SEPOLIA_RPC_URL      # Linea Sepolia
HEDERA_TESTNET_RPC_URL     # Hedera Testnet
HYPEREVM_TESTNET_RPC_URL   # HyperEVM Testnet
SKALE_BASE_SEPOLIA_RPC_URL # SKALE Base Sepolia
```

### Optional

```bash
CLASSIFICATION_MODEL       # Default: gemini-2.0-flash
FALLBACK_MODEL             # Default: claude-3-haiku-20240307
CACHE_TTL                  # Default: 300 (seconds)
RATE_LIMIT_RPM             # Default: 300
GRAPH_API_KEY              # The Graph API key
```

---

## API Endpoints

### Agents & Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents` | List agents with 40+ native filters |
| GET | `/api/v1/agents/:id` | Get agent details |
| GET | `/api/v1/agents/:id/similar` | Find similar agents |
| GET | `/api/v1/agents/:id/complementary` | Find complementary agents |
| GET | `/api/v1/agents/:id/compatible` | Find I/O compatible agents |
| POST | `/api/v1/search` | Semantic vector search |

### Classification & Reputation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents/:id/classify` | Get OASF classification |
| POST | `/api/v1/agents/:id/classify` | Request classification |
| GET | `/api/v1/agents/:id/reputation` | Get reputation & feedback |

### Workflows & Composition

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/intents` | List workflow templates |
| GET | `/api/v1/intents/:id` | Get template details |
| POST | `/api/v1/intents/:id/match` | Match agents to workflow |
| POST | `/api/v1/compose` | Build agent teams |

### Data & Utilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/chains` | Chain statistics |
| GET | `/api/v1/stats` | Platform statistics |
| GET | `/api/v1/taxonomy` | OASF taxonomy tree |
| GET | `/api/v1/health` | Health checks |
| GET | `/api/v1/events` | SSE real-time updates |

### MCP & OpenAPI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mcp` | MCP protocol handler |
| GET | `/sse` | MCP SSE transport |
| GET | `/api/v1/openapi` | OpenAPI spec (JSON/YAML) |

---

## Database Schema (D1)

### Core Tables

```sql
-- OASF classifications
agent_classifications (agent_id, skills, domains, confidence, model_version)

-- Classification queue
classification_queue (agent_id, status, attempts, error)

-- Feedback & reputation
agent_feedback (agent_id, score, tags, submitter, eas_uid, tx_id, feedback_index, endpoint, feedback_hash)
agent_reputation (agent_id, average_score, feedback_count, distribution)

-- Sync state
eas_sync_state (chain_id, last_block, attestations_synced)
qdrant_sync_state (last_sync, agents_synced, agents_deleted)
graph_feedback_sync (chain_id, last_sync, last_block)
```

### Advanced Tables

```sql
-- Reliability tracking
agent_reliability (agent_id, mcp_latency_ms, mcp_success_count, a2a_latency_ms)

-- Trust graph (PageRank)
trust_edges (from_wallet, to_agent_id, weight)
agent_trust_scores (agent_id, trust_score, raw_pagerank, in_degree)
wallet_trust_scores (wallet_address, trust_score, feedback_count)
trust_graph_state (last_computation, total_iterations, status)

-- Intent templates
intent_templates (id, name, description, category, is_featured)
intent_template_steps (template_id, step_order, role, required_skills)
```

---

## Key Features

### 1. Vector Search (Qdrant)

- Native similarity search with Venice AI embeddings (1024 dim)
- 50+ native filters (chainIds, skills, domains, mcp, a2a, reputation, trustScore, erc8004Version, curation, declared OASF, endpoints, reachability, etc.)
- AND/OR filter modes
- Cursor-based pagination
- SDK fallback when Qdrant returns 0 results

### 2. OASF Classification

- 136 skills + 204 domains from OASF v0.8.0
- Multi-provider: Gemini primary, Claude fallback
- Async queue processing (50 agents/hour)
- Confidence scoring

### 3. Reputation System

- Dual sources: EAS attestations + on-chain feedback
- Normalized 0-100 scoring
- Distribution buckets (low/medium/high)
- Incremental updates

### 4. Trust Graph

- PageRank algorithm on wallet → agent edges
- Weighted by feedback scores
- Periodic recomputation
- Trust score in Qdrant payload

### 5. Intent Templates

- Pre-defined multi-agent workflows
- Step-by-step agent matching
- I/O compatibility validation
- 4 built-in templates (data-analysis, content-creation, code-review, customer-support)

### 6. Team Composition

- Complementarity analysis
- Skill coverage optimization
- Protocol compatibility (MCP + A2A)
- Trust model matching

---

## Caching Strategy

| Resource | TTL | Strategy |
|----------|-----|----------|
| Agent list | 5 min | Query hash |
| Agent detail | 5 min | Agent ID |
| Classification | 24 hours | Agent ID |
| Chain stats | 15 min | Static key |
| Taxonomy | 1 hour | Type-based |
| Search results | 5 min | Query hash |

---

## Rate Limiting

| Tier | Requests/min |
|------|--------------|
| Standard endpoints | 300 |
| Classification POST | 10 per agent |
| MCP/SSE | 60 |

---

## Scheduled Tasks

| Frequency | Task |
|-----------|------|
| Every 15 min | Graph → Qdrant sync, D1 → Qdrant sync |
| Every hour | EAS indexing, batch classification (50 agents), reconciliation |

---

## Supported Chains

| Chain | Chain ID | Network | Status |
|-------|----------|---------|--------|
| Ethereum Sepolia | 11155111 | Testnet | ✅ Active (v1.0) |
| Base Sepolia | 84532 | Testnet | ✅ Active (v1.0) |
| Polygon Amoy | 80002 | Testnet | ✅ Active (v1.0) |
| Linea Sepolia | 59141 | Testnet | ⏳ Pending v1.0 |
| Hedera Testnet | 296 | Testnet | ⏳ Pending v1.0 |
| HyperEVM Testnet | 998 | Testnet | ⏳ Pending v1.0 |
| SKALE Base Sepolia | 1351057110 | Testnet | ⏳ Pending v1.0 |

**Note**: Only active chains are supported for filtering in the API. Pending chains require v1.0 contract deployment and subgraph indexing.

---

## Code Style

- **TypeScript**: Strict mode, no `any` types
- **Validation**: Zod for all external inputs
- **Naming**: kebab-case files, PascalCase types, camelCase functions
- **Error Handling**: Standard error response format with request IDs

---

## Testing

```bash
pnpm run test              # All tests
pnpm run test:coverage     # With coverage report
pnpm run test:e2e          # E2E tests (~120 cases)
```

### E2E Test Suites

- health, basic, boolean, oasf, sorting
- search, fallback, pagination
- reputation, advanced, edge, error
- detail, taxonomy, security, consistency

---

## Related Documentation

- [ERC-8004 Reference Guide](./docs/ERC-8004-REFERENCE.md) - **IMPORTANT**: Current spec status, breaking changes, deployment addresses
- [Deployment Guide](./DEPLOY.md)
- [Semantic Search Standard](./docs/AG0_SEMANTIC_SEARCH_STANDARD.md)
- [MCP Integration](./docs/FRONTEND_MCP_INTEGRATION.md)
- [agent0-ts SDK](https://github.com/agent0lab/agent0-ts)
- [OASF Schema](https://docs.agntcy.org/oasf/)

---

## ERC-8004 Quick Reference

**Official Resources:**
- Spec: https://eips.ethereum.org/EIPS/eip-8004
- Spec Changes (v1.0): https://github.com/erc-8004/erc-8004-contracts/blob/master/SpecsJan26Update.md
- Contracts: https://github.com/erc-8004/erc-8004-contracts
- Subgraph: https://github.com/agent0lab/subgraph

**Deployed Contracts (ETH Sepolia only):**
- IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- ReputationRegistry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`

**v1.0 Breaking Changes:**
- `feedbackAuth` parameter REMOVED
- Tags: `bytes32` → `string`
- NEW fields: `feedbackIndex`, `endpoint`
- `agentWallet` moved to `Agent` entity (not `AgentRegistrationFile`)

See [ERC-8004 Reference Guide](./docs/ERC-8004-REFERENCE.md) for full details.
