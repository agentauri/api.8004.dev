# Deployment Guide

Deploy the 8004 API to Cloudflare Workers.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare account](https://dash.cloudflare.com/)
- [Qdrant Cloud account](https://cloud.qdrant.io/)
- [Venice AI account](https://venice.ai/) (for embeddings)

## Quick Deploy

```bash
# Login to Cloudflare
wrangler login

# Deploy
pnpm run deploy
```

## Initial Setup

### 1. Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create 8004-backend-db

# Create KV namespace
wrangler kv:namespace create CACHE

# Create Queue
wrangler queues create classification-jobs
```

Update `wrangler.toml` with the IDs from the output.

### 2. Qdrant Cloud

1. Create a cluster at [cloud.qdrant.io](https://cloud.qdrant.io)
2. Create an API key with read/write access
3. Note your cluster URL

### 3. Venice AI

1. Get an API key from [venice.ai](https://venice.ai)
2. Verify `text-embedding-bge-m3` model is available

### 4. Set Secrets

```bash
# LLM Classification
wrangler secret put GOOGLE_AI_API_KEY
wrangler secret put ANTHROPIC_API_KEY

# Blockchain RPC
wrangler secret put SEPOLIA_RPC_URL
wrangler secret put BASE_SEPOLIA_RPC_URL
wrangler secret put POLYGON_AMOY_RPC_URL

# Qdrant
wrangler secret put QDRANT_URL
wrangler secret put QDRANT_API_KEY

# Venice AI
wrangler secret put VENICE_API_KEY

# The Graph (optional)
wrangler secret put GRAPH_API_KEY
```

### 5. Run Migrations

```bash
wrangler d1 execute 8004-backend-db --file=./migrations/0001_init.sql --remote
wrangler d1 execute 8004-backend-db --file=./migrations/0002_reputation.sql --remote
wrangler d1 execute 8004-backend-db --file=./migrations/0003_performance_indexes.sql --remote
wrangler d1 execute 8004-backend-db --file=./migrations/0004_oasf_taxonomy_reset.sql --remote
wrangler d1 execute 8004-backend-db --file=./migrations/0005_reliability.sql --remote
wrangler d1 execute 8004-backend-db --file=./migrations/0006_trust_graph.sql --remote
wrangler d1 execute 8004-backend-db --file=./migrations/0007_intent_templates.sql --remote
```

### 6. Deploy

```bash
pnpm run deploy
```

### 7. Verify

```bash
# Health check
curl https://your-worker.workers.dev/api/v1/health

# Test search
curl "https://your-worker.workers.dev/api/v1/agents?limit=5" \
  -H "X-API-Key: your-api-key"
```

## Custom Domain

### Via Dashboard

1. Workers & Pages → your worker → Settings → Triggers
2. Click "Add Custom Domain"
3. Enter your domain (e.g., `api.8004.dev`)

### Via wrangler.toml

```toml
routes = [
  { pattern = "api.8004.dev", custom_domain = true }
]
```

## Environment-Specific Deployment

### Staging

```bash
wrangler deploy --env staging
```

Configure staging in `wrangler.toml`:

```toml
[env.staging]
name = "8004-backend-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "8004-backend-db-staging"
database_id = "staging-db-id"
```

### Production

```bash
wrangler deploy
```

## CI/CD

### GitHub Secrets

Set these in your repository:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |

### Automatic Deployment

Deploy on version tags:

```bash
git tag v2.0.0
git push origin v2.0.0
```

## Monitoring

### Logs

```bash
# Real-time logs
wrangler tail

# Filter errors
wrangler tail --status error
```

### Metrics

View in Cloudflare Dashboard:
- Workers & Pages → your worker → Metrics

### Qdrant Status

```bash
curl "https://your-cluster.qdrant.io/collections/agents" \
  -H "api-key: your-qdrant-api-key"
```

## Rollback

```bash
# List deployments
wrangler deployments list

# Rollback to previous
wrangler rollback
```

## Troubleshooting

### Database Issues

```bash
wrangler d1 execute 8004-backend-db --remote --command="SELECT 1"
```

### Secret Issues

```bash
wrangler secret list
wrangler secret delete SECRET_NAME
wrangler secret put SECRET_NAME
```

### Build Issues

```bash
rm -rf dist node_modules
pnpm install
pnpm run build
```

## Resource Limits

| Resource | Free | Paid |
|----------|------|------|
| Requests/day | 100K | Unlimited |
| CPU time | 10ms | 50ms |
| D1 reads/day | 5M | 25B |
| D1 writes/day | 100K | 50M |
| KV reads/day | 100K | Unlimited |

## Cost Estimation

For ~100K requests/day:

| Service | Estimated Cost |
|---------|----------------|
| Workers (Paid) | $5/month |
| D1 | Included |
| KV | Included |
| Queues | ~$0.40/million |
| Qdrant (Free) | $0 (1GB) |
| Venice AI | ~$0.0001/embedding |
| Gemini API | ~$0.0001/classification |

## Related

- [Contributing Guide](/contributing/)
- [Architecture](/contributing/architecture)
- [Testing Guide](/contributing/testing)
