# Webhooks

The Webhooks API allows you to subscribe to real-time events from the 8004.dev platform. When events occur (such as new agent registrations, feedback submissions, or reputation changes), HTTP POST requests are sent to your configured endpoints.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/webhooks` | List all webhooks |
| POST | `/api/v1/webhooks` | Create a new webhook |
| GET | `/api/v1/webhooks/:id` | Get webhook details |
| DELETE | `/api/v1/webhooks/:id` | Delete a webhook |
| POST | `/api/v1/webhooks/:id/test` | Send a test event |

## Supported Events

| Event | Description |
|-------|-------------|
| `agent.registered` | A new agent has been registered |
| `agent.updated` | An agent's metadata has been updated |
| `feedback.received` | New feedback has been submitted for an agent |
| `evaluation.completed` | An agent evaluation has completed |
| `reputation.changed` | An agent's reputation score has changed |

---

## List Webhooks

```
GET /api/v1/webhooks
```

Retrieve all webhooks associated with your API key.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/webhooks" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "wh_abc123def456",
      "url": "https://example.com/webhooks/8004",
      "events": ["agent.registered", "feedback.received"],
      "filters": {
        "chainIds": [11155111]
      },
      "active": true,
      "description": "Production webhook for Sepolia agents",
      "lastDeliveryAt": "2024-01-03T12:00:00.000Z",
      "lastDeliveryStatus": "delivered",
      "failureCount": 0,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1
  }
}
```

---

## Create Webhook

```
POST /api/v1/webhooks
```

Create a new webhook subscription.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Webhook endpoint URL (must be HTTPS) |
| `events` | string[] | Yes | Event types to subscribe to |
| `filters` | object | No | Optional event filters |
| `filters.chainIds` | integer[] | No | Only receive events for these chains |
| `filters.agentIds` | string[] | No | Only receive events for these agents |
| `description` | string | No | Description for the webhook (max 500 chars) |

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/webhooks" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/8004",
    "events": ["agent.registered", "feedback.received"],
    "filters": {
      "chainIds": [11155111, 84532]
    },
    "description": "Production webhook"
  }'
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123def456",
    "url": "https://example.com/webhooks/8004",
    "events": ["agent.registered", "feedback.received"],
    "filters": {
      "chainIds": [11155111, 84532]
    },
    "active": true,
    "description": "Production webhook",
    "createdAt": "2024-01-03T12:00:00.000Z",
    "secret": "whsec_1a2b3c4d5e6f7g8h9i0j..."
  },
  "message": "Webhook created successfully. Save the secret - it will not be shown again."
}
```

**Important:** The `secret` is only returned once during creation. Store it securely to verify webhook signatures.

---

## Get Webhook Details

```
GET /api/v1/webhooks/:id
```

Get detailed information about a specific webhook, including recent delivery history.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Webhook ID |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/webhooks/wh_abc123def456" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123def456",
    "url": "https://example.com/webhooks/8004",
    "events": ["agent.registered", "feedback.received"],
    "filters": {
      "chainIds": [11155111]
    },
    "active": true,
    "description": "Production webhook",
    "lastDeliveryAt": "2024-01-03T12:00:00.000Z",
    "lastDeliveryStatus": "delivered",
    "failureCount": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "recentDeliveries": [
      {
        "id": "del_xyz789",
        "eventType": "feedback.received",
        "status": "delivered",
        "attempts": 1,
        "responseStatus": 200,
        "createdAt": "2024-01-03T12:00:00.000Z"
      },
      {
        "id": "del_abc456",
        "eventType": "agent.registered",
        "status": "delivered",
        "attempts": 1,
        "responseStatus": 200,
        "createdAt": "2024-01-02T10:30:00.000Z"
      }
    ]
  }
}
```

---

## Delete Webhook

```
DELETE /api/v1/webhooks/:id
```

Delete a webhook subscription.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Webhook ID |

### Example Request

```bash
curl -X DELETE "https://api.8004.dev/api/v1/webhooks/wh_abc123def456" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

---

## Test Webhook

```
POST /api/v1/webhooks/:id/test
```

Send a test event to verify your webhook endpoint is configured correctly.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Webhook ID |

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/webhooks/wh_abc123def456/test" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "delivered": true,
    "responseStatus": 200,
    "responseBody": "{\"received\": true}"
  },
  "message": "Test webhook delivered successfully"
}
```

### Failed Test Response

```json
{
  "success": true,
  "data": {
    "delivered": false,
    "error": "Connection refused"
  },
  "message": "Test webhook delivery failed"
}
```

---

## Webhook Payload Format

All webhook deliveries use the following format:

### Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Webhook-Signature` | HMAC-SHA256 signature of the payload |
| `X-Webhook-Event` | Event type (e.g., `agent.registered`) |
| `X-Webhook-Id` | Webhook ID |
| `User-Agent` | `8004-Webhook/1.0` |

### Payload Structure

```json
{
  "event": "feedback.received",
  "timestamp": "2024-01-03T12:00:00.000Z",
  "data": {
    "agentId": "11155111:1234",
    "score": 5,
    "submitter": "0x1234...5678"
  }
}
```

---

## Signature Verification

Verify webhook authenticity by computing the HMAC-SHA256 signature:

### Node.js Example

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express.js middleware
app.post('/webhooks/8004', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body.toString();

  if (!verifySignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(payload);
  // Process event...

  res.status(200).json({ received: true });
});
```

### Python Example

```python
import hmac
import hashlib

def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

---

## Retry Policy

Failed webhook deliveries are retried with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1st retry | 1 minute |
| 2nd retry | 5 minutes |
| 3rd retry | 15 minutes |

After 3 failed attempts, the delivery is marked as permanently failed.

---

## Delivery Status

| Status | Description |
|--------|-------------|
| `pending` | Queued for delivery |
| `processing` | Currently being delivered |
| `delivered` | Successfully delivered (2xx response) |
| `failed` | All retry attempts exhausted |

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `NOT_FOUND` | Webhook not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests (300 requests/minute) |

---

## Best Practices

1. **Verify signatures** - Always verify the `X-Webhook-Signature` header
2. **Respond quickly** - Return a 2xx response within 30 seconds
3. **Process asynchronously** - Queue events for async processing
4. **Handle duplicates** - Events may be delivered more than once
5. **Use filters** - Reduce noise by filtering to relevant chains/agents
6. **Monitor failures** - Check `failureCount` and `lastDeliveryStatus` regularly

---

## Related Endpoints

- [Events (SSE)](/api/events) - Real-time Server-Sent Events stream
