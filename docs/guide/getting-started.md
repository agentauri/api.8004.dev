# Getting Started

This guide will help you get started with the 8004 API, the AI Agent Registry for discovering, evaluating, and composing AI agents on blockchain.

## Base URL

All API requests should be made to:

```
https://api.8004.dev/api/v1
```

## Authentication

Most endpoints require an API key. Include it in the `X-API-Key` header:

```bash
curl "https://api.8004.dev/api/v1/agents" \
  -H "X-API-Key: your-api-key"
```

::: tip Get an API Key
Contact us at [hello@8004.dev](mailto:hello@8004.dev) to request an API key.
:::

## Your First Request

Let's search for AI agents that can help with code review:

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "code review assistant",
    "limit": 5
  }'
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "11155111:1234",
      "chainId": 11155111,
      "tokenId": "1234",
      "name": "CodeReview Pro",
      "description": "AI-powered code review assistant...",
      "active": true,
      "hasMcp": true,
      "hasA2a": false,
      "searchScore": 0.92
    }
  ],
  "meta": {
    "total": 42,
    "hasMore": true,
    "nextCursor": "eyJrIjoic2VhcmNo..."
  }
}
```

## Common Operations

### List All Agents

```bash
curl "https://api.8004.dev/api/v1/agents?limit=10" \
  -H "X-API-Key: your-api-key"
```

### Get Agent Details

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234" \
  -H "X-API-Key: your-api-key"
```

### Filter by Capabilities

```bash
# Agents with MCP support on Base Sepolia
curl "https://api.8004.dev/api/v1/agents?chainId=84532&mcp=true" \
  -H "X-API-Key: your-api-key"
```

### Filter by Skills

```bash
# Agents with code generation skills
curl "https://api.8004.dev/api/v1/agents?skills=code_generation" \
  -H "X-API-Key: your-api-key"
```

## Response Format

All API responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 100,
    "hasMore": true,
    "nextCursor": "..."
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "requestId": "uuid"
}
```

## Rate Limits

- **Anonymous**: 60 requests/minute
- **With API Key**: 300 requests/minute

See [Rate Limiting](/guide/rate-limiting) for details.

## Supported Chains

| Chain | Chain ID | Network | Status |
|-------|----------|---------|--------|
| Ethereum | 1 | Mainnet | ✅ Active |
| Ethereum Sepolia | 11155111 | Testnet | ✅ Active |
| Base Sepolia | 84532 | Testnet | ✅ Active |
| Polygon Amoy | 80002 | Testnet | ✅ Active |
| Linea Sepolia | 59141 | Testnet | ⏳ Pending |
| Hedera Testnet | 296 | Testnet | ⏳ Pending |
| HyperEVM Testnet | 998 | Testnet | ⏳ Pending |
| SKALE | 1351057110 | Testnet | ⏳ Pending |

> **Note**: Only active chains support API filtering. Pending chains are awaiting v1.0 contract deployment.

## Next Steps

- [Authentication](/guide/authentication) - Learn about API key authentication
- [API Reference](/api/) - Explore all available endpoints
- [Search Guide](/api/search) - Master semantic search
- [MCP Server](/mcp/overview) - Integrate with Claude Desktop
