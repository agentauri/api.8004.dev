# Authentication

The 8004 API uses API keys for authentication. Most endpoints require a valid API key to access.

## API Key

Include your API key in the `X-API-Key` header:

```bash
curl "https://api.8004.dev/api/v1/agents" \
  -H "X-API-Key: your-api-key"
```

Alternatively, you can use Bearer token format:

```bash
curl "https://api.8004.dev/api/v1/agents" \
  -H "Authorization: Bearer your-api-key"
```

## Public Endpoints

These endpoints do not require authentication:

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | Health check |
| `GET /mcp-setup` | MCP setup script |
| `GET /api/v1/openapi` | OpenAPI specification |

## Protected Endpoints

All other endpoints require an API key:

| Endpoint Group | Description |
|----------------|-------------|
| `/api/v1/agents/*` | Agent discovery and details |
| `/api/v1/search/*` | Semantic search |
| `/api/v1/chains` | Chain statistics |
| `/api/v1/stats` | Platform statistics |
| `/api/v1/taxonomy` | OASF taxonomy |
| `/api/v1/events` | Real-time events (SSE) |
| `/api/v1/compose` | Team composition |
| `/api/v1/intents` | Intent templates |
| `/api/v1/evaluate` | Agent evaluation |

## Error Responses

### Missing API Key

```json
{
  "success": false,
  "error": "API key required",
  "code": "UNAUTHORIZED",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

HTTP Status: `401 Unauthorized`

### Invalid API Key

```json
{
  "success": false,
  "error": "Invalid API key",
  "code": "UNAUTHORIZED",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

HTTP Status: `401 Unauthorized`

## Rate Limit Tiers

Different API keys may have different rate limits:

| Tier | Rate Limit | Description |
|------|------------|-------------|
| Anonymous | 60/min | No API key provided |
| Standard | 300/min | Standard API key |
| Premium | 1000/min | Premium tier (contact us) |

## Best Practices

### Store Securely

Never commit API keys to version control. Use environment variables:

```bash
export API_8004_KEY="your-api-key"
```

```bash
curl "https://api.8004.dev/api/v1/agents" \
  -H "X-API-Key: $API_8004_KEY"
```

### Rotate Regularly

Request new API keys periodically and rotate old ones.

### Monitor Usage

Check response headers for rate limit status:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 295
X-RateLimit-Reset: 1704067200
```

## Getting an API Key

To request an API key:

1. Contact us at [hello@8004.dev](mailto:hello@8004.dev)
2. Describe your use case
3. We'll provision a key within 24 hours

::: tip Enterprise
For high-volume or enterprise use cases, contact us to discuss custom rate limits and SLAs.
:::
