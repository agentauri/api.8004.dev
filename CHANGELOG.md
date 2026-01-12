# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-01-12

### Added

- **MCP Capabilities Crawl Worker**: Background worker to fetch detailed MCP tool/prompt/resource information
  - Crawls MCP endpoints to populate `mcp_tools_detailed`, `mcp_prompts_detailed`, `mcp_resources_detailed`
  - Configurable batch processing with concurrency control
  - Staleness-based re-crawl (default: 24 hours)
  - Graceful error handling preserves previous data on failure

- **Advanced Filters**: Extended filtering capabilities
  - `curatedBy` - Filter by curator wallet address
  - `isCurated` - Filter by curated status
  - `declaredSkill` - Filter by declared OASF skill from registration file
  - `declaredDomain` - Filter by declared OASF domain from registration file
  - `mcpVersion` / `a2aVersion` - Filter by protocol version
  - `reachabilityAttestor` - Filter by reachability attestor address

- **Curated Agents Support**: Track and filter agents curated by known curators
  - `curated_by` array in Qdrant payload stores curator addresses
  - `is_curated` boolean for quick filtering
  - Derived from STAR feedback submissions

- **OpenAPI Specification Update**: Complete API documentation (10 → 45 endpoints)
  - Added 41 missing endpoint documentations
  - Added 26 new component schemas
  - Added 10 new API tags (Compose, Intents, Events, Leaderboard, etc.)
  - Full coverage of all routes including verification, webhooks, analytics

### Changed

- **Code Quality Improvements** (Sprint 5):
  - Consolidated duplicate `deriveSupportedTrust` function into `agent-transform.ts`
  - Consolidated sorting functions in `qdrant-search.ts` using generics
  - Simplified `searchFiltersToAgentFilters` with spread operator (~50 lines → 1)
  - Added Zod validation to queue job processing
  - Environment-aware CORS (localhost only in development)
  - Replaced non-null assertions with explicit env validation

- **Documentation Consolidation**:
  - Consolidated `docs/contributing/deployment.md` → references `DEPLOY.md`
  - Consolidated `docs/mcp/frontend.md` → references `FRONTEND_MCP_INTEGRATION.md`

### Fixed

- Use placeholder name for agents without `registrationFile` in embedding generation
- Use SDK's embedded Graph API key for subgraph access when `GRAPH_API_KEY` not set
- Qdrant fallback for agent detail when SDK fails (agents without registrationFile)
- Added logging to silent error catches in route handlers
- Removed duplicate `internal` error helper (kept `internalError`)
- Updated E2E tests for new filter parameters

## [2.0.0] - 2026-01-02

### Added

- **Qdrant Vector Search**: Complete migration from Pinecone/search-service to Qdrant Cloud
  - Native vector search with 27+ filters
  - Venice AI embeddings (text-embedding-bge-m3, 1024 dimensions)
  - Custom filter builder for complex Qdrant queries
  - Payload indexing for efficient filtering

- **MCP Server**: Model Context Protocol integration for AI assistants
  - `/mcp` endpoint for MCP-compatible clients
  - SSE transport for streaming responses
  - Built-in rate limiting (60 req/min per IP)
  - Public access without API key requirement

- **Trust Graph with PageRank**: Agent trust scoring system
  - Trust edges derived from feedback relationships
  - Iterative PageRank algorithm (damping factor 0.85)
  - `trust_score` field (0-100) in agent payload
  - Wallet trust scores for weighted calculations

- **Intent Templates**: Pre-defined multi-agent workflow templates
  - 4 built-in templates: data-analysis-pipeline, content-creation, code-review-pipeline, customer-support
  - Template matching with skill/domain requirements
  - I/O compatibility validation between steps
  - REST API at `/api/v1/intents`

- **Reliability Index**: Agent reliability tracking
  - MCP/A2A latency measurements
  - Success rate tracking per protocol
  - `minSuccessRate` and `maxLatency` filters

- **I/O Graph Matching**: Agent compatibility discovery
  - `GET /api/v1/agents/:agentId/compatible` endpoint
  - Finds upstream agents (can send to source)
  - Finds downstream agents (can receive from source)
  - Mode intersection scoring

- **SDK Fallback Search**: Graceful degradation when vector search fails
  - Falls back to agent0-sdk with all filters applied
  - Per-chain pagination to handle large datasets
  - Automatic retry logic

- **Enhanced Filtering**:
  - `updatedAfter` / `updatedBefore` date range filters
  - `hasInputMode` / `hasOutputMode` I/O mode filters
  - `operator` / `walletAddress` / `owner` identity filters
  - `trustModels` / `hasTrusts` trust model filters
  - `minSuccessRate` / `maxLatency` reliability filters

- **New Fields in Agent Payload**:
  - `agent_uri` - IPFS or HTTP URI to agent metadata
  - `updated_at` - ISO timestamp of last update
  - `trust_score` - PageRank-derived trust score
  - `mcp_latency_ms` / `a2a_latency_ms` - Protocol latencies
  - `mcp_success_rate` / `a2a_success_rate` - Success rates

- **Compose Endpoint**: Multi-agent workflow composition at `/api/v1/compose`

- **Events Endpoint**: Agent lifecycle events at `/api/v1/events`

- **Scripts Endpoint**: Embeddable JavaScript widgets at `/8004-chat.js`

### Changed

- **Vector Database**: Migrated from Pinecone to Qdrant Cloud
  - Direct Qdrant integration instead of search-service proxy
  - Native filtering instead of post-processing
  - Faster queries with payload indexes

- **Embedding Provider**: Migrated from OpenAI to Venice AI
  - Using text-embedding-bge-m3 model (1024 dimensions)
  - Cost-effective embedding generation

- **Search Architecture**: Complete rewrite of search system
  - `agents-qdrant.ts` and `search-qdrant.ts` replace SDK-based routes
  - Unified filter builder for consistent behavior
  - Hybrid search with LLM reranking (Gemini)

- **Classifier Provider**: Multi-provider with fallback
  - Primary: Gemini 2.0 Flash
  - Fallback: Claude 3 Haiku
  - Automatic retry on provider failure

- **CI Pipeline Optimization**:
  - Added vitest sharding for parallel test execution
  - Shared setup and caching between jobs
  - E2E tests run non-blocking

### Fixed

- Multi-chain pagination duplicates bug
- `minRep`/`maxRep` filter accepting float values
- SDK search pagination for old agents
- Boolean filters (mcp/a2a/x402) passed correctly to SDK fallback
- `active=false` treated as "no filter" in SDK fallback
- Sorting and pagination for Qdrant routes

### Removed

- OAuth 2.1 for MCP (simplified to public access with rate limiting)
- Direct dependency on agent0lab/search-service (replaced by Qdrant)

### Security

- Comprehensive codebase audit and hardening
- SQL injection prevention in filter builder
- Input sanitization for all user inputs
- Rate limiting on MCP endpoints

### Database Migrations

- `0005_reliability.sql` - Agent reliability tracking
- `0006_trust_graph.sql` - Trust edges and PageRank scores
- `0007_intent_templates.sql` - Intent templates and steps

---

## [1.1.0] - 2025-12-15

### Added

- Multi-provider OASF classifier (Gemini primary, Claude fallback)
- `searchMode` field in GET /agents?q= response
- Semantic search via POST /api/v1/search
- `matchReasons` in search results

### Changed

- Migrated search service to v1 API
- Improved mock SDK for testing

### Fixed

- SDK search finds old agents via per-chain pagination
- TypeScript and test schema errors
- Lint issues from biome check

---

## [1.0.0] - 2025-12-08

### Added

- Initial release
- REST API with Hono.js on Cloudflare Workers
- Agent listing and detail endpoints (`/api/v1/agents`)
- Semantic search endpoint (`/api/v1/search`)
- OASF classification endpoints (`/api/v1/agents/:id/classify`)
- Chain statistics endpoint (`/api/v1/chains`)
- Taxonomy endpoint (`/api/v1/taxonomy`)
- Health check endpoint (`/api/v1/health`)
- Multi-chain support (Ethereum Sepolia, Base Sepolia, Polygon Amoy)
- Integration with agent0-sdk for on-chain data
- Integration with search-service for semantic search
- OASF classification with Claude API
- D1 database for classification storage
- KV cache for response caching
- Queues for async classification processing
- Rate limiting (60 req/min anonymous, 300 req/min with API key)
- 70% branch coverage minimum with Vitest
- CI/CD with GitHub Actions
- Cloudflare Workers deployment

### Security

- Input validation with Zod
- Security headers middleware
- CORS configuration
- Rate limiting protection

[Unreleased]: https://github.com/agent0lab/8004-backend/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/agent0lab/8004-backend/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/agent0lab/8004-backend/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/agent0lab/8004-backend/releases/tag/v1.0.0
