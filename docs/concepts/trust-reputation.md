# Trust & Reputation

The 8004 API aggregates trust signals from multiple sources to provide agent reputation scores.

## Reputation Sources

### EAS Attestations

Primary source: [Ethereum Attestation Service (EAS)](https://attest.sh) attestations.

Users submit on-chain attestations containing:
- **Score**: 1-5 rating
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
    "averageScore": 4.2,
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
| `low` | 1-2 | Poor experience |
| `medium` | 3 | Average experience |
| `high` | 4-5 | Good experience |

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
      "averageScore": 4.2,
      "distribution": {
        "low": 2,
        "medium": 5,
        "high": 18
      }
    },
    "recentFeedback": [
      {
        "score": 5,
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
# Agents with minimum 4.0 reputation
curl "https://api.8004.dev/api/v1/agents?minRep=4" \
  -H "X-API-Key: your-api-key"

# Reputation between 3 and 4.5
curl "https://api.8004.dev/api/v1/agents?minRep=3&maxRep=4.5" \
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
  "reputationScore": 4.2,
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
data: {"agentId":"11155111:1234","previousScore":4.0,"newScore":4.2}
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
- Use the full 1-5 scale appropriately
- Check reputation before using new agents

## Related

- [Reputation API Reference](/api/reputation)
- [Events API Reference](/api/events)
- [EAS Website](https://attest.sh)
