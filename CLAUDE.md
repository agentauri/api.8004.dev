# CLAUDE.md - 8004 Backend Service

## Project Overview

This is the backend service for **8004.dev**, providing a unified REST API that aggregates data from multiple sources for the ERC-8004 agent explorer frontend.

### What This Service Does

1. **Agent Data Aggregation**: Fetches agent data from The Graph subgraph via agent0-sdk
2. **Semantic Search**: Proxies to agent0lab/search-service for natural language queries
3. **OASF Classification**: Uses multi-provider AI (Gemini primary, Claude fallback) to classify agents according to OASF taxonomy (skills/domains)
4. **Caching**: Provides efficient caching layer for all data sources

## Project Rules

### Language

- **English only**: All code, comments, documentation, commit messages, variable names, and file names MUST be in English
- No exceptions for any text in the repository

### Test Coverage

- **70% branch coverage required**: CI pipeline enforces minimum 70% branch coverage
- Run `pnpm run test:coverage` to verify coverage before committing
- Coverage reports are generated in `coverage/` directory
- CI pipeline will fail if branch coverage drops below 70%

### API Testing After Changes

- **Mandatory production verification**: After every code modification that affects API behavior, you MUST test the APIs in production
- Use `curl` with the API key to verify results:
  ```bash
  curl -s "https://api.8004.dev/api/v1/agents?limit=5" \
    -H "X-API-Key: $API_KEY" | jq
  ```
- A fix is **NOT** considered complete without manual API verification
- Be aware of KV cache (5-minute TTL) - use different query parameters to bypass cached responses when testing fresh changes
- Document the verification results before marking a task as done

### Local Validation Before Implementation

For any new feature or change request:

1. **SDK-related changes**: Before implementing changes that involve agent0-sdk:
   - Write a local test script in `test-sdk-scripts/` to verify SDK behavior
   - Test the SDK call locally to ensure correct usage and expected results
   - Only proceed with implementation after local validation passes

2. **Vector search changes**: Before implementing changes that involve semantic search:
   - Test the search-service call locally using curl or a test script
   - Verify query parameters, response format, and pagination behavior
   - Only proceed with implementation after local validation passes

This ensures we understand the external service behavior before writing integration code.

### Open Source Ready

This project is designed to be open source. All contributions must follow these guidelines:

1. **License**: MIT License - include license header in all source files
2. **Documentation**: All public APIs must have JSDoc comments
3. **No secrets in code**: Never commit API keys, passwords, or sensitive data
4. **Environment variables**: Use `.env.example` as template (never commit `.env`)
5. **Changelog**: Update `CHANGELOG.md` for all notable changes (follows [Keep a Changelog](https://keepachangelog.com/))
6. **Semantic versioning**: Follow [SemVer](https://semver.org/) for releases
7. **Contributing guide**: Follow `CONTRIBUTING.md` for contribution workflow
8. **Code of Conduct**: Adhere to `CODE_OF_CONDUCT.md`
9. **Issue templates**: Use provided GitHub issue templates
10. **PR templates**: Use provided GitHub PR template

### Required Files for Open Source

```
├── LICENSE                    # MIT License
├── README.md                  # Project overview, setup, usage
├── CHANGELOG.md               # Version history
├── CONTRIBUTING.md            # How to contribute
├── CODE_OF_CONDUCT.md         # Community standards
├── SECURITY.md                # Security policy
├── .env.example               # Environment template
└── .github/
    ├── ISSUE_TEMPLATE/
    │   ├── bug_report.md
    │   └── feature_request.md
    ├── PULL_REQUEST_TEMPLATE.md
    └── workflows/
        ├── ci.yml             # Test + lint + coverage
        └── release.yml        # Automated releases
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Cloudflare Workers |
| Framework | Hono.js |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Queue | Cloudflare Queues |
| LLM | Gemini API (Google) + Claude API (Anthropic) |

## Project Structure

```
api.8004.dev/
├── src/
│   ├── index.ts              # Main entry point, Hono app
│   ├── routes/
│   │   ├── agents.ts         # /api/v1/agents endpoints
│   │   ├── chains.ts         # /api/v1/chains endpoint
│   │   ├── classify.ts       # /api/v1/agents/:id/classify
│   │   ├── health.ts         # /api/v1/health endpoint
│   │   ├── openapi.ts        # /api/v1/openapi spec endpoints
│   │   ├── reputation.ts     # /api/v1/reputation endpoints
│   │   ├── search.ts         # /api/v1/search endpoint
│   │   ├── stats.ts          # /api/v1/stats endpoint
│   │   └── taxonomy.ts       # /api/v1/taxonomy endpoint
│   ├── services/
│   │   ├── cache.ts          # KV cache utilities
│   │   ├── classifier.ts     # OASF classification (Gemini + Claude)
│   │   ├── eas-indexer.ts    # EAS attestation indexer
│   │   ├── ipfs.ts           # IPFS gateway client
│   │   ├── oasf-resolver.ts  # OASF taxonomy resolver
│   │   ├── reputation.ts     # Agent reputation aggregation
│   │   ├── sdk.ts            # agent0-sdk integration
│   │   ├── search.ts         # search-service client
│   │   └── mock/             # Mock services for testing
│   │       ├── mock-sdk.ts
│   │       └── mock-search.ts
│   ├── db/
│   │   ├── schema.ts         # D1 schema types
│   │   └── queries.ts        # Database queries
│   ├── lib/
│   │   ├── middleware/       # Hono middleware
│   │   │   ├── api-key.ts    # API key authentication
│   │   │   ├── body-limit.ts # Request body size limits
│   │   │   ├── cors.ts       # CORS configuration
│   │   │   ├── request-id.ts # Request ID generation
│   │   │   └── security-headers.ts
│   │   ├── oasf/
│   │   │   ├── taxonomy.ts   # OASF taxonomy data
│   │   │   └── prompt.ts     # Classification prompt template
│   │   └── utils/
│   │       ├── errors.ts     # Error handling
│   │       ├── fetch.ts      # HTTP fetch utilities
│   │       ├── rate-limit.ts # Rate limiting
│   │       └── validation.ts # Request validation (Zod)
│   └── types/
│       ├── agent.ts          # Agent types
│       ├── chain.ts          # Chain types
│       ├── classification.ts # OASF classification types
│       ├── common.ts         # Common types
│       ├── env.ts            # Environment bindings
│       ├── ipfs.ts           # IPFS types
│       ├── reputation.ts     # Reputation types
│       ├── search.ts         # Search types
│       └── taxonomy.ts       # Taxonomy types
├── migrations/
│   ├── 0001_init.sql         # D1 schema (classifications)
│   ├── 0002_reputation.sql   # Reputation system tables
│   ├── 0003_performance_indexes.sql  # Performance indexes
│   └── 0004_oasf_taxonomy_reset.sql  # OASF taxonomy updates
├── wrangler.toml             # Cloudflare Workers config
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Commands

```bash
# Install dependencies
pnpm install

# Development server (local)
pnpm run dev
# or: wrangler dev

# Type checking
pnpm run typecheck

# Run tests
pnpm run test

# Run tests with coverage (70% branches minimum)
pnpm run test:coverage

# Deploy to production
pnpm run deploy
# or: wrangler deploy

# Database migrations
wrangler d1 execute 8004-backend-db --file=./migrations/0001_init.sql

# View D1 database
wrangler d1 execute 8004-backend-db --command="SELECT * FROM agent_classifications LIMIT 10"
```

## Environment Variables

Required secrets (set via `wrangler secret put`):

```bash
GOOGLE_AI_API_KEY          # Gemini API key for OASF classification (primary)
ANTHROPIC_API_KEY          # Claude API key for OASF classification (fallback)
SEARCH_SERVICE_URL         # URL to agent0lab/search-service
SEPOLIA_RPC_URL            # Ethereum Sepolia RPC
BASE_SEPOLIA_RPC_URL       # Base Sepolia RPC
POLYGON_AMOY_RPC_URL       # Polygon Amoy RPC
```

Optional:

```bash
CLASSIFICATION_MODEL       # Default: gemini-2.0-flash (primary classifier)
FALLBACK_MODEL             # Default: claude-3-haiku-20240307 (fallback classifier)
CACHE_TTL                  # Default: 300 (seconds)
RATE_LIMIT_RPM             # Default: 100
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/agents` | List agents with filters |
| GET | `/api/v1/agents/:agentId` | Get agent details |
| GET | `/api/v1/agents/:agentId/classify` | Get OASF classification |
| POST | `/api/v1/agents/:agentId/classify` | Request classification |
| POST | `/api/v1/search` | Semantic search |
| GET | `/api/v1/chains` | Chain statistics |
| GET | `/api/v1/stats` | Platform statistics |
| GET | `/api/v1/taxonomy` | OASF taxonomy tree |

## Code Style & Conventions

### TypeScript

- Use strict TypeScript with no `any` types
- Define explicit return types for all functions
- Use Zod for runtime validation of external inputs
- Prefer `interface` over `type` for object shapes

### Hono.js Patterns

```typescript
// Route handler pattern
app.get('/api/v1/resource', async (c) => {
  const { DB, CACHE } = c.env;

  // Validate input
  const params = resourceQuerySchema.parse(c.req.query());

  // Check cache first
  const cached = await CACHE.get(cacheKey);
  if (cached) return c.json(JSON.parse(cached));

  // Fetch and cache
  const data = await fetchData(params);
  await CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 300 });

  return c.json({ success: true, data });
});
```

### Error Handling

Always use the standard error response format:

```typescript
// src/lib/utils/errors.ts
export function errorResponse(c: Context, status: number, code: ErrorCode, message: string) {
  return c.json({
    success: false,
    error: message,
    code,
    requestId: c.get('requestId')
  }, status);
}
```

Error codes: `NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `RATE_LIMIT_EXCEEDED`

### Naming Conventions

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Database columns: `snake_case`

## External Integrations

### 1. agent0-sdk

```typescript
import { SDK } from 'agent0-sdk';

const sdk = new SDK({ chainId: 11155111, rpcUrl: env.SEPOLIA_RPC_URL });
const agents = await sdk.searchAgents({ limit: 20 });
```

### 2. search-service

```typescript
// POST to search-service
const response = await fetch(`${env.SEARCH_SERVICE_URL}/api/search`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, topK: 20, minScore: 0.3 })
});
```

### 3. Multi-Provider Classification (Gemini + Claude)

The classifier uses Gemini as primary provider with Claude as fallback:

```typescript
import { createClassifierService } from '@/services/classifier';

// Create multi-provider classifier
const classifier = createClassifierService(
  env.GOOGLE_AI_API_KEY,      // Gemini API key (primary)
  env.CLASSIFICATION_MODEL,    // 'gemini-2.0-flash' (default)
  env.ANTHROPIC_API_KEY,       // Claude API key (fallback)
  env.FALLBACK_MODEL           // 'claude-3-haiku-20240307' (default)
);

// Classify an agent - tries Gemini first, falls back to Claude on error
const result = await classifier.classify({
  agentId: '11155111:1',
  name: 'Agent Name',
  description: 'Agent description...',
  mcpTools: [],
  a2aSkills: []
});
// Returns: { skills: [...], domains: [...], confidence: 0.95, modelVersion: '...' }
```

## Database Schema (D1)

```sql
-- Classifications storage
CREATE TABLE agent_classifications (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,  -- "chainId:tokenId"
  chain_id INTEGER NOT NULL,
  skills TEXT NOT NULL,           -- JSON array
  domains TEXT NOT NULL,          -- JSON array
  confidence REAL NOT NULL,
  model_version TEXT NOT NULL,
  classified_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Classification queue
CREATE TABLE classification_queue (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

-- Agent feedback from EAS attestations
CREATE TABLE agent_feedback (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  score INTEGER NOT NULL,         -- 1-5 rating
  tags TEXT,                      -- JSON array of feedback tags
  context TEXT,                   -- Optional feedback context
  feedback_uri TEXT,              -- Link to attestation
  submitter TEXT NOT NULL,        -- Wallet address
  eas_uid TEXT UNIQUE,            -- EAS attestation UID
  submitted_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Aggregated agent reputation
CREATE TABLE agent_reputation (
  agent_id TEXT PRIMARY KEY,
  average_score REAL NOT NULL,
  total_count INTEGER NOT NULL,
  low_count INTEGER DEFAULT 0,    -- Score 1-2
  medium_count INTEGER DEFAULT 0, -- Score 3
  high_count INTEGER DEFAULT 0,   -- Score 4-5
  updated_at TEXT DEFAULT (datetime('now'))
);

-- EAS sync state per chain
CREATE TABLE eas_sync_state (
  chain_id INTEGER PRIMARY KEY,
  last_block INTEGER DEFAULT 0,
  last_timestamp TEXT,
  attestations_synced INTEGER DEFAULT 0,
  last_error TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

## Caching Strategy

| Resource | Cache Key Pattern | TTL |
|----------|-------------------|-----|
| Agent list | `agents:${hash}` | 5 min |
| Agent detail | `agent:${agentId}` | 5 min |
| Classification | `classify:${agentId}` | 24 hours |
| Chain stats | `chains:stats` | 15 min |
| Taxonomy | `taxonomy:${type}` | 1 hour |
| Search results | `search:${hash}` | 5 min |

## Rate Limiting

| Tier | Requests/min |
|------|--------------|
| Anonymous | 60 |
| With API Key | 300 |
| Classification POST | 10 per agent |

## Testing

```typescript
// Use Vitest with miniflare for Workers testing
import { unstable_dev } from 'wrangler';

describe('API', () => {
  let worker: UnstableDevWorker;

  beforeAll(async () => {
    worker = await unstable_dev('src/index.ts', { experimental: { disableExperimentalWarning: true } });
  });

  afterAll(async () => {
    await worker.stop();
  });

  it('health check returns ok', async () => {
    const resp = await worker.fetch('/api/v1/health');
    expect(resp.status).toBe(200);
  });
});
```

## E2E Test Suite

The E2E test suite verifies ~120 test cases against the production API.

### Running E2E Tests

```bash
# Run all tests
API_KEY="your_key" pnpm run test:e2e

# Run specific test suite
API_KEY="..." pnpm run test:e2e -- --filter=fallback
API_KEY="..." pnpm run test:e2e -- --filter=pagination
API_KEY="..." pnpm run test:e2e -- --filter=security

# JSON output (for CI)
API_KEY="..." pnpm run test:e2e -- --json

# Verbose output
API_KEY="..." pnpm run test:e2e -- --verbose
```

### Available Test Suites

| Suite | Description | Tests |
|-------|-------------|-------|
| health | Health check endpoint | ~2 |
| basic | Basic agent filters (single filters) | ~11 |
| boolean | AND/OR filter modes | ~8 |
| oasf | Skills/domains filtering | ~6 |
| sorting | Sort and order parameters | ~8 |
| search | Semantic search (GET q= and POST /search) | ~25 |
| fallback | Vector search -> SDK fallback | ~27 |
| pagination | Offset and cursor pagination | ~12 |
| reputation | Reputation filters (minRep/maxRep) | ~5 |
| advanced | Complex filter combinations | ~5 |
| edge | Edge cases and boundary conditions | ~12 |
| error | Error handling and validation | ~6 |
| detail | Single agent detail endpoint | ~9 |
| taxonomy | OASF taxonomy endpoint | ~5 |
| security | Security tests (SQL injection, XSS, auth) | ~7 |
| consistency | SDK vs Search result consistency | ~4 |

### Test Structure

```
scripts/e2e-tests/
├── run-tests.ts           # Entry point, CLI args
├── test-runner.ts         # Custom test framework
├── utils/
│   ├── api-client.ts      # HTTP client with retry
│   └── assertions.ts      # Domain-specific assertions
└── tests/
    ├── health.ts
    ├── agents-basic.ts
    ├── agents-boolean.ts
    ├── agents-oasf.ts
    ├── agents-sorting.ts
    ├── agents-reputation.ts
    ├── agents-advanced.ts
    ├── agents-edge-cases.ts
    ├── agents-detail.ts
    ├── agents-pagination.ts
    ├── search.ts
    ├── search-fallback.ts
    ├── taxonomy.ts
    ├── security.ts
    ├── error-handling.ts
    └── consistency.ts
```

### Key Test Categories

1. **Search Fallback Tests**: Verify that when vector search returns 0 results, the API falls back to SDK substring search with all filters working correctly.

2. **Pagination Tests**: Verify both offset-based (page=N) and cursor-based pagination work correctly, including across pages with filters applied.

3. **Filter Combination Tests**: Verify AND mode (all filters must match) and OR mode (any boolean filter can match) work correctly.

4. **Security Tests**: Verify SQL injection and XSS payloads are sanitized, rate limiting is in place, and authentication works.

## OASF Taxonomy

The service uses OASF v0.8.0 taxonomy:

- **136 Skills**: natural_language_processing, code_generation, data_analysis, etc.
- **204 Domains**: finance, healthcare, technology, education, etc.

Taxonomy source: https://schema.oasf.outshift.com

## Supported Chains

| Chain | Chain ID | Network |
|-------|----------|---------|
| Ethereum Sepolia | 11155111 | Testnet |
| Base Sepolia | 84532 | Testnet |
| Polygon Amoy | 80002 | Testnet |

## Related Documentation

- [Semantic Search Standard](./docs/AG0_SEMANTIC_SEARCH_STANDARD.md) - Search API standard
- [agent0-ts SDK](https://github.com/agent0lab/agent0-ts) - SDK documentation
- [OASF Schema](https://docs.agntcy.org/oasf/) - OASF taxonomy docs
