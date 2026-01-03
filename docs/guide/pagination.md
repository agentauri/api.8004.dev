# Pagination

The 8004 API supports two pagination methods: **cursor-based** (recommended) and **offset-based**.

## Cursor-Based Pagination (Recommended)

Cursor pagination provides consistent results even when data changes between requests.

### How It Works

1. Make your first request without a cursor
2. The response includes `nextCursor` if more results exist
3. Pass `nextCursor` as the `cursor` parameter for subsequent requests

### Example

**First Request:**

```bash
curl "https://api.8004.dev/api/v1/agents?limit=20" \
  -H "X-API-Key: your-api-key"
```

**Response:**

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 150,
    "hasMore": true,
    "nextCursor": "eyJrIjoiYWdlbnRzOmxpc3Q6YWJjMTIzIiwibyI6MjB9"
  }
}
```

**Next Page:**

```bash
curl "https://api.8004.dev/api/v1/agents?limit=20&cursor=eyJrIjoiYWdlbnRzOmxpc3Q6YWJjMTIzIiwibyI6MjB9" \
  -H "X-API-Key: your-api-key"
```

### Cursor Format

Cursors are opaque, base64-encoded strings. Do not attempt to decode or construct them manually.

## Offset-Based Pagination

Offset pagination uses `page` and `limit` parameters for simple page navigation.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 20 | Results per page (max: 100) |

### Example

```bash
# Page 1
curl "https://api.8004.dev/api/v1/agents?page=1&limit=20" \
  -H "X-API-Key: your-api-key"

# Page 2
curl "https://api.8004.dev/api/v1/agents?page=2&limit=20" \
  -H "X-API-Key: your-api-key"
```

### Response

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 150,
    "page": 2,
    "limit": 20,
    "hasMore": true
  }
}
```

## Choosing a Pagination Method

| Method | Pros | Cons |
|--------|------|------|
| **Cursor** | Consistent with changing data, efficient for large datasets | Cannot jump to arbitrary page |
| **Offset** | Simple, can jump to any page | May skip/duplicate items if data changes |

::: tip Recommendation
Use **cursor-based pagination** for production applications, especially when iterating through large result sets or when data may change between requests.
:::

## Pagination with Filters

Pagination works with all filters. The cursor encodes filter state:

```bash
# Filter + Cursor pagination
curl "https://api.8004.dev/api/v1/agents?chainId=11155111&mcp=true&limit=10" \
  -H "X-API-Key: your-api-key"

# Next page with same filters
curl "https://api.8004.dev/api/v1/agents?chainId=11155111&mcp=true&limit=10&cursor=..." \
  -H "X-API-Key: your-api-key"
```

## Pagination in Search

The `/api/v1/search` endpoint also supports cursor pagination:

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "code review assistant",
    "limit": 10
  }'
```

**Response with cursor:**

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 42,
    "hasMore": true,
    "nextCursor": "eyJrIjoic2VhcmNoOnJlc3VsdHM6eHl6IiwibyI6MTB9"
  }
}
```

**Next page:**

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "code review assistant",
    "limit": 10,
    "cursor": "eyJrIjoic2VhcmNoOnJlc3VsdHM6eHl6IiwibyI6MTB9"
  }'
```

## Iterating All Results

### JavaScript

```javascript
async function* fetchAllAgents(apiKey, filters = {}) {
  let cursor = null;

  do {
    const params = new URLSearchParams({
      limit: '100',
      ...filters,
      ...(cursor && { cursor })
    });

    const response = await fetch(
      `https://api.8004.dev/api/v1/agents?${params}`,
      { headers: { 'X-API-Key': apiKey } }
    );

    const { data, meta } = await response.json();

    for (const agent of data) {
      yield agent;
    }

    cursor = meta.nextCursor;
  } while (cursor);
}

// Usage
for await (const agent of fetchAllAgents('your-api-key', { mcp: 'true' })) {
  console.log(agent.name);
}
```

### Python

```python
import requests

def fetch_all_agents(api_key, filters=None):
    cursor = None
    filters = filters or {}

    while True:
        params = {'limit': 100, **filters}
        if cursor:
            params['cursor'] = cursor

        response = requests.get(
            'https://api.8004.dev/api/v1/agents',
            headers={'X-API-Key': api_key},
            params=params
        )

        data = response.json()

        for agent in data['data']:
            yield agent

        cursor = data['meta'].get('nextCursor')
        if not cursor:
            break

# Usage
for agent in fetch_all_agents('your-api-key', {'mcp': 'true'}):
    print(agent['name'])
```

## Rate Limiting Considerations

When paginating through large datasets:

- Respect rate limits (300 req/min with API key)
- Add delays between requests if processing large volumes
- Monitor `X-RateLimit-Remaining` header

```javascript
async function fetchWithRateLimit(url, options) {
  const response = await fetch(url, options);

  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
  if (remaining < 10) {
    // Wait before next request
    await new Promise(r => setTimeout(r, 1000));
  }

  return response;
}
```

## Limits

| Parameter | Min | Max | Default |
|-----------|-----|-----|---------|
| `limit` | 1 | 100 | 20 |
| `page` | 1 | - | 1 |

::: warning Maximum Results
Offset pagination is limited to the first 10,000 results. For larger datasets, use cursor-based pagination.
:::
