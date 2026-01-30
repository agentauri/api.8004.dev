# Events

The Events API provides real-time updates via Server-Sent Events (SSE). Subscribe to agent registrations, reputation changes, and other platform events.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/events` | SSE event stream |
| GET | `/api/v1/events/info` | Event types documentation |

## Subscribe to Events

```
GET /api/v1/events
```

Subscribe to real-time events via Server-Sent Events (SSE).

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentIds` | string | Comma-separated agent IDs to filter |
| `chainIds` | string | Comma-separated chain IDs to filter |
| `eventTypes` | string | Comma-separated event types |
| `reputation` | boolean | Include reputation change events |
| `reachability` | boolean | Include reachability update events |
| `attestations` | boolean | Include attestation events |
| `registrations` | boolean | Include agent registration events |
| `classifications` | boolean | Include classification events |
| `heartbeat` | integer | Heartbeat interval in seconds (5-60) |

### Example Request

```bash
curl -N "https://api.8004.dev/api/v1/events?chainIds=11155111&reputation=true&reachability=true" \
  -H "X-API-Key: your-api-key"
```

### Event Stream Format

```
event: connected
data: {"subscriptionId":"abc123","filters":{"chainIds":[11155111],"reputation":true,"reachability":true},"timestamp":"2024-01-03T12:00:00.000Z"}

event: heartbeat
data: {"timestamp":"2024-01-03T12:00:30.000Z"}

event: reputation_change
data: {"agentId":"11155111:1234","chainId":11155111,"previousScore":80,"newScore":84,"feedbackCount":15,"timestamp":"2024-01-03T12:01:00.000Z"}

event: reachability_update
data: {"agentId":"11155111:1234","chainId":11155111,"mcpReachable":true,"a2aReachable":false,"timestamp":"2024-01-03T12:02:00.000Z"}
```

---

## Event Types

### connected

Initial connection confirmation with subscription details.

```json
{
  "subscriptionId": "abc123",
  "filters": {
    "chainIds": [11155111],
    "reputation": true,
    "reachability": true
  },
  "timestamp": "2024-01-03T12:00:00.000Z"
}
```

### heartbeat

Periodic heartbeat to keep connection alive (default: every 30 seconds).

```json
{
  "timestamp": "2024-01-03T12:00:30.000Z"
}
```

### reputation_change

Agent reputation score changed due to new feedback.

```json
{
  "agentId": "11155111:1234",
  "chainId": 11155111,
  "previousScore": 80,
  "newScore": 84,
  "feedbackCount": 15,
  "latestFeedback": {
    "score": 100,
    "tags": ["helpful", "fast"]
  },
  "timestamp": "2024-01-03T12:01:00.000Z"
}
```

### reachability_update

Agent MCP/A2A endpoint reachability changed.

```json
{
  "agentId": "11155111:1234",
  "chainId": 11155111,
  "mcpReachable": true,
  "a2aReachable": false,
  "previousMcp": false,
  "previousA2a": false,
  "timestamp": "2024-01-03T12:02:00.000Z"
}
```

### new_attestation

New EAS attestation received for an agent.

```json
{
  "agentId": "11155111:1234",
  "chainId": 11155111,
  "attestationUid": "0xabcd...ef01",
  "attester": "0x1234...5678",
  "score": 75,
  "tags": ["reliable"],
  "timestamp": "2024-01-03T12:03:00.000Z"
}
```

### agent_registered

New agent registered on the blockchain.

```json
{
  "agentId": "11155111:5678",
  "chainId": 11155111,
  "name": "NewAgent",
  "owner": "0x1234...5678",
  "hasMcp": true,
  "hasA2a": false,
  "timestamp": "2024-01-03T12:04:00.000Z"
}
```

### agent_updated

Agent data updated on the blockchain.

```json
{
  "agentId": "11155111:1234",
  "chainId": 11155111,
  "changes": ["description", "mcpEndpoint"],
  "timestamp": "2024-01-03T12:05:00.000Z"
}
```

### classification_complete

Agent OASF classification completed by LLM.

```json
{
  "agentId": "11155111:1234",
  "chainId": 11155111,
  "skills": [
    { "slug": "code_generation", "name": "Code Generation" }
  ],
  "domains": [
    { "slug": "technology", "name": "Technology" }
  ],
  "confidence": 0.95,
  "timestamp": "2024-01-03T12:06:00.000Z"
}
```

---

## Get Event Info

```
GET /api/v1/events/info
```

Get documentation about available event types and filters.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/events/info" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "description": "Real-time events via Server-Sent Events (SSE)",
    "endpoint": "/api/v1/events",
    "eventTypes": [
      {
        "type": "connected",
        "description": "Initial connection confirmation with subscription details"
      },
      {
        "type": "heartbeat",
        "description": "Periodic heartbeat to keep connection alive"
      },
      {
        "type": "reputation_change",
        "description": "Agent reputation score changed due to feedback"
      },
      {
        "type": "reachability_update",
        "description": "Agent MCP/A2A endpoint reachability changed"
      },
      {
        "type": "new_attestation",
        "description": "New EAS attestation received for an agent"
      },
      {
        "type": "agent_registered",
        "description": "New agent registered on the blockchain"
      },
      {
        "type": "agent_updated",
        "description": "Agent data updated on the blockchain"
      },
      {
        "type": "classification_complete",
        "description": "Agent OASF classification completed by LLM"
      }
    ],
    "filters": {
      "agentIds": "Comma-separated list of agent IDs",
      "chainIds": "Comma-separated list of chain IDs",
      "eventTypes": "Comma-separated list of event types to subscribe to",
      "reputation": "Enable/disable reputation events (true/false)",
      "reachability": "Enable/disable reachability events (true/false)",
      "attestations": "Enable/disable attestation events (true/false)",
      "registrations": "Enable/disable registration events (true/false)",
      "classifications": "Enable/disable classification events (true/false)",
      "heartbeat": "Heartbeat interval in seconds (5-60, default: 30)"
    },
    "example": {
      "url": "/api/v1/events?chainIds=11155111&reputation=true&reachability=true",
      "description": "Subscribe to reputation and reachability events on Sepolia chain"
    },
    "notes": [
      "Connections automatically close after 1 hour (max duration)",
      "Heartbeat events are sent every 30 seconds by default",
      "All event data is JSON-formatted in the SSE data field",
      "Use EventSource API in browsers or SSE client libraries"
    ]
  }
}
```

---

## Client Examples

### JavaScript (Browser)

```javascript
const eventSource = new EventSource(
  'https://api.8004.dev/api/v1/events?chainIds=11155111&reputation=true',
  {
    headers: { 'X-API-Key': 'your-api-key' }
  }
);

eventSource.onopen = () => {
  console.log('Connected to event stream');
};

eventSource.addEventListener('reputation_change', (event) => {
  const data = JSON.parse(event.data);
  console.log('Reputation changed:', data.agentId, data.newScore);
});

eventSource.addEventListener('heartbeat', () => {
  console.log('Heartbeat received');
});

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
};
```

### Python

```python
import sseclient
import requests

url = 'https://api.8004.dev/api/v1/events?chainIds=11155111&reputation=true'
headers = {'X-API-Key': 'your-api-key'}

response = requests.get(url, headers=headers, stream=True)
client = sseclient.SSEClient(response)

for event in client.events():
    if event.event == 'reputation_change':
        data = json.loads(event.data)
        print(f"Reputation changed: {data['agentId']} -> {data['newScore']}")
```

---

## Connection Limits

| Limit | Value |
|-------|-------|
| Max duration | 1 hour |
| Heartbeat interval | 5-60 seconds (default: 30) |
| Concurrent connections | 10 per API key |

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many connections |
