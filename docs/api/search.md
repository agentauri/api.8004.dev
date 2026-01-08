# Search

The Search API provides semantic search capabilities for finding AI agents using natural language queries.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/search` | Semantic search for agents |

## Semantic Search

```
POST /api/v1/search
```

Search for agents using natural language. The API uses vector embeddings for semantic matching with automatic fallback to substring search.

### Request Body

```json
{
  "query": "code review assistant for Python",
  "limit": 10,
  "minScore": 0.3,
  "searchMode": "auto",
  "cursor": null,
  "filters": {
    "chainIds": [11155111],
    "active": true,
    "mcp": true,
    "a2a": false,
    "x402": false,
    "filterMode": "AND",
    "skills": ["code_generation"],
    "domains": ["technology"]
  }
}
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Natural language search query |
| `limit` | integer | No | 20 | Results per page (1-100) |
| `minScore` | number | No | 0.3 | Minimum similarity score (0-1) |
| `searchMode` | string | No | auto | Search mode (see below) |
| `cursor` | string | No | - | Pagination cursor |
| `offset` | integer | No | - | Offset for pagination |
| `filters` | object | No | - | Filter options |

### Search Modes

| Mode | Description |
|------|-------------|
| `auto` | Try semantic search first, fall back to name search if no results |
| `semantic` | Vector search only (no fallback) |
| `name` | Substring search on agent names only |

### Filter Options

#### Basic Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `chainIds` | integer[] | Filter by chain IDs |
| `active` | boolean | Filter by active status |
| `mcp` | boolean | Has MCP endpoint |
| `a2a` | boolean | Has A2A endpoint |
| `x402` | boolean | Has x402 payment support |
| `filterMode` | string | `AND` or `OR` for boolean filters |
| `skills` | string[] | Filter by OASF skill slugs |
| `domains` | string[] | Filter by OASF domain slugs |

#### Wallet & Identity Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Owner wallet address (exact match, case-insensitive) |
| `walletAddress` | string | Agent wallet address (exact match) |
| `ens` | string | ENS name (exact match) |
| `did` | string | DID identifier (exact match) |

#### Reputation Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `minRep` | number | Minimum reputation score (0-5) |
| `maxRep` | number | Maximum reputation score (0-5) |

#### Trust & Reachability Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `trustModels` | string[] | Filter by trust models (e.g., `["x402", "eas"]`) |
| `hasTrusts` | boolean | Has any trust model configured |
| `reachableA2a` | boolean | A2A endpoint is reachable |
| `reachableMcp` | boolean | MCP endpoint is reachable |

#### Capability Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `mcpTools` | string[] | Filter by MCP tool names |
| `a2aSkills` | string[] | Filter by A2A skill names |
| `hasRegistrationFile` | boolean | Has registration metadata file |

#### Exclusion Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `excludeChainIds` | integer[] | Chain IDs to exclude |
| `excludeSkills` | string[] | OASF skills to exclude |
| `excludeDomains` | string[] | OASF domains to exclude |

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "data analysis and visualization",
    "limit": 5,
    "filters": {
      "mcp": true
    }
  }'
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
      "name": "DataViz Pro",
      "description": "AI agent for data analysis and visualization...",
      "image": "ipfs://Qm...",
      "active": true,
      "hasMcp": true,
      "hasA2a": false,
      "x402Support": false,
      "supportedTrust": ["eas"],
      "owner": "0xabc123...",
      "operators": ["0x123..."],
      "oasf": {
        "skills": [
          { "slug": "data_analysis", "name": "Data Analysis" },
          { "slug": "data_visualization", "name": "Data Visualization" }
        ],
        "domains": [
          { "slug": "technology", "name": "Technology" }
        ]
      },
      "oasfSource": "llm-classification",
      "searchScore": 0.92,
      "matchReasons": ["semantic_match", "skill_match"]
    }
  ],
  "meta": {
    "query": "data analysis and visualization",
    "total": 42,
    "hasMore": true,
    "nextCursor": "eyJrIjoic2VhcmNoOnJlc3VsdHM6eHl6IiwibyI6NX0",
    "byChain": {
      "11155111": 30,
      "84532": 12
    },
    "searchMode": "vector"
  }
}
```

### Search Score

The `searchScore` field (0-1) indicates how well the agent matches the query:

| Score Range | Quality |
|-------------|---------|
| 0.8 - 1.0 | Excellent match |
| 0.6 - 0.8 | Good match |
| 0.4 - 0.6 | Fair match |
| 0.3 - 0.4 | Marginal match |

### Search Mode in Response

The `meta.searchMode` field indicates which search was used:

| Mode | Description |
|------|-------------|
| `vector` | Semantic vector search was used |
| `name` | Name substring search was used |
| `fallback` | Vector search returned 0 results, fell back to name search |

---

## Search via GET

You can also search using the agents endpoint with the `q` parameter:

```bash
curl "https://api.8004.dev/api/v1/agents?q=code+review&mcp=true&limit=10" \
  -H "X-API-Key: your-api-key"
```

This provides the same functionality as the POST endpoint but with query parameters.

---

## Pagination

### Cursor-Based (Recommended)

```bash
# First page
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "code review", "limit": 10}'

# Next page
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "code review",
    "limit": 10,
    "cursor": "eyJrIjoic2VhcmNoOnJlc3VsdHM6eHl6IiwibyI6MTB9"
  }'
```

### Offset-Based

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "code review", "limit": 10, "offset": 10}'
```

---

## Advanced Search Patterns

### Combining Filters

```bash
# Find MCP agents with code generation skills on Sepolia
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "programming assistant",
    "filters": {
      "chainIds": [11155111],
      "mcp": true,
      "skills": ["code_generation"]
    }
  }'
```

### OR Mode for Protocols

```bash
# Find agents with MCP OR A2A support
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "helpful assistant",
    "filters": {
      "mcp": true,
      "a2a": true,
      "filterMode": "OR"
    }
  }'
```

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid JSON body |
| 400 | `VALIDATION_ERROR` | Invalid request parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Search service error |
