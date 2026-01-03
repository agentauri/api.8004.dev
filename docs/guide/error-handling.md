# Error Handling

The 8004 API uses conventional HTTP response codes and returns detailed error information in JSON format.

## Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-03T12:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `false` for errors |
| `error` | string | Human-readable error message |
| `code` | string | Machine-readable error code |
| `requestId` | string | Unique request ID for debugging |
| `timestamp` | string | ISO 8601 timestamp |

## HTTP Status Codes

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Missing or invalid API key |
| `403` | Forbidden - Access denied |
| `404` | Not Found - Resource doesn't exist |
| `422` | Validation Error - Invalid input data |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |
| `503` | Service Unavailable - Temporary outage |

## Error Codes

### Authentication Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | API key required or invalid |
| `FORBIDDEN` | 403 | Access denied to this resource |

**Example:**

```json
{
  "success": false,
  "error": "API key required",
  "code": "UNAUTHORIZED",
  "requestId": "abc123"
}
```

### Validation Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 422 | Invalid request parameters |
| `BAD_REQUEST` | 400 | Malformed request |

**Example:**

```json
{
  "success": false,
  "error": "Invalid agent ID format. Expected chainId:tokenId",
  "code": "VALIDATION_ERROR",
  "requestId": "abc123"
}
```

### Resource Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `AGENT_NOT_FOUND` | 404 | Agent doesn't exist |
| `CHAIN_NOT_SUPPORTED` | 400 | Chain ID not supported |

**Example:**

```json
{
  "success": false,
  "error": "Agent 11155111:99999 not found",
  "code": "NOT_FOUND",
  "requestId": "abc123"
}
```

### Rate Limit Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

**Example:**

```json
{
  "success": false,
  "error": "Rate limit exceeded. Try again later.",
  "code": "RATE_LIMIT_EXCEEDED",
  "requestId": "abc123"
}
```

### Service Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | External service down |
| `TIMEOUT` | 504 | Request timed out |

**Example:**

```json
{
  "success": false,
  "error": "Agent registry service is temporarily unavailable",
  "code": "SERVICE_UNAVAILABLE",
  "requestId": "abc123"
}
```

## Handling Errors

### JavaScript Example

```javascript
async function fetchAgents() {
  const response = await fetch('https://api.8004.dev/api/v1/agents', {
    headers: { 'X-API-Key': 'your-api-key' }
  });

  const data = await response.json();

  if (!data.success) {
    switch (data.code) {
      case 'UNAUTHORIZED':
        console.error('Invalid API key');
        break;
      case 'RATE_LIMIT_EXCEEDED':
        const retryAfter = response.headers.get('Retry-After');
        console.log(`Rate limited. Retry after ${retryAfter}s`);
        break;
      case 'SERVICE_UNAVAILABLE':
        console.log('Service temporarily down, retrying...');
        await new Promise(r => setTimeout(r, 5000));
        return fetchAgents(); // Retry
      default:
        console.error(`Error: ${data.error}`);
    }
    throw new Error(data.error);
  }

  return data.data;
}
```

### Python Example

```python
import requests
import time

def fetch_agents():
    response = requests.get(
        'https://api.8004.dev/api/v1/agents',
        headers={'X-API-Key': 'your-api-key'}
    )

    data = response.json()

    if not data.get('success'):
        code = data.get('code')

        if code == 'RATE_LIMIT_EXCEEDED':
            retry_after = int(response.headers.get('Retry-After', 60))
            time.sleep(retry_after)
            return fetch_agents()

        if code == 'SERVICE_UNAVAILABLE':
            time.sleep(5)
            return fetch_agents()

        raise Exception(f"{code}: {data.get('error')}")

    return data['data']
```

## Debugging Tips

### Use the Request ID

Every response includes a `requestId`. Include this when reporting issues:

```
Request ID: 550e8400-e29b-41d4-a716-446655440000
```

### Check Response Headers

Useful headers for debugging:

```
X-RateLimit-Remaining: 295
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

### Validate Input Locally

Before making API calls, validate:

- Agent ID format: `chainId:tokenId` (e.g., `11155111:1234`)
- Chain IDs are supported (see [Supported Chains](/guide/getting-started#supported-chains))
- Query parameters are properly encoded

## Getting Help

If you encounter persistent errors:

1. Check our [status page](https://status.8004.dev) for outages
2. Review the [API Reference](/api/) for correct usage
3. Contact support at [hello@8004.dev](mailto:hello@8004.dev) with the request ID
