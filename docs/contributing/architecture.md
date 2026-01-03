# Architecture

Overview of the 8004 API backend architecture.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Cloudflare Workers |
| Framework | Hono.js |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Queue | Cloudflare Queues |
| Vector DB | Qdrant Cloud |
| Embeddings | Venice AI (BGE-M3) |
| LLM | Gemini (primary) + Claude (fallback) |

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │   Workers    │   │      D1      │   │      KV      │        │
│  │  (API Core)  │◄─►│  (Database)  │   │   (Cache)    │        │
│  └──────┬───────┘   └──────────────┘   └──────────────┘        │
│         │                                                       │
│  ┌──────▼───────┐                                               │
│  │    Queues    │                                               │
│  │(Classification)                                              │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Qdrant Cloud  │  │    Venice AI    │  │   LLM Providers │
│  (Vector Search)│  │  (Embeddings)   │  │(Gemini + Claude)│
└─────────────────┘  └─────────────────┘  └─────────────────┘
          │
          ▼
┌─────────────────┐
│   The Graph     │
│  (Subgraph)     │
└─────────────────┘
```

## Project Structure

```
src/
├── index.ts              # Main entry, Hono app
├── routes/
│   ├── agents.ts         # /api/v1/agents
│   ├── search.ts         # /api/v1/search
│   ├── classify.ts       # Classification endpoints
│   ├── reputation.ts     # Reputation endpoints
│   ├── evaluate.ts       # Evaluation endpoints
│   ├── compose.ts        # Team composition
│   ├── intents.ts        # Intent templates
│   ├── events.ts         # SSE events
│   ├── chains.ts         # Chain stats
│   ├── stats.ts          # Platform stats
│   ├── taxonomy.ts       # OASF taxonomy
│   └── health.ts         # Health checks
├── services/
│   ├── cache.ts          # KV cache utilities
│   ├── classifier.ts     # OASF classification
│   ├── eas-indexer.ts    # EAS attestation sync
│   ├── evaluator.ts      # Agent evaluation
│   ├── ipfs.ts           # IPFS gateway client
│   ├── oasf-resolver.ts  # OASF resolution
│   ├── qdrant.ts         # Qdrant client
│   ├── reputation.ts     # Reputation aggregation
│   ├── sdk.ts            # agent0-sdk integration
│   ├── search.ts         # Search service client
│   └── sync.ts           # Data synchronization
├── db/
│   ├── schema.ts         # D1 schema types
│   └── queries.ts        # Database queries
├── lib/
│   ├── middleware/       # Hono middleware
│   ├── oasf/             # OASF taxonomy data
│   └── utils/            # Utilities
└── types/                # TypeScript types
```

## Data Flow

### Search Request

```
1. Client sends POST /api/v1/search
2. Request validated via Zod schema
3. Check KV cache for identical query
4. If not cached:
   a. Generate query embedding (Venice AI)
   b. Search Qdrant for similar vectors
   c. Enrich results with SDK data
   d. Apply filters (skills, domains, etc.)
   e. Batch fetch classifications & reputations
5. Cache result in KV
6. Return response
```

### Classification Request

```
1. Client sends POST /api/v1/agents/:id/classify
2. Check if already classified in D1
3. If not, queue classification job
4. Background worker:
   a. Fetch agent data from SDK
   b. Send to Gemini for analysis
   c. Parse OASF skills/domains
   d. Store in D1
5. Return queued/completed status
```

## Database Schema

### D1 Tables

```sql
-- OASF Classifications
agent_classifications (
  id, agent_id, chain_id, skills, domains,
  confidence, model_version, classified_at
)

-- Classification Queue
classification_queue (
  id, agent_id, status, attempts, error
)

-- Agent Feedback (from EAS)
agent_feedback (
  id, agent_id, chain_id, score, tags,
  context, submitter, eas_uid, submitted_at
)

-- Aggregated Reputation
agent_reputation (
  agent_id, average_score, total_count,
  low_count, medium_count, high_count
)

-- EAS Sync State
eas_sync_state (
  chain_id, last_block, attestations_synced
)
```

## Caching Strategy

| Resource | Cache Key | TTL |
|----------|-----------|-----|
| Agent list | `agents:list:{hash}` | 5 min |
| Agent detail | `agent:{id}` | 5 min |
| Classification | `classify:{id}` | 24 hours |
| Chain stats | `chains:stats` | 15 min |
| Platform stats | `platform:stats` | 15 min |
| Taxonomy | `taxonomy:{type}` | 1 hour |
| Search results | `search:{hash}` | 5 min |

## External Integrations

### agent0-sdk

```typescript
import { SDK } from 'agent0-sdk';

const sdk = new SDK({
  chainId: 11155111,
  rpcUrl: env.SEPOLIA_RPC_URL
});

const agents = await sdk.searchAgents({ limit: 20 });
```

### Qdrant

```typescript
const results = await qdrant.search({
  vector: queryEmbedding,
  limit: 20,
  filter: {
    must: [
      { key: 'chainId', match: { value: 11155111 } }
    ]
  }
});
```

### LLM Classification

```typescript
const classifier = createClassifierService(
  env.GOOGLE_AI_API_KEY,    // Primary: Gemini
  'gemini-2.0-flash',
  env.ANTHROPIC_API_KEY,    // Fallback: Claude
  'claude-3-haiku-20240307'
);

const result = await classifier.classify(agentData);
```

## Middleware Stack

```
Request
  │
  ├─► requestId (generate unique ID)
  ├─► securityHeaders (CSP, CORS)
  ├─► apiKey (authentication)
  ├─► rateLimit (enforce limits)
  ├─► bodyLimit (size limits)
  │
  ▼
Route Handler
  │
  ▼
Response
```

## Error Handling

Centralized error utilities:

```typescript
// src/lib/utils/errors.ts
export const errors = {
  notFound: (c, resource) => c.json({
    success: false,
    error: `${resource} not found`,
    code: 'NOT_FOUND',
    requestId: c.get('requestId')
  }, 404),

  validationError: (c, message) => c.json({
    success: false,
    error: message,
    code: 'VALIDATION_ERROR',
    requestId: c.get('requestId')
  }, 422),

  // ... more error types
};
```

## Related

- [Testing Guide](/contributing/testing)
- [Deployment Guide](/contributing/deployment)
- [API Reference](/api/)
