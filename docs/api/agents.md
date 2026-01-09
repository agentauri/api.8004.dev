# Agents

The Agents API provides endpoints for listing, filtering, and retrieving AI agent details.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents` | List agents with filters |
| GET | `/api/v1/agents/batch` | Batch fetch multiple agents |
| GET | `/api/v1/agents/:agentId` | Get single agent details |
| GET | `/api/v1/agents/:agentId/similar` | Find similar agents |
| GET | `/api/v1/agents/:agentId/complementary` | Find complementary agents |
| GET | `/api/v1/agents/:agentId/compatible` | Find I/O compatible agents |
| GET | `/api/v1/agents/:agentId/health` | Get agent health status |
| GET | `/api/v1/agents/:agentId/evaluations` | Get evaluation history |
| GET | `/api/v1/agents/:agentId/verification` | Get verification status |

## List Agents

```
GET /api/v1/agents
```

Retrieve a paginated list of agents with optional filtering and sorting.

### Query Parameters

#### Pagination

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Results per page (1-100) |
| `page` | integer | 1 | Page number (1-indexed) |
| `cursor` | string | - | Cursor for cursor-based pagination |

#### Chain Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | integer | Single chain ID |
| `chainIds` | integer[] | Multiple chain IDs (array) |
| `chains` | string | Comma-separated chain IDs |

#### Protocol Filters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mcp` | boolean | - | Has MCP endpoint |
| `a2a` | boolean | - | Has A2A endpoint |
| `x402` | boolean | - | Has x402 payment support |
| `filterMode` | string | AND | `AND` or `OR` for boolean filters |

#### Status Filters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `active` | boolean | - | Is actively maintained |
| `hasRegistrationFile` | boolean | - | Has registration metadata file |

#### OASF Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `skills` | string[] | Filter by OASF skill slugs |
| `domains` | string[] | Filter by OASF domain slugs |

#### Reputation Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `minRep` | number | Minimum reputation score (0-100) |
| `maxRep` | number | Maximum reputation score (0-100) |

#### Wallet Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Owner wallet address (exact match, case-insensitive) |
| `walletAddress` | string | Agent wallet address (exact match) |

#### Identity Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ens` | string | ENS name (exact match) |
| `did` | string | DID identifier (exact match) |

#### Trust Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `trustModels` | string | Comma-separated trust models (e.g., `x402,eas`) |
| `hasTrusts` | boolean | Has any trust model configured |

#### Reachability Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `reachableA2a` | boolean | A2A endpoint is reachable |
| `reachableMcp` | boolean | MCP endpoint is reachable |

#### Capability Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `mcpTools` | string | Comma-separated MCP tool names |
| `a2aSkills` | string | Comma-separated A2A skill names |

#### Exclusion Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `excludeChainIds` | string | Comma-separated chain IDs to exclude |
| `excludeSkills` | string | Comma-separated OASF skills to exclude |
| `excludeDomains` | string | Comma-separated OASF domains to exclude |

#### Search

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (semantic or name) |
| `searchMode` | string | `auto`, `semantic`, or `name` |
| `minScore` | number | Minimum search score (0-1) |

#### Sorting

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sort` | string | relevance | `relevance`, `name`, `createdAt`, `reputation` |
| `order` | string | desc | `asc` or `desc` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents?chainId=11155111&mcp=true&limit=10" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "11155111:1234",
      "chainId": 11155111,
      "tokenId": "1234",
      "name": "CodeReview Pro",
      "description": "AI-powered code review assistant",
      "image": "ipfs://Qm...",
      "active": true,
      "hasMcp": true,
      "hasA2a": false,
      "x402Support": false,
      "supportedTrust": ["eas"],
      "owner": "0xabc123...",
      "operators": ["0x123..."],
      "ens": "codereview.eth",
      "oasf": {
        "skills": [
          { "slug": "code_generation", "name": "Code Generation" }
        ],
        "domains": [
          { "slug": "technology", "name": "Technology" }
        ]
      },
      "oasfSource": "llm-classification",
      "reputationScore": 75.5,
      "reputationCount": 12
    }
  ],
  "meta": {
    "total": 150,
    "hasMore": true,
    "nextCursor": "eyJrIjoiYWdlbnRzOmxpc3Q6YWJjMTIzIiwibyI6MTB9",
    "stats": {
      "total": 2900,
      "withRegistrationFile": 2100,
      "active": 1800,
      "byChain": [
        {
          "chainId": 11155111,
          "name": "Sepolia",
          "totalCount": 1500,
          "activeCount": 1200
        }
      ]
    },
    "searchMode": "vector"
  }
}
```

### Filter Mode: AND vs OR

By default, boolean filters (`mcp`, `a2a`, `x402`) use AND mode - all must match.

```bash
# AND mode: must have BOTH MCP and A2A
curl "https://api.8004.dev/api/v1/agents?mcp=true&a2a=true" \
  -H "X-API-Key: your-api-key"

# OR mode: must have MCP OR A2A
curl "https://api.8004.dev/api/v1/agents?mcp=true&a2a=true&filterMode=OR" \
  -H "X-API-Key: your-api-key"
```

---

## Batch Fetch Agents

```
GET /api/v1/agents/batch
```

Fetch multiple agents by their IDs in a single request. Maximum 50 IDs per request.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | string | Yes | Comma-separated agent IDs |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/batch?ids=11155111:1234,11155111:5678,84532:100" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "11155111:1234",
      "chainId": 11155111,
      "tokenId": "1234",
      "name": "CodeReview Pro",
      "description": "AI-powered code review assistant",
      "image": "ipfs://Qm...",
      "active": true,
      "hasMcp": true,
      "hasA2a": false,
      "x402Support": false
    },
    {
      "id": "11155111:5678",
      "chainId": 11155111,
      "tokenId": "5678",
      "name": "DataViz AI",
      "description": "Data visualization agent",
      "active": true,
      "hasMcp": false,
      "hasA2a": true,
      "x402Support": true
    }
  ],
  "meta": {
    "requested": 3,
    "found": 2,
    "missing": ["84532:100"],
    "invalid": []
  }
}
```

---

## Get Agent Details

```
GET /api/v1/agents/:agentId
```

Retrieve detailed information about a specific agent.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "11155111:1234",
    "chainId": 11155111,
    "tokenId": "1234",
    "name": "CodeReview Pro",
    "description": "AI-powered code review assistant that analyzes code quality...",
    "image": "ipfs://Qm...",
    "active": true,
    "hasMcp": true,
    "hasA2a": false,
    "x402Support": false,
    "supportedTrust": ["eas"],
    "owner": "0xdef456...",
    "operators": ["0x123..."],
    "ens": "codereview.eth",
    "did": "did:web:example.com",
    "walletAddress": "0xabc...",
    "registration": {
      "metadataUri": "ipfs://Qm...",
      "registeredAt": "2024-01-01T00:00:00Z"
    },
    "endpoints": {
      "mcp": {
        "url": "https://mcp.example.com",
        "status": "active"
      },
      "a2a": null,
      "oasf": "https://oasf.example.com/agent.json"
    },
    "mcpTools": [
      {
        "name": "reviewCode",
        "description": "Review code for issues"
      }
    ],
    "a2aSkills": [],
    "oasf": {
      "skills": [
        { "slug": "code_generation", "name": "Code Generation" }
      ],
      "domains": [
        { "slug": "technology", "name": "Technology" }
      ]
    },
    "oasfSource": "llm-classification",
    "reputation": {
      "averageScore": 75.5,
      "count": 12,
      "distribution": {
        "low": 1,
        "medium": 2,
        "high": 9
      }
    },
    "reputationScore": 75.5,
    "reputationCount": 12,
    "ipfsMetadata": {
      "socialLinks": {
        "twitter": "https://twitter.com/codereview",
        "github": "https://github.com/codereview"
      },
      "externalUrl": "https://codereview.example.com",
      "attributes": [
        { "trait_type": "Version", "value": "2.0" }
      ]
    }
  }
}
```

---

## Find Similar Agents

```
GET /api/v1/agents/:agentId/similar
```

Find agents with similar OASF classification (skills and domains).

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 10 | Max results (1-20) |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/similar?limit=5" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "11155111:5678",
      "chainId": 11155111,
      "tokenId": "5678",
      "name": "CodeAssist AI",
      "description": "...",
      "similarityScore": 0.85,
      "matchedSkills": ["code_generation", "code_review"],
      "matchedDomains": ["technology"]
    }
  ],
  "meta": {
    "total": 5,
    "limit": 5,
    "targetAgent": "11155111:1234"
  }
}
```

### Similarity Calculation

Similarity is calculated using Jaccard-like scoring:
- **Skills weight**: 60%
- **Domains weight**: 40%
- **Score range**: 0-1 (higher = more similar)

---

## Find Complementary Agents

```
GET /api/v1/agents/:agentId/complementary
```

Find agents that complement this agent (work well together, not substitutes).

Complementary agents have:
- Different skills that work well together in workflows
- Some domain overlap (can communicate about same topics)
- Compatible protocol capabilities (MCP + A2A agents work together)
- Compatible trust models

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 10 | Max results (1-20) |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/complementary?limit=5" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "11155111:9012",
      "name": "Testing Agent",
      "complementarityScore": 0.78,
      "complementarySkills": ["testing", "qa"],
      "sharedDomains": ["technology"]
    }
  ],
  "meta": {
    "total": 5,
    "limit": 5,
    "sourceAgentId": "11155111:1234",
    "sourceSkills": ["code_generation"],
    "sourceDomains": ["technology"],
    "analysisTimeMs": 125
  }
}
```

---

## Find I/O Compatible Agents

```
GET /api/v1/agents/:agentId/compatible
```

Find I/O compatible agents for multi-agent pipelines.

Returns agents that can be chained together:
- **Upstream**: Agents whose output_modes match source's input_modes (can send data TO the source agent)
- **Downstream**: Agents whose input_modes match source's output_modes (can receive data FROM the source agent)

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 10 | Max results per direction (1-20) |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/compatible?limit=5" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "upstream": [
      {
        "id": "11155111:2000",
        "name": "Data Fetcher",
        "matchedModes": ["application/json", "text/plain"]
      }
    ],
    "downstream": [
      {
        "id": "11155111:3000",
        "name": "Report Generator",
        "matchedModes": ["application/json"]
      }
    ]
  },
  "meta": {
    "sourceAgentId": "11155111:1234",
    "sourceInputModes": ["application/json", "text/plain"],
    "sourceOutputModes": ["application/json"],
    "upstreamCount": 1,
    "downstreamCount": 1,
    "limit": 5,
    "analysisTimeMs": 98
  }
}
```

---

## Get Agent Health

```
GET /api/v1/agents/:agentId/health
```

Get health status for an agent's endpoints.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/health" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "agentId": "11155111:1234",
    "status": "healthy",
    "uptimePercentage": 99.5,
    "mcp": {
      "status": "healthy",
      "latencyMs": 125,
      "successRate": 99.8,
      "lastCheckedAt": "2024-01-15T10:30:00Z"
    },
    "a2a": {
      "status": "unknown",
      "latencyMs": null,
      "successRate": null,
      "lastCheckedAt": null
    },
    "lastCheckedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Health Status Values

| Status | Description |
|--------|-------------|
| `healthy` | All endpoints responding normally |
| `degraded` | Some endpoints have issues |
| `unhealthy` | Major endpoint failures |
| `unknown` | No health data available |

---

## Get Evaluation History

```
GET /api/v1/agents/:agentId/evaluations
```

Get evaluation history for a specific agent from the Registry-as-Evaluator system.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Results per page (1-100) |
| `offset` | integer | 0 | Offset for pagination |
| `cursor` | string | - | Cursor for cursor-based pagination |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/evaluations?limit=10" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "eval-uuid-1",
      "agentId": "11155111:1234",
      "evaluationType": "capability_test",
      "status": "passed",
      "score": 92,
      "details": {
        "testsRun": 15,
        "testsPassed": 14,
        "testsFailed": 1
      },
      "evaluatedAt": "2024-01-15T09:00:00Z"
    }
  ],
  "meta": {
    "total": 25,
    "hasMore": true,
    "nextCursor": "eyJfZ2xvYmFsX29mZnNldCI6MTB9"
  }
}
```

---

## Get Verification Status

```
GET /api/v1/agents/:agentId/verification
```

Get verification status and badge for an agent.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/verification" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "agentId": "11155111:1234",
    "badge": {
      "level": "verified",
      "verifiedMethods": ["dns", "github"],
      "verificationCount": 2,
      "lastVerifiedAt": "2024-01-10T12:00:00Z"
    },
    "verifications": [
      {
        "method": "dns",
        "status": "verified",
        "verifiedAt": "2024-01-10T12:00:00Z",
        "expiresAt": "2025-01-10T12:00:00Z",
        "error": null
      },
      {
        "method": "github",
        "status": "verified",
        "verifiedAt": "2024-01-08T10:00:00Z",
        "expiresAt": "2025-01-08T10:00:00Z",
        "error": null
      }
    ],
    "availableMethods": ["dns", "ens", "github", "twitter"]
  }
}
```

### Badge Levels

| Level | Description |
|-------|-------------|
| `unverified` | No verifications completed |
| `basic` | 1 verification method completed |
| `verified` | 2+ verification methods completed |
| `premium` | 3+ verification methods completed |

### Verification Methods

| Method | Description |
|--------|-------------|
| `dns` | DNS TXT record verification |
| `ens` | ENS text record verification |
| `github` | GitHub gist verification |
| `twitter` | Twitter post verification |

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid query parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `NOT_FOUND` | Agent not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
