# Feedbacks

The Feedbacks API provides access to global feedback data across all agents. This endpoint aggregates feedback from EAS (Ethereum Attestation Service) attestations and on-chain sources, supporting the ERC-8004 v1.0 specification.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/feedbacks` | List all feedbacks with pagination and filtering |

## List All Feedbacks

```
GET /api/v1/feedbacks
```

Retrieve a paginated list of all feedback across all agents, with optional filtering by chain and score category.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chainIds` | integer[] | - | Filter by chain IDs (comma-separated or array notation) |
| `chainIds[]` | integer[] | - | Filter by chain IDs (array notation: `chainIds[]=X&chainIds[]=Y`) |
| `scoreCategory` | string | - | Filter by score category: `positive`, `neutral`, or `negative` |
| `limit` | integer | 20 | Results per page (1-100) |
| `offset` | integer | 0 | Number of results to skip |
| `cursor` | string | - | Cursor for cursor-based pagination |

### Score Categories

| Category | Score Range | Description |
|----------|-------------|-------------|
| `positive` | 4-5 | Good experience |
| `neutral` | 3 | Average experience |
| `negative` | 1-2 | Poor experience |

### Supported Chain IDs

| Chain | Chain ID | Network |
|-------|----------|---------|
| Ethereum Sepolia | 11155111 | Testnet |
| Base Sepolia | 84532 | Testnet |
| Polygon Amoy | 80002 | Testnet |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/feedbacks?limit=10&scoreCategory=positive" \
  -H "X-API-Key: your-api-key"
```

### Example Request with Chain Filter

```bash
curl "https://api.8004.dev/api/v1/feedbacks?chainIds[]=11155111&chainIds[]=84532&limit=20" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "feedback-uuid-1",
      "agentId": "11155111:1234",
      "score": 5,
      "tags": ["helpful", "fast", "accurate"],
      "context": "Excellent code review experience",
      "submitter": "0x1234...5678",
      "timestamp": "2024-01-03T12:00:00.000Z",
      "chainId": 11155111,
      "txHash": "0xabcd...ef01",
      "feedbackIndex": 42,
      "endpoint": "mcp"
    },
    {
      "id": "feedback-uuid-2",
      "agentId": "84532:5678",
      "score": 4,
      "tags": ["helpful"],
      "submitter": "0x9876...4321",
      "timestamp": "2024-01-02T10:30:00.000Z",
      "chainId": 84532
    }
  ],
  "meta": {
    "total": 150,
    "hasMore": true,
    "nextCursor": "eyJfZ2xvYmFsX29mZnNldCI6MTB9",
    "stats": {
      "positive": 120,
      "neutral": 15,
      "negative": 15
    }
  }
}
```

---

## Feedback Schema

### Standard Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique feedback ID |
| `agentId` | string | Agent ID in format `chainId:tokenId` |
| `score` | integer | Rating (1-5) |
| `tags` | string[] | Feedback tags (e.g., `helpful`, `fast`, `accurate`) |
| `context` | string | Optional feedback context or comment |
| `submitter` | string | Wallet address of the reviewer |
| `timestamp` | string | ISO 8601 timestamp of submission |
| `chainId` | integer | Chain where feedback was submitted |
| `txHash` | string | Transaction hash (if on-chain) |

### ERC-8004 v1.0 Fields

| Field | Type | Description |
|-------|------|-------------|
| `feedbackIndex` | integer | Per-client feedback index for ordering |
| `endpoint` | string | Service endpoint reference (e.g., `mcp`, `a2a`) |

---

## Pagination

### Cursor-based Pagination

Use the `nextCursor` value from the response to fetch the next page:

```bash
curl "https://api.8004.dev/api/v1/feedbacks?cursor=eyJfZ2xvYmFsX29mZnNldCI6MTB9" \
  -H "X-API-Key: your-api-key"
```

### Offset-based Pagination

Alternatively, use `offset` for skip-based pagination:

```bash
curl "https://api.8004.dev/api/v1/feedbacks?offset=20&limit=10" \
  -H "X-API-Key: your-api-key"
```

---

## Response Statistics

The `meta.stats` object provides aggregate counts for the current filter:

| Field | Type | Description |
|-------|------|-------------|
| `positive` | integer | Count of feedbacks with score 4-5 |
| `neutral` | integer | Count of feedbacks with score 3 |
| `negative` | integer | Count of feedbacks with score 1-2 |

---

## Caching

Feedback list responses are cached for 5 minutes. The cache key is based on the query parameters.

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid query parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests (300 requests/minute) |

---

## Related Endpoints

- [Agent Reputation](/api/reputation) - Get reputation for a specific agent
- [Leaderboard](/api/leaderboard) - Agents ranked by reputation score
