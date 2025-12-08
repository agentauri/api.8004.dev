# AG0 Semantic Search Standard

# Universal Agent Semantic Search API Standard v1.0

## Overview

This standard defines a universal interface for semantic search APIs, enabling hot-swappable providers. Any provider implementing this standard can be used interchangeably with the same client code.

## Base URL Structure

All endpoints should be prefixed with `/api/v{version}/`:

```
https://provider.example.com/api/v1/search
```

## Versioning

- **Path-based versioning**: `/api/v1/`, `/api/v2/`, etc.
- **Header-based versioning** (optional): `X-API-Version: 1`
- Clients should specify the version they support
- Providers must maintain backward compatibility within a major version

---

## Endpoints

### 1. Capabilities Discovery

**Endpoint:** `GET /api/v1/capabilities`

**Purpose:** Discover provider capabilities, limits, and supported features.

**Response:**

```json
{
  "version": "1.0.0",
  "provider": {
    "name": "string",
    "embedding": "string",
    "vectorStore": "string",
    "version": "string"
  },
  "limits": {
    "maxQueryLength": 1000,
    "maxTopK": 100,
    "maxFilters": 50,
    "maxRequestSize": 1048576
  },
  "supportedFilters": [
    "capabilities",
    "chainId",
    "tags",
    "defaultInputMode",
    "defaultOutputMode"
  ],
  "supportedOperators": [
    "equals",
    "in",
    "notIn",
    "range",
    "exists",
    "notExists"
  ],
  "features": {
    "pagination": true,
    "cursorPagination": true,
    "metadataFiltering": true,
    "scoreThreshold": true
  }
}
```

**Status Codes:**
- `200 OK` - Capabilities returned successfully

---

### 2. Health Check

**Endpoint:** `GET /api/v1/health`

**Purpose:** Check service health and availability.

**Response:**

```json
{
  "status": "ok" | "degraded" | "down",
  "timestamp": "2025-12-01T00:00:00.000Z",
  "version": "1.0.0",
  "services": {
    "embedding": "ok" | "error",
    "vectorStore": "ok" | "error"
  },
  "uptime": 3600
}
```

**Status Codes:**
- `200 OK` - Service is healthy
- `503 Service Unavailable` - Service is degraded or down

---

### 3. Search

**Endpoint:** `POST /api/v1/search`

**Purpose:** Perform semantic search query.

**Headers:**

```
Content-Type: application/json
Accept: application/json
X-API-Version: 1 (optional)
X-Request-ID: uuid (optional, for request tracing)
```

**Request Body:**

```json
{
  "query": "string (required)",
  "limit": 10,
  "offset": 0,
  "cursor": "string (optional, for cursor-based pagination)",
  "filters": {
    "equals": {
      "field": "value"
    },
    "in": {
      "field": ["value1", "value2"]
    },
    "notIn": {
      "field": ["value1", "value2"]
    },
    "range": {
      "field": {
        "min": 0,
        "max": 100
      }
    },
    "exists": ["field1", "field2"],
    "notExists": ["field1", "field2"],
    "capabilities": ["defi", "nft"],
    "chainId": 11155111,
    "tags": ["reputation", "crypto-economic"]
  },
  "minScore": 0.0,
  "includeMetadata": true
}
```

**Request Fields:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | Yes | Natural language search query |
| `limit` | number | No | Maximum number of results (default: 10, max: see capabilities) |
| `offset` | number | No | Offset for pagination (default: 0) |
| `cursor` | string | No | Cursor for cursor-based pagination |
| `filters` | object | No | Filter criteria (see Filter Schema) |
| `minScore` | number | No | Minimum similarity score (0.0-1.0) |
| `includeMetadata` | boolean | No | Include full metadata in response (default: true) |

**Response Body:**

```json
{
  "query": "string",
  "results": [
    {
      "rank": 1,
      "vectorId": "string",
      "agentId": "string",
      "chainId": 11155111,
      "name": "string",
      "description": "string",
      "score": 0.95,
      "metadata": {
        "capabilities": ["defi", "trading"],
        "tags": ["reputation"],
        "image": "string",
        "mcp": true,
        "a2a": false,
        "agentURI": "string"
      },
      "matchReasons": ["Excellent semantic match"]
    }
  ],
  "total": 42,
  "pagination": {
    "hasMore": true,
    "nextCursor": "string",
    "limit": 10,
    "offset": 0
  },
  "requestId": "uuid",
  "timestamp": "2025-12-01T00:00:00.000Z",
  "provider": {
    "name": "string",
    "version": "string"
  }
}
```

**Response Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `query` | string | Echo of the search query |
| `results` | array | Array of search results |
| `total` | number | Total number of results available |
| `pagination` | object | Pagination metadata (if applicable) |
| `requestId` | string | Unique request identifier |
| `timestamp` | string | ISO 8601 timestamp of response |
| `provider` | object | Provider metadata |

**Result Object:**

| Field | Type | Description |
| --- | --- | --- |
| `rank` | number | Result rank (1-indexed) |
| `vectorId` | string | Unique vector identifier |
| `agentId` | string | Agent identifier (format: "chainId:tokenId") |
| `chainId` | number | Blockchain network ID |
| `name` | string | Agent name |
| `description` | string | Agent description |
| `score` | number | Similarity score (0.0-1.0) |
| `metadata` | object | Additional metadata (see Metadata Schema) |
| `matchReasons` | array | Array of strings explaining why this result matched |

**Status Codes:**
- `200 OK` - Search completed successfully
- `400 Bad Request` - Invalid request (see Error Response)
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

---

## Filter Schema

Filters support both standard operators and domain-specific filters.

### Standard Operators

**equals:** Exact match

```json
{
  "filters": {
    "equals": {
      "status": "active",
      "type": "agent"
    }
  }
}
```

**in:** Match any value in array

```json
{
  "filters": {
    "in": {
      "chainId": [11155111, 84532],
      "capabilities": ["defi", "nft"]
    }
  }
}
```

**notIn:** Exclude values in array

```json
{
  "filters": {
    "notIn": {
      "chainId": [80002]
    }
  }
}
```

**range:** Numeric range

```json
{
  "filters": {
    "range": {
      "score": {
        "min": 0.5,
        "max": 1.0
      },
      "chainId": {
        "min": 1,
        "max": 1000
      }
    }
  }
}
```

**exists:** Field must exist (not null/undefined)

```json
{
  "filters": {
    "exists": ["agentURI", "image", "description"]
  }
}
```

**notExists:** Field must not exist

```json
{
  "filters": {
    "notExists": ["deprecated"]
  }
}
```

### Domain-Specific Filters

For ERC-8004 agent search:

```json
{
  "filters": {
    "capabilities": ["defi", "nft", "gaming"],
    "chainId": 11155111,
    "tags": ["reputation", "crypto-economic"],
    "defaultInputMode": "text",
    "defaultOutputMode": "json"
  }
}
```

**Note:** Domain-specific filters may vary by provider. Check `/api/v1/capabilities` for supported filters.

---

## Metadata Schema

Standard metadata fields for search results:

```json
{
  "metadata": {
    "capabilities": ["defi", "trading"],
    "tags": ["reputation", "crypto-economic"],
    "image": "https://example.com/image.png",
    "mcp": true,
    "a2a": false,
    "agentURI": "ipfs://...",
    "active": true,
    "x402support": true,
    "defaultInputModes": ["text", "json"],
    "defaultOutputModes": ["json"]
  }
}
```

Providers may include additional metadata fields. Clients should handle unknown fields gracefully.

---

## Error Response

All errors follow a standard format:

```json
{
  "error": "string",
  "code": "VALIDATION_ERROR" | "RATE_LIMIT_EXCEEDED" | "INTERNAL_ERROR" | "BAD_REQUEST" | "NOT_FOUND",
  "status": 400,
  "requestId": "uuid",
  "timestamp": "2025-12-01T00:00:00.000Z"
}
```

**Error Codes:**

| Code | HTTP Status | Description |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `BAD_REQUEST` | 400 | Malformed request |
| `NOT_FOUND` | 404 | Resource not found |

---

## Rate Limiting

Rate limits are communicated via response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

When rate limit is exceeded:
- Status: `429 Too Many Requests`
- Header: `Retry-After: 60` (seconds until retry)
- Body: Standard error response with `RATE_LIMIT_EXCEEDED` code

---

## Pagination

Two pagination methods are supported:

### Offset-based Pagination

```json
{
  "limit": 10,
  "offset": 0
}
```

Response includes:

```json
{
  "pagination": {
    "hasMore": true,
    "limit": 10,
    "offset": 0
  }
}
```

### Cursor-based Pagination (Preferred)

```json
{
  "limit": 10,
  "cursor": "eyJvZmZzZXQiOjEwfQ"
}
```

Response includes:

```json
{
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJvZmZzZXQiOjIwfQ",
    "limit": 10
  }
}
```

**Note:** Providers may support one or both methods. Check `/api/v1/capabilities` for supported pagination types.

---

## Request Tracing

Clients may include a request ID for tracing:

**Request Header:**
```
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

**Response Header:**
```
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

If no request ID is provided, the provider should generate one.

---

## Security

### CORS

Providers should support CORS for browser-based clients:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-API-Version, X-Request-ID
```

### Security Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

### Authentication

Authentication is provider-specific and not part of this standard.

---

## Implementation Checklist

For a provider to be compliant with this standard:

- [ ] Implement `/api/v1/capabilities` endpoint
- [ ] Implement `/api/v1/health` endpoint
- [ ] Implement `/api/v1/search` endpoint
- [ ] Support versioning in URL path
- [ ] Return standardized error responses
- [ ] Include rate limit headers in responses
- [ ] Support request ID tracing
- [ ] Support at least one pagination method
- [ ] Include provider metadata in responses
- [ ] Support standard filter operators
- [ ] Return standardized metadata schema
- [ ] Include security headers
- [ ] Support CORS

---

## Example Usage

### Basic Search

```bash
curl -X POST https://provider.example.com/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: $(uuidgen)" \
  -d '{
    "query": "AI agent for trading",
    "limit": 10
  }'
```

### Search with Filters

```bash
curl -X POST https://provider.example.com/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "defi agent",
    "limit": 5,
    "filters": {
      "in": {
        "chainId": [11155111, 84532]
      },
      "capabilities": ["defi"],
      "exists": ["agentURI"]
    },
    "minScore": 0.5
  }'
```

### Paginated Search

```bash
curl -X POST https://provider.example.com/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "portfolio management",
    "limit": 20,
    "cursor": "eyJvZmZzZXQiOjIwfQ"
  }'
```

---

## Version History

- **v1.0.0** (2025-12-01) - Initial standard specification

---

## License

This standard is provided as-is for interoperability purposes. Implementations may extend the standard with provider-specific features while maintaining backward compatibility.
