# API Reference

The 8004 API provides a comprehensive set of endpoints for discovering, evaluating, and composing AI agents on blockchain.

## Base URL

```
https://api.8004.dev/api/v1
```

## Authentication

Most endpoints require an API key. Include it in the `X-API-Key` header:

```bash
curl "https://api.8004.dev/api/v1/agents" \
  -H "X-API-Key: your-api-key"
```

See [Authentication](/guide/authentication) for details.

## Endpoints Overview

### Core Endpoints

| Endpoint | Description |
|----------|-------------|
| [Agents](/api/agents) | List, filter, and get agent details |
| [Search](/api/search) | Semantic search across all agents |
| [Classification](/api/classification) | OASF skill/domain classification |
| [Reputation](/api/reputation) | Agent feedback and reputation scores |

### Agent Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents` | List agents with 27+ filters |
| GET | `/api/v1/agents/batch` | Batch fetch multiple agents |
| GET | `/api/v1/agents/:agentId` | Get single agent details |
| GET | `/api/v1/agents/:agentId/similar` | Find similar agents |
| GET | `/api/v1/agents/:agentId/complementary` | Find complementary agents |
| GET | `/api/v1/agents/:agentId/compatible` | Find I/O compatible agents |

### Agent Evaluation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents/:agentId/health` | Agent health status |
| GET | `/api/v1/agents/:agentId/evaluations` | Evaluation history |
| GET | `/api/v1/agents/:agentId/verification` | Verification status |
| GET | `/api/v1/agents/:agentId/reputation` | Reputation and feedback |
| GET | `/api/v1/agents/:agentId/reputation/history` | Reputation over time |
| GET | `/api/v1/agents/:agentId/reputation/feedback` | Feedback list |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/search` | Semantic vector search |
| POST | `/api/v1/search/stream` | Streaming search via SSE |
| GET | `/api/v1/search/stream/info` | Streaming endpoint info |

### Classification

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents/:agentId/classify` | Get OASF classification |
| POST | `/api/v1/agents/:agentId/classify` | Request classification |

### Advanced Features

| Endpoint | Description |
|----------|-------------|
| [Evaluate](/api/evaluate) | Registry-as-Evaluator for testing agents |
| [Compose](/api/compose) | Build teams of complementary agents |
| [Intents](/api/intents) | Intent templates for multi-agent workflows |
| [Events](/api/events) | Real-time updates via SSE |

### Reputation & Leaderboard

| Endpoint | Description |
|----------|-------------|
| [Feedbacks](/api/feedbacks) | Global feedback list across all agents |
| [Leaderboard](/api/leaderboard) | Agents ranked by reputation score |

### Platform Management

| Endpoint | Description |
|----------|-------------|
| [API Keys](/api/keys) | Manage API keys and quotas |
| [Analytics](/api/analytics) | Platform metrics and usage statistics |

### Data Endpoints

| Endpoint | Description |
|----------|-------------|
| [Chains](/api/chains) | Per-chain statistics |
| [Stats](/api/stats) | Platform-wide statistics |
| [Taxonomy](/api/taxonomy) | OASF taxonomy tree |
| [Health](/api/health) | Service health status |

## Response Format

### Success Response

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

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "requestId": "uuid"
}
```

See [Error Handling](/guide/error-handling) for error codes.

## Common Parameters

### Pagination

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Results per page (1-100) |
| `page` | integer | 1 | Page number (offset pagination) |
| `cursor` | string | - | Cursor for cursor-based pagination |

### Filtering

| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | integer | Filter by single chain |
| `chainIds` | integer[] | Filter by multiple chains |
| `mcp` | boolean | Filter by MCP support |
| `a2a` | boolean | Filter by A2A support |
| `active` | boolean | Filter by active status |
| `hasRegistrationFile` | boolean | Filter by registration file |

### Sorting

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sort` | string | relevance | Sort field |
| `order` | string | desc | Sort order (asc/desc) |

## Supported Chains

| Chain | Chain ID | Network |
|-------|----------|---------|
| Ethereum Sepolia | 11155111 | Testnet |
| Base Sepolia | 84532 | Testnet |
| Polygon Amoy | 80002 | Testnet |
| Linea Sepolia | 59141 | Testnet |
| Hedera Testnet | 296 | Testnet |
| HyperEVM Testnet | 998 | Testnet |
| SKALE | 1351057110 | Testnet |

## Rate Limits

| Tier | Limit |
|------|-------|
| Anonymous | 60 req/min |
| With API Key | 300 req/min |
| Classification | 100 req/min |
| Evaluation | 30 req/min |

See [Rate Limiting](/guide/rate-limiting) for details.

## Reputation Scores

All reputation scores use a **0-100 scale**:

| Range | Category | Description |
|-------|----------|-------------|
| 0-33 | Low | Poor experience |
| 34-66 | Medium | Average experience |
| 67-100 | High | Excellent experience |

Filter agents by reputation using `minRep` and `maxRep` parameters.
