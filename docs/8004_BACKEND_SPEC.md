# 8004 Backend Service Specification

## Overview

This document specifies the backend service for 8004.dev, providing a unified REST API that aggregates data from multiple sources (agent0-sdk, search-service, OASF classifier) for the frontend.

**Repository**: `agent0lab/8004-backend` (separate repo)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         8004-backend                                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      Hono.js REST API                               │ │
│  │  /api/v1/agents  /api/v1/search  /api/v1/classify  /api/v1/chains  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                 │                                        │
│         ┌───────────────────────┼───────────────────────┐               │
│         │                       │                       │               │
│         ▼                       ▼                       ▼               │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐         │
│  │ SDK Client  │        │  Semantic   │        │    OASF     │         │
│  │ (agent0-sdk)│        │   Search    │        │ Classifier  │         │
│  └──────┬──────┘        │   Client    │        │   (Claude)  │         │
│         │               └──────┬──────┘        └──────┬──────┘         │
│         │                      │                      │                 │
│  ┌──────┴──────────────────────┴──────────────────────┴──────┐         │
│  │                    Cache Layer (KV/Redis)                  │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │                    D1 Database                              │         │
│  │  - OASF Classifications                                     │         │
│  │  - Classification Queue                                     │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
          │                       │
          ▼                       ▼
   ┌─────────────┐        ┌─────────────────────┐
   │  Subgraph   │        │   search-service    │
   │ (The Graph) │        │ (agent0lab repo)    │
   └─────────────┘        └─────────────────────┘
```

---

## Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Runtime | Cloudflare Workers | Edge deployment, low latency |
| Framework | Hono.js | Lightweight, CF-native |
| Database | Cloudflare D1 | SQLite-compatible, for classifications |
| Cache | Cloudflare KV | Key-value store for response caching |
| Queue | Cloudflare Queues | Async classification jobs |
| LLM | Claude API | OASF classification |

---

## OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: 8004 Backend API
  description: Unified API for 8004.dev agent explorer
  version: 1.0.0
  contact:
    name: Agent0 Lab
    url: https://github.com/agent0lab

servers:
  - url: https://api.8004.dev/api/v1
    description: Production
  - url: http://localhost:8787/api/v1
    description: Local development

paths:
  /health:
    get:
      summary: Health check
      operationId: healthCheck
      tags: [System]
      responses:
        '200':
          description: Service healthy
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthResponse'

  /agents:
    get:
      summary: List agents with filters
      operationId: listAgents
      tags: [Agents]
      parameters:
        - name: q
          in: query
          description: Search query (triggers semantic search)
          schema:
            type: string
        - name: chainId
          in: query
          description: Filter by chain ID
          schema:
            type: integer
            enum: [11155111, 84532, 80002]
        - name: active
          in: query
          description: Filter by active status
          schema:
            type: boolean
        - name: mcp
          in: query
          description: Filter by MCP support
          schema:
            type: boolean
        - name: a2a
          in: query
          description: Filter by A2A support
          schema:
            type: boolean
        - name: x402
          in: query
          description: Filter by x402 support
          schema:
            type: boolean
        - name: skills
          in: query
          description: Filter by OASF skills (comma-separated)
          schema:
            type: string
          example: natural_language_processing,code_generation
        - name: domains
          in: query
          description: Filter by OASF domains (comma-separated)
          schema:
            type: string
          example: finance,technology
        - name: minScore
          in: query
          description: Minimum semantic search score (0-1)
          schema:
            type: number
            minimum: 0
            maximum: 1
        - name: limit
          in: query
          description: Results per page
          schema:
            type: integer
            default: 20
            maximum: 100
        - name: cursor
          in: query
          description: Pagination cursor
          schema:
            type: string
      responses:
        '200':
          description: Agent list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AgentListResponse'

  /agents/{agentId}:
    get:
      summary: Get agent details
      operationId: getAgent
      tags: [Agents]
      parameters:
        - name: agentId
          in: path
          required: true
          description: Agent ID (format chainId:tokenId)
          schema:
            type: string
          example: "11155111:123"
      responses:
        '200':
          description: Agent details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AgentDetailResponse'
        '404':
          description: Agent not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /agents/{agentId}/classify:
    get:
      summary: Get OASF classification for agent
      operationId: getAgentClassification
      tags: [Classification]
      parameters:
        - name: agentId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Classification result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ClassificationResponse'
        '202':
          description: Classification in progress
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ClassificationPendingResponse'
        '404':
          description: Agent not found

    post:
      summary: Request classification for agent
      operationId: requestClassification
      tags: [Classification]
      parameters:
        - name: agentId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                force:
                  type: boolean
                  description: Force re-classification
                  default: false
      responses:
        '202':
          description: Classification queued
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ClassificationQueuedResponse'

  /search:
    post:
      summary: Semantic search
      operationId: semanticSearch
      tags: [Search]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SearchRequest'
      responses:
        '200':
          description: Search results
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SearchResponse'

  /chains:
    get:
      summary: Get chain statistics
      operationId: getChainStats
      tags: [Chains]
      responses:
        '200':
          description: Chain statistics
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ChainStatsResponse'

  /taxonomy:
    get:
      summary: Get OASF taxonomy tree
      operationId: getTaxonomy
      tags: [Taxonomy]
      parameters:
        - name: type
          in: query
          description: Taxonomy type
          schema:
            type: string
            enum: [skill, domain, all]
            default: all
      responses:
        '200':
          description: Taxonomy tree
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TaxonomyResponse'

components:
  schemas:
    HealthResponse:
      type: object
      required: [status, timestamp, version]
      properties:
        status:
          type: string
          enum: [ok, degraded, down]
        timestamp:
          type: string
          format: date-time
        version:
          type: string
        services:
          type: object
          properties:
            sdk:
              type: string
              enum: [ok, error]
            searchService:
              type: string
              enum: [ok, error]
            classifier:
              type: string
              enum: [ok, error]
            database:
              type: string
              enum: [ok, error]

    AgentSummary:
      type: object
      required: [id, chainId, tokenId, name, active]
      properties:
        id:
          type: string
          description: Agent ID (chainId:tokenId)
          example: "11155111:123"
        chainId:
          type: integer
          example: 11155111
        tokenId:
          type: string
          example: "123"
        name:
          type: string
          example: "Trading Agent"
        description:
          type: string
        image:
          type: string
          format: uri
        active:
          type: boolean
        hasMcp:
          type: boolean
        hasA2a:
          type: boolean
        x402support:
          type: boolean
        oasf:
          $ref: '#/components/schemas/OASFClassification'
        searchScore:
          type: number
          description: Semantic search relevance score (0-1)
          minimum: 0
          maximum: 1

    AgentDetail:
      allOf:
        - $ref: '#/components/schemas/AgentSummary'
        - type: object
          properties:
            endpoints:
              $ref: '#/components/schemas/AgentEndpoints'
            registration:
              $ref: '#/components/schemas/AgentRegistration'
            mcpTools:
              type: array
              items:
                type: string
            a2aSkills:
              type: array
              items:
                type: string

    AgentEndpoints:
      type: object
      properties:
        mcp:
          type: object
          properties:
            url:
              type: string
              format: uri
            version:
              type: string
        a2a:
          type: object
          properties:
            url:
              type: string
              format: uri
            version:
              type: string
        ens:
          type: string
        did:
          type: string

    AgentRegistration:
      type: object
      properties:
        chainId:
          type: integer
        tokenId:
          type: string
        contractAddress:
          type: string
        metadataUri:
          type: string
        owner:
          type: string
        registeredAt:
          type: string
          format: date-time

    OASFClassification:
      type: object
      properties:
        skills:
          type: array
          items:
            $ref: '#/components/schemas/SkillClassification'
        domains:
          type: array
          items:
            $ref: '#/components/schemas/DomainClassification'
        confidence:
          type: number
          minimum: 0
          maximum: 1
        classifiedAt:
          type: string
          format: date-time
        modelVersion:
          type: string

    SkillClassification:
      type: object
      required: [slug, confidence]
      properties:
        slug:
          type: string
          example: "natural_language_processing/text_generation"
        confidence:
          type: number
          minimum: 0
          maximum: 1
        reasoning:
          type: string

    DomainClassification:
      type: object
      required: [slug, confidence]
      properties:
        slug:
          type: string
          example: "finance/trading"
        confidence:
          type: number
          minimum: 0
          maximum: 1
        reasoning:
          type: string

    AgentListResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: array
          items:
            $ref: '#/components/schemas/AgentSummary'
        meta:
          type: object
          properties:
            total:
              type: integer
            hasMore:
              type: boolean
            nextCursor:
              type: string

    AgentDetailResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          $ref: '#/components/schemas/AgentDetail'

    ClassificationResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          $ref: '#/components/schemas/OASFClassification'

    ClassificationPendingResponse:
      type: object
      properties:
        success:
          type: boolean
        status:
          type: string
          enum: [pending, processing]
        estimatedTime:
          type: integer
          description: Estimated seconds until completion

    ClassificationQueuedResponse:
      type: object
      properties:
        success:
          type: boolean
        status:
          type: string
          enum: [queued, already_classified]
        agentId:
          type: string

    SearchRequest:
      type: object
      required: [query]
      properties:
        query:
          type: string
          minLength: 1
        filters:
          type: object
          properties:
            chainIds:
              type: array
              items:
                type: integer
            active:
              type: boolean
            mcp:
              type: boolean
            a2a:
              type: boolean
            skills:
              type: array
              items:
                type: string
            domains:
              type: array
              items:
                type: string
        minScore:
          type: number
          default: 0.3
        limit:
          type: integer
          default: 20
          maximum: 100
        cursor:
          type: string

    SearchResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: array
          items:
            $ref: '#/components/schemas/AgentSummary'
        meta:
          type: object
          properties:
            query:
              type: string
            total:
              type: integer
            hasMore:
              type: boolean
            nextCursor:
              type: string

    ChainStatsResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: array
          items:
            type: object
            properties:
              chainId:
                type: integer
              name:
                type: string
              agentCount:
                type: integer
              activeCount:
                type: integer

    TaxonomyResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          properties:
            version:
              type: string
              example: "0.8.0"
            skills:
              type: array
              items:
                $ref: '#/components/schemas/TaxonomyCategory'
            domains:
              type: array
              items:
                $ref: '#/components/schemas/TaxonomyCategory'

    TaxonomyCategory:
      type: object
      required: [id, slug, name]
      properties:
        id:
          type: integer
        slug:
          type: string
        name:
          type: string
        description:
          type: string
        children:
          type: array
          items:
            $ref: '#/components/schemas/TaxonomyCategory'

    ErrorResponse:
      type: object
      required: [success, error]
      properties:
        success:
          type: boolean
          enum: [false]
        error:
          type: string
        code:
          type: string
          enum:
            - NOT_FOUND
            - VALIDATION_ERROR
            - INTERNAL_ERROR
            - RATE_LIMIT_EXCEEDED
        requestId:
          type: string

  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
      description: Optional API key for higher rate limits
```

---

## Database Schema (D1)

```sql
-- OASF Classifications storage
CREATE TABLE agent_classifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  skills TEXT NOT NULL,  -- JSON array
  domains TEXT NOT NULL, -- JSON array
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  model_version TEXT NOT NULL,
  classified_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_classifications_chain ON agent_classifications(chain_id);
CREATE INDEX idx_classifications_confidence ON agent_classifications(confidence);

-- Classification job queue
CREATE TABLE classification_queue (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX idx_queue_status ON classification_queue(status);
CREATE INDEX idx_queue_agent ON classification_queue(agent_id);
```

---

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxx          # For OASF classification
SEARCH_SERVICE_URL=https://...        # agent0lab search-service URL

# Chain RPC URLs (for SDK)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/xxx
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/xxx
POLYGON_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/xxx

# Optional
CACHE_TTL=300                         # Cache TTL in seconds (default: 5 min)
CLASSIFICATION_MODEL=claude-3-haiku-20240307  # LLM model for classification
RATE_LIMIT_RPM=100                    # Rate limit requests per minute
```

---

## Integration Points

### 1. agent0-sdk Integration

```typescript
import { SDK } from 'agent0-sdk';

const sdkInstances = new Map<number, SDK>();

function getSDK(chainId: number): SDK {
  if (!sdkInstances.has(chainId)) {
    const rpcUrl = getRpcUrl(chainId);
    sdkInstances.set(chainId, new SDK({ chainId, rpcUrl }));
  }
  return sdkInstances.get(chainId)!;
}

async function getAgentsFromSDK(chainIds: number[], params: SearchParams) {
  const results = await Promise.all(
    chainIds.map(chainId => getSDK(chainId).searchAgents(params))
  );
  return results.flat();
}
```

### 2. search-service Integration

```typescript
const SEARCH_SERVICE_URL = env.SEARCH_SERVICE_URL;

async function semanticSearch(query: string, filters?: SearchFilters) {
  const response = await fetch(`${SEARCH_SERVICE_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      topK: filters?.limit || 20,
      minScore: filters?.minScore || 0.3,
      metadata: {
        chainId: filters?.chainId,
        // ... other filters
      }
    })
  });
  return response.json();
}
```

### 3. OASF Classifier Integration

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

async function classifyAgent(agent: Agent): Promise<OASFClassification> {
  const prompt = buildClassificationPrompt(agent);

  const response = await anthropic.messages.create({
    model: env.CLASSIFICATION_MODEL || 'claude-3-haiku-20240307',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  return parseClassificationResponse(response);
}
```

---

## Caching Strategy

| Endpoint | Cache Key | TTL |
|----------|-----------|-----|
| `GET /agents` | `agents:${hash(params)}` | 5 min |
| `GET /agents/:id` | `agent:${agentId}` | 5 min |
| `GET /agents/:id/classify` | `classify:${agentId}` | 24 hours |
| `GET /chains` | `chains:stats` | 15 min |
| `GET /taxonomy` | `taxonomy:${type}` | 1 hour |
| `POST /search` | `search:${hash(body)}` | 5 min |

---

## Rate Limiting

| Tier | Requests/min | Notes |
|------|--------------|-------|
| Anonymous | 60 | Default |
| With API Key | 300 | Optional auth |
| Classification | 10 | Per agent, to limit LLM costs |

Headers returned:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 1735689600
```

---

## Deployment

### Cloudflare Workers

```toml
# wrangler.toml
name = "8004-backend"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "8004-backend-db"
database_id = "xxx"

[[kv_namespaces]]
binding = "CACHE"
id = "xxx"

[[queues.producers]]
binding = "CLASSIFICATION_QUEUE"
queue = "classification-jobs"

[[queues.consumers]]
queue = "classification-jobs"
max_batch_size = 10
max_retries = 3
```

### Deploy Commands

```bash
# Development
wrangler dev

# Production deploy
wrangler deploy

# Database migrations
wrangler d1 execute 8004-backend-db --file=./migrations/001_init.sql
```

---

## Frontend Integration (8004.dev)

Once the backend is deployed, update 8004.dev:

```typescript
// src/lib/backend/client.ts
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.8004.dev';

export async function searchAgents(params: SearchParams) {
  const queryString = new URLSearchParams();
  if (params.q) queryString.set('q', params.q);
  if (params.chainId) queryString.set('chainId', String(params.chainId));
  // ... other params

  const res = await fetch(`${BACKEND_URL}/api/v1/agents?${queryString}`);
  return res.json();
}

export async function getAgent(agentId: string) {
  const res = await fetch(`${BACKEND_URL}/api/v1/agents/${agentId}`);
  return res.json();
}

export async function getAgentClassification(agentId: string) {
  const res = await fetch(`${BACKEND_URL}/api/v1/agents/${agentId}/classify`);
  return res.json();
}
```

---

## Migration Checklist

When backend is ready:

- [ ] Deploy backend to Cloudflare Workers
- [ ] Run D1 migrations
- [ ] Configure environment variables
- [ ] Update 8004.dev to use `NEXT_PUBLIC_BACKEND_URL`
- [ ] Create `src/lib/backend/client.ts` in 8004.dev
- [ ] Remove `src/lib/agent0/` from 8004.dev
- [ ] Remove `src/lib/search/subgraph-provider.ts`
- [ ] Update API routes to proxy to backend
- [ ] Re-enable OASF taxonomy filters in sidebar
- [ ] Test end-to-end

---

## Related Documents

- [OASF Classification Service Spec](./OASF_CLASSIFICATION_SERVICE_SPEC.md) - Detailed classifier spec
- [AG0 Semantic Search Standard](./AG0_SEMANTIC_SEARCH_STANDARD.md) - Search API standard

---

*Document Version: 1.0*
*Last Updated: December 2025*
