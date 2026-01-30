# Health

The Health API provides service health status and administrative endpoints for system maintenance.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Service health check |
| GET | `/api/v1/health/qdrant` | Qdrant vector DB status |
| POST | `/api/v1/health/sync-eas` | Trigger EAS sync (admin) |
| POST | `/api/v1/health/sync-qdrant` | Trigger Qdrant sync (admin) |
| POST | `/api/v1/health/qdrant/indexes` | Create Qdrant indexes (admin) |

## Health Check

```
GET /api/v1/health
```

Check the health status of all API services. This endpoint does not require authentication.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/health"
```

### Example Response (Healthy)

```json
{
  "status": "ok",
  "timestamp": "2024-01-03T12:00:00.000Z",
  "version": "2.2.0",
  "services": {
    "sdk": "ok",
    "searchService": "ok",
    "classifier": "ok",
    "database": "ok"
  }
}
```

HTTP Status: `200 OK`

### Example Response (Degraded)

```json
{
  "status": "degraded",
  "timestamp": "2024-01-03T12:00:00.000Z",
  "version": "2.2.0",
  "services": {
    "sdk": "ok",
    "searchService": "error",
    "classifier": "ok",
    "database": "ok"
  }
}
```

HTTP Status: `503 Service Unavailable`

### Status Values

| Status | Description |
|--------|-------------|
| `ok` | All services healthy |
| `degraded` | Some services unavailable |
| `down` | Critical services down |

### Service Status Values

| Status | Description |
|--------|-------------|
| `ok` | Service is healthy |
| `error` | Service is unavailable |

---

## Qdrant Status

```
GET /api/v1/health/qdrant
```

Check the status of the Qdrant vector database.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/health/qdrant" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "configured": true,
    "collection": "agents",
    "status": "green",
    "pointsCount": 2900,
    "vectorsCount": 2900
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `configured` | boolean | Qdrant is configured |
| `collection` | string | Collection name |
| `status` | string | Collection status |
| `pointsCount` | integer | Number of points |
| `vectorsCount` | integer | Number of vectors |

---

## Sync EAS Attestations

```
POST /api/v1/health/sync-eas
```

Manually trigger EAS attestation synchronization from all chains. **Admin only.**

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/health/sync-eas" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "11155111": {
      "success": true,
      "attestationsProcessed": 150,
      "newFeedbackCount": 12,
      "error": null
    },
    "84532": {
      "success": true,
      "attestationsProcessed": 75,
      "newFeedbackCount": 5,
      "error": null
    }
  },
  "timestamp": "2024-01-03T12:00:00.000Z"
}
```

---

## Sync Qdrant

```
POST /api/v1/health/sync-qdrant
```

Manually trigger Qdrant vector database synchronization from The Graph subgraph and D1 database. **Admin only.**

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 5000 | Max agents to sync |
| `batchSize` | integer | 10 | Agents per batch |
| `skipD1` | boolean | false | Skip D1 sync |
| `includeAll` | boolean | false | Include agents without metadata |

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/health/sync-qdrant?limit=1000&batchSize=20" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "source": "sdk",
    "options": {
      "limit": 1000,
      "batchSize": 20,
      "skipD1": false,
      "includeAll": false
    },
    "agents": {
      "newAgents": 50,
      "updatedAgents": 120,
      "reembedded": 15,
      "errors": []
    },
    "d1": {
      "classificationsUpdated": 45,
      "reputationUpdated": 30,
      "errors": []
    }
  },
  "timestamp": "2024-01-03T12:00:00.000Z"
}
```

---

## Create Qdrant Indexes

```
POST /api/v1/health/qdrant/indexes
```

Create required payload indexes in Qdrant for filtering. **Admin only.**

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/health/qdrant/indexes" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "message": "Payload indexes created/verified successfully",
  "timestamp": "2024-01-03T12:00:00.000Z"
}
```

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Sync failed |
| 503 | `SERVICE_UNAVAILABLE` | Service down |
