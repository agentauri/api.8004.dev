# API Keys

The API Keys management endpoints allow you to create, manage, and monitor API keys for accessing the 8004.dev platform. API keys support tiered access levels with configurable rate limits, quotas, and permissions.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/keys` | Create a new API key |
| GET | `/api/v1/keys` | List API keys |
| GET | `/api/v1/keys/:id` | Get API key details |
| PATCH | `/api/v1/keys/:id` | Update API key properties |
| DELETE | `/api/v1/keys/:id` | Delete an API key |
| POST | `/api/v1/keys/:id/rotate` | Rotate an API key |
| GET | `/api/v1/keys/:id/usage` | Get usage statistics |

## Authentication

All key management endpoints require an existing API key with appropriate permissions:

- **Create keys**: Requires `admin` permission
- **List/Get/Update/Delete**: Requires `admin` permission OR ownership of the key
- **View usage**: Requires `admin` permission OR ownership of the key

---

## API Key Tiers

| Tier | Rate Limit | Daily Quota | Monthly Quota | Description |
|------|------------|-------------|---------------|-------------|
| `anonymous` | 60 RPM | 1,000 | 10,000 | Basic access, limited features |
| `standard` | 300 RPM | 10,000 | 100,000 | Standard access, full features |
| `premium` | 1,000 RPM | 100,000 | 1,000,000 | High-volume access |

## Permissions

| Permission | Description |
|------------|-------------|
| `read` | Read access to public endpoints |
| `write` | Write access (create/update resources) |
| `classify` | Access to classification endpoints |
| `evaluate` | Access to evaluation endpoints |
| `admin` | Full administrative access |

---

## Create API Key

```
POST /api/v1/keys
```

Create a new API key. Requires `admin` permission.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Key name (1-100 chars) |
| `tier` | string | No | Tier: `anonymous`, `standard`, `premium` (default: `standard`) |
| `rateLimitRpm` | integer | No | Custom rate limit (requests per minute) |
| `owner` | string | No | Owner identifier |
| `permissions` | string[] | No | Permissions array |
| `description` | string | No | Description (max 500 chars) |
| `dailyQuota` | integer | No | Custom daily request quota |
| `monthlyQuota` | integer | No | Custom monthly request quota |
| `expiresAt` | string | No | Expiration date (ISO 8601) |

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/keys" \
  -H "X-API-Key: your-admin-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "tier": "premium",
    "permissions": ["read", "write", "classify"],
    "description": "Main production key for web application",
    "dailyQuota": 50000,
    "monthlyQuota": 500000
  }'
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "key_abc123def456",
    "key": "8004_live_sk_1a2b3c4d5e6f7g8h9i0j...",
    "name": "Production API Key",
    "tier": "premium",
    "rateLimitRpm": 1000,
    "permissions": ["read", "write", "classify"],
    "description": "Main production key for web application",
    "dailyQuota": 50000,
    "monthlyQuota": 500000,
    "expiresAt": null,
    "createdAt": "2024-01-03T12:00:00.000Z"
  },
  "message": "API key created. Save the key securely - it cannot be retrieved again."
}
```

**Important:** The `key` value is only returned once during creation. Store it securely.

---

## List API Keys

```
GET /api/v1/keys
```

List API keys. Admin users see all keys; non-admin users only see their own key.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `owner` | string | - | Filter by owner (admin only) |
| `limit` | integer | 50 | Results per page (1-100) |
| `offset` | integer | 0 | Number of results to skip |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/keys?limit=20" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "key_abc123def456",
      "name": "Production API Key",
      "tier": "premium",
      "rateLimitRpm": 1000,
      "permissions": ["read", "write", "classify"],
      "description": "Main production key",
      "dailyQuota": 50000,
      "monthlyQuota": 500000,
      "dailyUsage": 1250,
      "monthlyUsage": 15000,
      "usageCount": 45000,
      "enabled": true,
      "lastUsedAt": "2024-01-03T11:55:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

---

## Get API Key Details

```
GET /api/v1/keys/:id
```

Get detailed information about a specific API key.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | API key ID |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/keys/key_abc123def456" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "key_abc123def456",
    "name": "Production API Key",
    "tier": "premium",
    "rateLimitRpm": 1000,
    "permissions": ["read", "write", "classify"],
    "description": "Main production key",
    "dailyQuota": 50000,
    "monthlyQuota": 500000,
    "dailyUsage": 1250,
    "monthlyUsage": 15000,
    "usageCount": 45000,
    "enabled": true,
    "owner": "user_123",
    "lastUsedAt": "2024-01-03T11:55:00.000Z",
    "expiresAt": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-03T12:00:00.000Z"
  }
}
```

---

## Update API Key

```
PATCH /api/v1/keys/:id
```

Update API key properties.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | API key ID |

### Request Body

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Key name (1-100 chars) |
| `tier` | string | Tier: `anonymous`, `standard`, `premium` |
| `rateLimitRpm` | integer | Custom rate limit (null to use tier default) |
| `permissions` | string[] | Permissions array |
| `description` | string | Description (null to clear) |
| `dailyQuota` | integer | Daily request quota (null for unlimited) |
| `monthlyQuota` | integer | Monthly request quota (null for unlimited) |
| `expiresAt` | string | Expiration date (null for no expiry) |
| `enabled` | boolean | Enable or disable the key |

### Example Request

```bash
curl -X PATCH "https://api.8004.dev/api/v1/keys/key_abc123def456" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key (Updated)",
    "dailyQuota": 75000,
    "enabled": true
  }'
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "key_abc123def456",
    "name": "Production API Key (Updated)",
    "tier": "premium",
    "rateLimitRpm": 1000,
    "permissions": ["read", "write", "classify"],
    "dailyQuota": 75000,
    "monthlyQuota": 500000,
    "enabled": true,
    "updatedAt": "2024-01-03T12:30:00.000Z"
  }
}
```

---

## Delete API Key

```
DELETE /api/v1/keys/:id
```

Permanently delete an API key.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | API key ID |

### Example Request

```bash
curl -X DELETE "https://api.8004.dev/api/v1/keys/key_abc123def456" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "message": "API key deleted"
}
```

---

## Rotate API Key

```
POST /api/v1/keys/:id/rotate
```

Generate a new API key while invalidating the old one. All other properties are preserved.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | API key ID |

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/keys/key_abc123def456/rotate" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "key_xyz789ghi012",
    "key": "8004_live_sk_new1a2b3c4d5e6f...",
    "name": "Production API Key",
    "tier": "premium",
    "permissions": ["read", "write", "classify"],
    "rotatedFrom": "key_abc123def456",
    "rotatedAt": "2024-01-03T12:45:00.000Z",
    "createdAt": "2024-01-03T12:45:00.000Z"
  },
  "message": "API key rotated. The old key has been disabled. Save the new key securely."
}
```

---

## Get Usage Statistics

```
GET /api/v1/keys/:id/usage
```

Get detailed usage statistics for an API key.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | API key ID |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `day` | Period: `day`, `week`, or `month` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/keys/key_abc123def456/usage?period=week" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "keyId": "key_abc123def456",
    "keyName": "Production API Key",
    "period": "week",
    "currentUsage": {
      "daily": 1250,
      "monthly": 15000,
      "total": 45000
    },
    "quotas": {
      "daily": 50000,
      "monthly": 500000
    },
    "history": [
      {
        "date": "2024-01-03",
        "requests": 1250,
        "errors": 12
      },
      {
        "date": "2024-01-02",
        "requests": 2100,
        "errors": 8
      }
    ]
  }
}
```

---

## Rate Limiting

Key management endpoints have stricter rate limiting:

| Endpoint | Rate Limit |
|----------|------------|
| All `/api/v1/keys/*` endpoints | 10 requests/minute |

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | API key not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |

---

## Best Practices

1. **Use descriptive names** - Name keys by environment/purpose
2. **Set appropriate quotas** - Prevent runaway usage with daily/monthly limits
3. **Rotate regularly** - Rotate keys periodically for security
4. **Use least privilege** - Only grant necessary permissions
5. **Monitor usage** - Check usage statistics regularly
6. **Set expiration** - Use `expiresAt` for temporary access

---

## Related Endpoints

- [Health](/api/health) - Check API status and key validity
