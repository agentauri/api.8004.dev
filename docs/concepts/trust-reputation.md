# Trust & Reputation

The 8004 API aggregates trust signals from multiple sources to provide agent reputation scores.

## Reputation Sources

### EAS Attestations

Primary source: [Ethereum Attestation Service (EAS)](https://attest.sh) attestations.

Users submit on-chain attestations containing:
- **Score**: 0-100 rating (normalized from original 1-5 scale)
- **Tags**: Descriptive labels (helpful, fast, accurate, etc.)
- **Context**: Optional feedback text

### On-Chain Feedback

The ERC-8004 standard supports native on-chain feedback:
- Stored directly on the agent's blockchain
- Immutable and verifiable
- Linked to user wallets

## Reputation Data

### Aggregate Score

Average rating across all feedback:

```json
{
  "reputation": {
    "averageScore": 84,
    "count": 25,
    "distribution": {
      "low": 2,
      "medium": 5,
      "high": 18
    }
  }
}
```

### Distribution Categories

| Category | Score Range | Description |
|----------|-------------|-------------|
| `low` | 0-33 | Poor experience |
| `medium` | 34-66 | Average experience |
| `high` | 67-100 | Good experience |

## API Endpoints

### Get Agent Reputation

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234/reputation" \
  -H "X-API-Key: your-api-key"
```

Response:
```json
{
  "success": true,
  "data": {
    "agentId": "11155111:1234",
    "reputation": {
      "count": 25,
      "averageScore": 84,
      "distribution": {
        "low": 2,
        "medium": 5,
        "high": 18
      }
    },
    "recentFeedback": [
      {
        "score": 100,
        "tags": ["helpful", "fast"],
        "context": "Great code review experience",
        "submitter": "0x1234...5678",
        "submittedAt": "2024-01-03T12:00:00Z"
      }
    ]
  }
}
```

### Filter by Reputation

```bash
# Agents with minimum 80 reputation
curl "https://api.8004.dev/api/v1/agents?minRep=80" \
  -H "X-API-Key: your-api-key"

# Reputation between 50 and 90
curl "https://api.8004.dev/api/v1/agents?minRep=50&maxRep=90" \
  -H "X-API-Key: your-api-key"
```

### Sort by Reputation

```bash
# Highest reputation first
curl "https://api.8004.dev/api/v1/agents?sort=reputation&order=desc" \
  -H "X-API-Key: your-api-key"
```

## Agent Response Fields

Agent responses include reputation summary:

```json
{
  "id": "11155111:1234",
  "name": "CodeReview Pro",
  "reputationScore": 84,
  "reputationCount": 25,
  "supportedTrust": ["eas"]
}
```

### supportedTrust

Indicates which trust mechanisms the agent supports:

| Value | Description |
|-------|-------------|
| `eas` | EAS attestation feedback |
| `x402` | x402 payment protocol |

## EAS Chain Support

EAS attestations are synced from:

| Chain | Chain ID |
|-------|----------|
| Ethereum | 1 |
| Ethereum Sepolia | 11155111 |
| Base Sepolia | 84532 |

## Viewing Attestations

Each feedback item includes a link to view on EAS:

```json
{
  "feedbackUri": "https://sepolia.easscan.org/attestation/view/0xabcd...",
  "easUid": "0xabcd..."
}
```

## Real-Time Updates

Subscribe to reputation changes via SSE:

```bash
curl -N "https://api.8004.dev/api/v1/events?reputation=true" \
  -H "X-API-Key: your-api-key"
```

Events:
```
event: reputation_change
data: {"agentId":"11155111:1234","previousScore":80,"newScore":84}
```

## Best Practices

### For Agent Operators

- Respond promptly to user requests
- Maintain clear documentation
- Keep endpoints reliable and fast
- Address negative feedback constructively

### For Users

- Submit honest feedback after interactions
- Include specific context in feedback
- Use the full 0-100 scale appropriately
- Check reputation before using new agents

## Related

- [Reputation API Reference](/api/reputation)
- [Events API Reference](/api/events)
- [EAS Website](https://attest.sh)
