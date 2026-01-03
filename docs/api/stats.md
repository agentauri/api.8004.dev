# Stats

The Stats API provides aggregated platform-wide statistics.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/stats` | Get platform statistics |

## Get Platform Statistics

```
GET /api/v1/stats
```

Retrieve aggregated statistics across all supported blockchains.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/stats" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "totalAgents": 2900,
    "withRegistrationFile": 2330,
    "activeAgents": 2037,
    "chainBreakdown": [
      {
        "chainId": 11155111,
        "name": "Sepolia",
        "network": "testnet",
        "totalCount": 1500,
        "withRegistrationFileCount": 1200,
        "activeCount": 1050,
        "status": "ok"
      },
      {
        "chainId": 84532,
        "name": "Base Sepolia",
        "network": "testnet",
        "totalCount": 800,
        "withRegistrationFileCount": 650,
        "activeCount": 580,
        "status": "ok"
      },
      {
        "chainId": 80002,
        "name": "Polygon Amoy",
        "network": "testnet",
        "totalCount": 350,
        "withRegistrationFileCount": 280,
        "activeCount": 240,
        "status": "ok"
      },
      {
        "chainId": 59141,
        "name": "Linea Sepolia",
        "network": "testnet",
        "totalCount": 150,
        "withRegistrationFileCount": 120,
        "activeCount": 100,
        "status": "ok"
      },
      {
        "chainId": 296,
        "name": "Hedera Testnet",
        "network": "testnet",
        "totalCount": 50,
        "withRegistrationFileCount": 40,
        "activeCount": 35,
        "status": "ok"
      },
      {
        "chainId": 998,
        "name": "HyperEVM Testnet",
        "network": "testnet",
        "totalCount": 30,
        "withRegistrationFileCount": 25,
        "activeCount": 20,
        "status": "ok"
      },
      {
        "chainId": 1351057110,
        "name": "SKALE",
        "network": "testnet",
        "totalCount": 20,
        "withRegistrationFileCount": 15,
        "activeCount": 12,
        "status": "ok"
      }
    ]
  }
}
```

---

## Response Fields

### Top-Level Statistics

| Field | Type | Description |
|-------|------|-------------|
| `totalAgents` | integer | Total agents across all chains |
| `withRegistrationFile` | integer | Agents with metadata files |
| `activeAgents` | integer | Currently active agents |
| `chainBreakdown` | array | Per-chain statistics |

### Chain Breakdown

| Field | Type | Description |
|-------|------|-------------|
| `chainId` | integer | Chain identifier |
| `name` | string | Chain name |
| `network` | string | Network type |
| `totalCount` | integer | Total agents on chain |
| `withRegistrationFileCount` | integer | Agents with metadata |
| `activeCount` | integer | Active agents |
| `status` | string | Query status |

---

## Caching

Platform statistics are cached for 15 minutes to reduce load on blockchain subgraphs.

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
