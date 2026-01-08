# Agents

The Agents API provides endpoints for listing, filtering, and retrieving AI agent details.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents` | List agents with filters |
| GET | `/api/v1/agents/:agentId` | Get single agent details |
| GET | `/api/v1/agents/:agentId/similar` | Find similar agents |

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
| `hasRegistrationFile` | boolean | - | Has metadata file |

#### OASF Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `skills` | string[] | Filter by OASF skill slugs |
| `domains` | string[] | Filter by OASF domain slugs |

#### Reputation Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `minRep` | number | Minimum reputation score (0-5) |
| `maxRep` | number | Maximum reputation score (0-5) |

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
      "reputationScore": 4.5,
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
      "averageScore": 4.5,
      "count": 12,
      "distribution": {
        "low": 1,
        "medium": 2,
        "high": 9
      }
    },
    "reputationScore": 4.5,
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

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid query parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `NOT_FOUND` | Agent not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
