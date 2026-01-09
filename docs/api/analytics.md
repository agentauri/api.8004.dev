# Analytics

The Analytics API provides platform metrics, usage statistics, and historical data for the 8004.dev platform. Use these endpoints to monitor platform health, track usage patterns, and analyze trends.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analytics` | Get analytics summary |
| GET | `/api/v1/analytics/stats` | Get current platform statistics |
| GET | `/api/v1/analytics/filters` | Get popular filter usage |
| GET | `/api/v1/analytics/endpoints` | Get top API endpoint usage |
| GET | `/api/v1/analytics/search` | Get search volume statistics |
| GET | `/api/v1/analytics/chains` | Get activity by chain |
| GET | `/api/v1/analytics/history/:metricType` | Get historical metrics |

## Time Periods

All analytics endpoints support the following time periods:

| Period | Description |
|--------|-------------|
| `hour` | Current hour |
| `day` | Current day (default) |
| `week` | Current week |
| `month` | Current month |

---

## Get Analytics Summary

```
GET /api/v1/analytics
```

Get a comprehensive analytics summary for a time period.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `day` | Time period: `hour`, `day`, `week`, `month` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/analytics?period=day" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "period": "day",
    "periodStart": "2024-01-03 00:00:00",
    "periodEnd": "2024-01-04 00:00:00",
    "platformStats": {
      "totalAgents": 2900,
      "activeAgents": 1800,
      "totalSearches": 15000,
      "totalClassifications": 2500,
      "totalFeedback": 450,
      "chainDistribution": {
        "11155111": 1500,
        "84532": 900,
        "80002": 500
      },
      "protocolAdoption": {
        "mcp": 1200,
        "a2a": 800,
        "x402": 350
      }
    },
    "popularFilters": [
      {
        "filterName": "mcp",
        "filterValue": "true",
        "usageCount": 5200
      },
      {
        "filterName": "chainId",
        "filterValue": "11155111",
        "usageCount": 3100
      }
    ],
    "topEndpoints": [
      {
        "endpoint": "/api/v1/agents",
        "method": "GET",
        "requestCount": 12500,
        "avgLatencyMs": 85,
        "successRate": 0.98
      },
      {
        "endpoint": "/api/v1/search",
        "method": "POST",
        "requestCount": 8200,
        "avgLatencyMs": 210,
        "successRate": 0.97
      }
    ],
    "searchVolume": {
      "total": 8200,
      "avgLatencyMs": 210,
      "avgResultCount": 15.3
    },
    "chainActivity": {
      "11155111": {
        "agents": 150,
        "searches": 5000,
        "feedback": 200
      },
      "84532": {
        "agents": 80,
        "searches": 2500,
        "feedback": 150
      }
    }
  }
}
```

---

## Get Platform Statistics

```
GET /api/v1/analytics/stats
```

Get current platform statistics (totals, not period-based).

### Example Request

```bash
curl "https://api.8004.dev/api/v1/analytics/stats" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "totalAgents": 2900,
    "activeAgents": 1800,
    "totalSearches": 150000,
    "totalClassifications": 25000,
    "totalFeedback": 4500,
    "chainDistribution": {
      "11155111": 1500,
      "84532": 900,
      "80002": 500
    },
    "protocolAdoption": {
      "mcp": 1200,
      "a2a": 800,
      "x402": 350
    }
  }
}
```

---

## Get Popular Filters

```
GET /api/v1/analytics/filters
```

Get the most frequently used query filters.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `day` | Time period |
| `limit` | integer | 20 | Max results (1-100) |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/analytics/filters?period=week&limit=10" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "filterName": "mcp",
      "filterValue": "true",
      "usageCount": 35000
    },
    {
      "filterName": "chainId",
      "filterValue": "11155111",
      "usageCount": 22000
    },
    {
      "filterName": "skills",
      "filterValue": "code_generation",
      "usageCount": 12500
    },
    {
      "filterName": "a2a",
      "filterValue": "true",
      "usageCount": 8900
    }
  ],
  "meta": {
    "period": "week",
    "limit": 10
  }
}
```

---

## Get Top Endpoints

```
GET /api/v1/analytics/endpoints
```

Get API endpoint usage statistics.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `day` | Time period |
| `limit` | integer | 20 | Max results (1-100) |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/analytics/endpoints?period=day&limit=5" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "endpoint": "/api/v1/agents",
      "method": "GET",
      "requestCount": 12500,
      "avgLatencyMs": 85,
      "successRate": 0.98
    },
    {
      "endpoint": "/api/v1/search",
      "method": "POST",
      "requestCount": 8200,
      "avgLatencyMs": 210,
      "successRate": 0.97
    },
    {
      "endpoint": "/api/v1/agents/:agentId",
      "method": "GET",
      "requestCount": 5600,
      "avgLatencyMs": 45,
      "successRate": 0.99
    },
    {
      "endpoint": "/api/v1/agents/:agentId/classify",
      "method": "POST",
      "requestCount": 1200,
      "avgLatencyMs": 1250,
      "successRate": 0.95
    },
    {
      "endpoint": "/api/v1/health",
      "method": "GET",
      "requestCount": 950,
      "avgLatencyMs": 12,
      "successRate": 1.0
    }
  ],
  "meta": {
    "period": "day",
    "limit": 5
  }
}
```

---

## Get Search Volume

```
GET /api/v1/analytics/search
```

Get search query statistics.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `day` | Time period |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/analytics/search?period=week" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "total": 57400,
    "avgLatencyMs": 195,
    "avgResultCount": 14.7
  },
  "meta": {
    "period": "week"
  }
}
```

---

## Get Chain Activity

```
GET /api/v1/analytics/chains
```

Get activity breakdown by blockchain.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `day` | Time period |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/analytics/chains?period=day" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "11155111": {
      "agents": 150,
      "searches": 5000,
      "feedback": 200
    },
    "84532": {
      "agents": 80,
      "searches": 2500,
      "feedback": 150
    },
    "80002": {
      "agents": 45,
      "searches": 700,
      "feedback": 50
    }
  },
  "meta": {
    "period": "day"
  }
}
```

### Chain IDs

| Chain ID | Network |
|----------|---------|
| 11155111 | Ethereum Sepolia |
| 84532 | Base Sepolia |
| 80002 | Polygon Amoy |

---

## Get Historical Metrics

```
GET /api/v1/analytics/history/:metricType
```

Get historical time-series data for a specific metric type.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `metricType` | string | Metric type (see below) |

### Metric Types

| Type | Description |
|------|-------------|
| `agents` | Agent registration metrics |
| `search` | Search query metrics |
| `classification` | OASF classification metrics |
| `feedback` | Feedback submission metrics |
| `api_usage` | API endpoint usage metrics |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `hour` | Aggregation period: `hour`, `day`, `week`, `month` |
| `chainId` | integer | - | Filter by chain ID |
| `startDate` | string | - | Start date (ISO 8601) |
| `endDate` | string | - | End date (ISO 8601) |
| `limit` | integer | 168 | Max data points (1-1000) |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/analytics/history/search?period=hour&limit=24" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "metric_abc123",
      "metricType": "search",
      "period": "hour",
      "periodStart": "2024-01-03 12:00:00",
      "periodEnd": "2024-01-03 13:00:00",
      "chainId": null,
      "data": {
        "total": 450,
        "avgLatencyMs": 185,
        "avgResultCount": 15.2
      },
      "createdAt": "2024-01-03T13:00:00.000Z"
    },
    {
      "id": "metric_def456",
      "metricType": "search",
      "period": "hour",
      "periodStart": "2024-01-03 11:00:00",
      "periodEnd": "2024-01-03 12:00:00",
      "chainId": null,
      "data": {
        "total": 380,
        "avgLatencyMs": 192,
        "avgResultCount": 14.8
      },
      "createdAt": "2024-01-03T12:00:00.000Z"
    }
  ],
  "meta": {
    "metricType": "search",
    "period": "hour",
    "count": 24
  }
}
```

### Example: Agent Metrics by Chain

```bash
curl "https://api.8004.dev/api/v1/analytics/history/agents?period=day&chainId=11155111&limit=30" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "metric_ghi789",
      "metricType": "agents",
      "period": "day",
      "periodStart": "2024-01-03 00:00:00",
      "periodEnd": "2024-01-04 00:00:00",
      "chainId": 11155111,
      "data": {
        "total": 45,
        "mcpEnabled": 32,
        "a2aEnabled": 18
      },
      "createdAt": "2024-01-04T00:00:00.000Z"
    }
  ],
  "meta": {
    "metricType": "agents",
    "period": "day",
    "count": 1
  }
}
```

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid query parameters or metric type |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests (300 requests/minute) |

---

## Caching

Analytics endpoints are cached to improve performance:

| Endpoint | Cache TTL |
|----------|-----------|
| `/analytics` | 5 minutes |
| `/analytics/stats` | 15 minutes |
| `/analytics/filters` | 5 minutes |
| `/analytics/endpoints` | 5 minutes |
| `/analytics/search` | 5 minutes |
| `/analytics/chains` | 5 minutes |
| `/analytics/history/*` | 1 hour |

---

## Related Endpoints

- [Stats](/api/stats) - Simplified platform statistics
- [Health](/api/health) - Platform health status
