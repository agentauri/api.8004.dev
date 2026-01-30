# Chains

The Chains API provides statistics for each supported blockchain network.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/chains` | Get per-chain statistics |

## Get Chain Statistics

```
GET /api/v1/chains
```

Retrieve agent counts and status for each supported blockchain.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/chains" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": [
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
```

---

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `chainId` | integer | Unique chain identifier |
| `name` | string | Human-readable chain name |
| `network` | string | Network type (testnet/mainnet) |
| `totalCount` | integer | Total registered agents |
| `withRegistrationFileCount` | integer | Agents with metadata files |
| `activeCount` | integer | Currently active agents |
| `status` | string | Chain query status |

### Status Values

| Status | Description |
|--------|-------------|
| `ok` | Chain data fetched successfully |
| `error` | Failed to fetch chain data |
| `cached` | Using cached fallback data |

---

## Supported Chains

| Chain | Chain ID | Network | Explorer |
|-------|----------|---------|----------|
| Ethereum | 1 | Mainnet | [Etherscan](https://etherscan.io) |
| Ethereum Sepolia | 11155111 | Testnet | [Sepolia Etherscan](https://sepolia.etherscan.io) |
| Base Sepolia | 84532 | Testnet | [Base Sepolia](https://sepolia.basescan.org) |
| Polygon Amoy | 80002 | Testnet | [Amoy Polygonscan](https://amoy.polygonscan.com) |
| Linea Sepolia | 59141 | Testnet | [Linea Explorer](https://sepolia.lineascan.build) |
| Hedera Testnet | 296 | Testnet | [Hedera Explorer](https://hashscan.io/testnet) |
| HyperEVM Testnet | 998 | Testnet | - |
| SKALE | 1351057110 | Testnet | [SKALE Explorer](https://elated-tan-skat.explorer.mainnet.skalenodes.com) |

---

## Caching

Chain statistics are cached for 15 minutes. When a chain's subgraph is unavailable:

1. The API attempts to use cached fallback data
2. If fallback exists, `status` is set to `cached`
3. If no fallback exists, `status` is set to `error`

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 503 | `SERVICE_UNAVAILABLE` | All chains unavailable |
