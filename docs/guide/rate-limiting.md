# Rate Limiting

The 8004 API implements rate limiting to ensure fair usage and service stability.

## Rate Limits

| Authentication | Limit | Window |
|----------------|-------|--------|
| Anonymous (no API key) | 60 requests | 1 minute |
| With API key | 300 requests | 1 minute |
| Classification endpoints | 100 requests | 1 minute |
| Evaluation endpoints | 30 requests | 1 minute |

## Response Headers

Every response includes rate limit information in the headers:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 295
X-RateLimit-Reset: 1704067200
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

## Rate Limit Exceeded

When you exceed the rate limit, you'll receive a `429 Too Many Requests` response:

```json
{
  "success": false,
  "error": "Rate limit exceeded. Try again later.",
  "code": "RATE_LIMIT_EXCEEDED",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

The response includes a `Retry-After` header indicating when you can retry:

```
Retry-After: 45
```

## Best Practices

### Implement Exponential Backoff

When rate limited, wait before retrying with increasing delays:

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    return response;
  }
  throw new Error('Max retries exceeded');
}
```

### Cache Responses

Cache responses to reduce API calls:

```javascript
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function cachedFetch(url, options) {
  const cacheKey = url;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const response = await fetch(url, options);
  const data = await response.json();

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

### Use Pagination

Instead of fetching all results at once, use pagination:

```bash
# First page
curl "https://api.8004.dev/api/v1/agents?limit=20" \
  -H "X-API-Key: your-api-key"

# Next page using cursor
curl "https://api.8004.dev/api/v1/agents?limit=20&cursor=eyJrIjo..." \
  -H "X-API-Key: your-api-key"
```

### Monitor Usage

Track your rate limit usage to avoid hitting limits:

```javascript
async function monitoredFetch(url, options) {
  const response = await fetch(url, options);

  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset = response.headers.get('X-RateLimit-Reset');

  if (parseInt(remaining) < 10) {
    console.warn(`Low rate limit: ${remaining} remaining, resets at ${new Date(reset * 1000)}`);
  }

  return response;
}
```

## Endpoint-Specific Limits

Some endpoints have stricter limits due to resource intensity:

| Endpoint | Limit | Reason |
|----------|-------|--------|
| `POST /api/v1/agents/:id/classify` | 100/min | LLM processing |
| `POST /api/v1/evaluate/:id` | 30/min | Agent testing |
| `POST /api/v1/compose` | 60/min | Team composition |
| `GET /api/v1/events` | 10 concurrent | SSE connections |

## Contact Us

If you need higher rate limits for your use case:

- Email: [hello@8004.dev](mailto:hello@8004.dev)
- Include your current API key and expected usage patterns
