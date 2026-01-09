# Reputation

The Reputation API provides access to agent feedback and reputation scores. Reputation is aggregated from two sources:
- **EAS (Ethereum Attestation Service)** attestations (normalized from 1-5 to 0-100 scale)
- **On-chain feedback** from the ERC-8004 Reputation Registry via The Graph (native 0-100 scale)

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents/:agentId/reputation` | Get agent reputation and feedback |
| GET | `/api/v1/agents/:agentId/reputation/history` | Get reputation history over time |
| GET | `/api/v1/agents/:agentId/reputation/feedback` | Get paginated feedback list |

## Get Agent Reputation

```
GET /api/v1/agents/:agentId/reputation
```

Retrieve the aggregated reputation score and recent feedback for an agent.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/reputation" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "agentId": "11155111:1234",
    "reputation": {
      "count": 25,
      "averageScore": 72.5,
      "distribution": {
        "low": 2,
        "medium": 5,
        "high": 18
      }
    },
    "recentFeedback": [
      {
        "id": "feedback-uuid-1",
        "score": 85,
        "tags": ["helpful", "fast", "accurate"],
        "context": "Great code review experience",
        "submitter": "0x1234...5678",
        "feedbackUri": "ipfs://Qm...",
        "feedbackIndex": 3,
        "endpoint": "https://agent.example.com/mcp",
        "timestamp": "2024-01-03T12:00:00.000Z",
        "transactionHash": "0xabcd...ef01"
      },
      {
        "id": "feedback-uuid-2",
        "score": 65,
        "tags": ["helpful"],
        "context": null,
        "submitter": "0x9876...4321",
        "feedbackUri": null,
        "feedbackIndex": 1,
        "endpoint": null,
        "timestamp": "2024-01-02T10:30:00.000Z",
        "transactionHash": "0xefgh...ij23"
      }
    ]
  }
}
```

### Score Distribution

Scores are on a **0-100 scale**:

| Category | Score Range | Description |
|----------|-------------|-------------|
| `low` | 0-33 | Poor experience |
| `medium` | 34-66 | Average experience |
| `high` | 67-100 | Excellent experience |

---

## Get Reputation History

```
GET /api/v1/agents/:agentId/reputation/history
```

Retrieve reputation history over time for an agent. Useful for tracking reputation trends.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | 30d | Time period: `7d`, `30d`, `90d`, or `1y` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/reputation/history?period=30d" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-01",
      "reputationScore": 68.5,
      "feedbackCount": 15
    },
    {
      "date": "2024-01-08",
      "reputationScore": 70.2,
      "feedbackCount": 18
    },
    {
      "date": "2024-01-15",
      "reputationScore": 72.5,
      "feedbackCount": 25
    }
  ],
  "meta": {
    "agentId": "11155111:1234",
    "period": "30d",
    "startDate": "2023-12-16",
    "endDate": "2024-01-15",
    "dataPoints": 3
  }
}
```

---

## Get Feedback List

```
GET /api/v1/agents/:agentId/reputation/feedback
```

Retrieve a paginated list of all feedback for an agent.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Results per page (1-100) |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/reputation/feedback?limit=50" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "feedback-uuid-1",
      "score": 85,
      "tags": ["helpful", "fast", "accurate"],
      "context": "Great code review experience",
      "submitter": "0x1234...5678",
      "feedbackUri": "ipfs://Qm...",
      "feedbackIndex": 3,
      "endpoint": "https://agent.example.com/mcp",
      "timestamp": "2024-01-03T12:00:00.000Z",
      "transactionHash": "0xabcd...ef01"
    }
  ],
  "meta": {
    "total": 25,
    "limit": 50
  }
}
```

---

## Feedback Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique feedback ID |
| `score` | integer | Rating (0-100) |
| `tags` | string[] | Feedback tags |
| `context` | string | Optional feedback context |
| `submitter` | string | Wallet address of reviewer |
| `feedbackUri` | string | IPFS URI to feedback metadata (ERC-8004 v1.0) |
| `feedbackIndex` | integer | Per-client feedback index (ERC-8004 v1.0) |
| `endpoint` | string | Service endpoint used when submitting (ERC-8004 v1.0) |
| `timestamp` | string | ISO 8601 timestamp |
| `transactionHash` | string | On-chain transaction hash |

---

## Filtering by Reputation

You can filter agents by reputation in the `/api/v1/agents` endpoint:

```bash
# Agents with minimum 70 reputation (0-100 scale)
curl "https://api.8004.dev/api/v1/agents?minRep=70" \
  -H "X-API-Key: your-api-key"

# Agents with reputation between 50 and 80
curl "https://api.8004.dev/api/v1/agents?minRep=50&maxRep=80" \
  -H "X-API-Key: your-api-key"
```

---

## Sorting by Reputation

Sort agents by reputation score:

```bash
# Highest reputation first
curl "https://api.8004.dev/api/v1/agents?sort=reputation&order=desc" \
  -H "X-API-Key: your-api-key"

# Lowest reputation first
curl "https://api.8004.dev/api/v1/agents?sort=reputation&order=asc" \
  -H "X-API-Key: your-api-key"
```

---

## Feedback Sources

Reputation data is sourced from two providers:

### EAS (Ethereum Attestation Service)
- Attestations are synced periodically from supported chains
- Original 1-5 scale is normalized to 0-100: `1->0, 2->25, 3->50, 4->75, 5->100`
- Each attestation is verified on-chain
- Duplicate attestations are filtered

### The Graph (ERC-8004 Reputation Registry)
- On-chain feedback uses native 0-100 scale
- Includes ERC-8004 v1.0 fields: `feedbackIndex`, `endpoint`, `feedbackHash`, `feedbackUri`
- Synced via The Graph subgraph

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid agent ID format or period |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
