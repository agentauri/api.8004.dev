# Reputation

The Reputation API provides access to agent feedback and reputation scores. Reputation is aggregated from EAS (Ethereum Attestation Service) attestations.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents/:agentId/reputation` | Get agent reputation and feedback |
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
      "averageScore": 4.2,
      "distribution": {
        "low": 2,
        "medium": 5,
        "high": 18
      }
    },
    "recentFeedback": [
      {
        "id": "feedback-uuid-1",
        "agentId": "11155111:1234",
        "chainId": 11155111,
        "score": 5,
        "tags": ["helpful", "fast", "accurate"],
        "context": "Great code review experience",
        "submitter": "0x1234...5678",
        "easUid": "0xabcd...ef01",
        "feedbackUri": "https://sepolia.easscan.org/attestation/view/0xabcd...",
        "submittedAt": "2024-01-03T12:00:00.000Z"
      },
      {
        "id": "feedback-uuid-2",
        "agentId": "11155111:1234",
        "chainId": 11155111,
        "score": 4,
        "tags": ["helpful"],
        "context": null,
        "submitter": "0x9876...4321",
        "easUid": "0xefgh...ij23",
        "feedbackUri": "https://sepolia.easscan.org/attestation/view/0xefgh...",
        "submittedAt": "2024-01-02T10:30:00.000Z"
      }
    ]
  }
}
```

### Score Distribution

| Category | Score Range | Description |
|----------|-------------|-------------|
| `low` | 1-2 | Poor experience |
| `medium` | 3 | Average experience |
| `high` | 4-5 | Good experience |

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
      "agentId": "11155111:1234",
      "chainId": 11155111,
      "score": 5,
      "tags": ["helpful", "fast", "accurate"],
      "context": "Great code review experience",
      "submitter": "0x1234...5678",
      "easUid": "0xabcd...ef01",
      "feedbackUri": "https://sepolia.easscan.org/attestation/view/0xabcd...",
      "submittedAt": "2024-01-03T12:00:00.000Z"
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
| `agentId` | string | Agent ID |
| `chainId` | integer | Chain where attestation was made |
| `score` | integer | Rating (1-5) |
| `tags` | string[] | Feedback tags |
| `context` | string | Optional feedback context |
| `submitter` | string | Wallet address of reviewer |
| `easUid` | string | EAS attestation UID |
| `feedbackUri` | string | Link to attestation on EAS scan |
| `submittedAt` | string | ISO 8601 timestamp |

---

## Filtering by Reputation

You can filter agents by reputation in the `/api/v1/agents` endpoint:

```bash
# Agents with minimum 4.0 reputation
curl "https://api.8004.dev/api/v1/agents?minRep=4" \
  -H "X-API-Key: your-api-key"

# Agents with reputation between 3 and 4.5
curl "https://api.8004.dev/api/v1/agents?minRep=3&maxRep=4.5" \
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

## EAS Integration

Reputation data is sourced from EAS (Ethereum Attestation Service) attestations:

- Attestations are synced periodically from supported chains
- Each attestation is verified on-chain
- Duplicate attestations are filtered
- Scores are aggregated into the reputation table

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid agent ID format |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
