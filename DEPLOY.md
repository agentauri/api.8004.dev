# Deployment Guide

This guide covers deploying 8004-backend to Cloudflare Workers.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Qdrant Cloud account](https://cloud.qdrant.io/)
- [Venice AI account](https://venice.ai/) (for embeddings)
- API keys for LLM classification (Google AI and Anthropic)

## Step 1: Cloudflare Setup

### 1.1 Login to Wrangler

```bash
wrangler login
```

### 1.2 Create D1 Database

```bash
wrangler d1 create 8004-backend-db
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "8004-backend-db"
database_id = "your-database-id-here"
```

### 1.3 Create KV Namespace

```bash
wrangler kv:namespace create CACHE
```

Copy the `id` from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id-here"
```

### 1.4 Create Queue

```bash
wrangler queues create classification-jobs
```

## Step 2: Qdrant Cloud Setup

### 2.1 Create Qdrant Cluster

1. Go to [Qdrant Cloud](https://cloud.qdrant.io/)
2. Create a new cluster (Free tier works for development)
3. Choose a region close to your Cloudflare Workers region
4. Note your cluster URL (e.g., `https://xxx.region.gcp.cloud.qdrant.io`)

### 2.2 Create API Key

1. In Qdrant Cloud, go to Data Access Control
2. Create an API key with read/write access
3. Save the API key securely

### 2.3 Create Collection

The collection is auto-created on first sync, but you can pre-create it:

```bash
curl -X PUT "https://your-cluster.region.gcp.cloud.qdrant.io/collections/agents" \
  -H "api-key: your-qdrant-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 1024,
      "distance": "Cosine"
    }
  }'
```

## Step 3: Venice AI Setup (Embeddings)

### 3.1 Get Venice API Key

1. Go to [Venice AI](https://venice.ai/)
2. Create an account or sign in
3. Navigate to API settings
4. Generate an API key

### 3.2 Verify Embedding Model

The service uses `text-embedding-bge-m3` model with 1024 dimensions. Verify it's available:

```bash
curl "https://api.venice.ai/api/v1/models" \
  -H "Authorization: Bearer your-venice-api-key"
```

## Step 4: Set Secrets

Set all required secrets using Wrangler:

```bash
# LLM Classification
wrangler secret put GOOGLE_AI_API_KEY
# Enter: AIza...

wrangler secret put ANTHROPIC_API_KEY
# Enter: sk-ant-api03-xxxxx

# Search service (legacy fallback)
wrangler secret put SEARCH_SERVICE_URL
# Enter: https://your-search-service.workers.dev

# Blockchain RPC URLs
wrangler secret put SEPOLIA_RPC_URL
# Enter: https://eth-sepolia.g.alchemy.com/v2/your-key

wrangler secret put BASE_SEPOLIA_RPC_URL
# Enter: https://base-sepolia.g.alchemy.com/v2/your-key

wrangler secret put POLYGON_AMOY_RPC_URL
# Enter: https://polygon-amoy.g.alchemy.com/v2/your-key

# Qdrant Cloud
wrangler secret put QDRANT_URL
# Enter: https://your-cluster.region.gcp.cloud.qdrant.io

wrangler secret put QDRANT_API_KEY
# Enter: your-qdrant-api-key

# Venice AI
wrangler secret put VENICE_API_KEY
# Enter: your-venice-api-key

# The Graph (optional, for subgraph queries)
wrangler secret put GRAPH_API_KEY
# Enter: your-graph-api-key
```

## Step 5: Run Migrations

Run all database migrations in order:

```bash
# Core tables
wrangler d1 execute 8004-backend-db --file=./migrations/0001_init.sql --remote

# Reputation system
wrangler d1 execute 8004-backend-db --file=./migrations/0002_reputation.sql --remote

# Performance indexes
wrangler d1 execute 8004-backend-db --file=./migrations/0003_performance_indexes.sql --remote

# OASF taxonomy
wrangler d1 execute 8004-backend-db --file=./migrations/0004_oasf_taxonomy_reset.sql --remote

# Reliability tracking
wrangler d1 execute 8004-backend-db --file=./migrations/0005_reliability.sql --remote

# Trust graph
wrangler d1 execute 8004-backend-db --file=./migrations/0006_trust_graph.sql --remote

# Intent templates
wrangler d1 execute 8004-backend-db --file=./migrations/0007_intent_templates.sql --remote

# Verify tables were created
wrangler d1 execute 8004-backend-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected tables:
- `agent_classifications`
- `agent_feedback`
- `agent_reliability`
- `agent_reputation`
- `agent_trust_scores`
- `classification_queue`
- `eas_sync_state`
- `intent_template_steps`
- `intent_templates`
- `trust_edges`
- `trust_graph_state`
- `wallet_trust_scores`

## Step 6: Deploy

```bash
# Deploy to production
pnpm run deploy

# Or with wrangler directly
wrangler deploy
```

## Step 7: Verify Deployment

```bash
# Check health endpoint
curl https://api.8004.dev/api/v1/health

# Expected response:
# {"status":"ok","timestamp":"...","version":"2.0.0","services":{...}}

# Test agent search (requires API key)
curl "https://api.8004.dev/api/v1/agents?limit=5" \
  -H "X-API-Key: your-api-key"

# Test MCP endpoint (public)
curl -X POST "https://api.8004.dev/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Step 8: Initial Data Sync

The scheduled cron jobs will sync data automatically, but you can trigger manually:

```bash
# Trigger sync via scheduled event (not directly callable)
# The system syncs every 15 minutes automatically

# Check Qdrant collection status
curl "https://your-cluster.region.gcp.cloud.qdrant.io/collections/agents" \
  -H "api-key: your-qdrant-api-key"
```

## Custom Domain Setup

### Option 1: Cloudflare Dashboard

1. Go to Workers & Pages > your worker > Settings > Triggers
2. Click "Add Custom Domain"
3. Enter your domain (e.g., `api.8004.dev`)
4. Cloudflare will configure DNS automatically

### Option 2: Manual DNS

1. Add a CNAME record pointing to your worker:
   ```
   api.8004.dev CNAME 8004-backend.your-subdomain.workers.dev
   ```

2. Add the route in `wrangler.toml`:
   ```toml
   routes = [
     { pattern = "api.8004.dev", custom_domain = true }
   ]
   ```

3. Redeploy: `pnpm run deploy`

## Environment-Specific Deployments

### Staging

```bash
# Deploy to staging
wrangler deploy --env staging
```

Update `wrangler.toml` staging section with staging resources:

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
# Deploy to production (default)
wrangler deploy
```

## Monitoring

### Logs

```bash
# Tail production logs
wrangler tail

# Filter by status
wrangler tail --status error
```

### Metrics

View metrics in Cloudflare Dashboard:
- Workers & Pages > your worker > Metrics
- Requests, errors, CPU time, duration

### Qdrant Monitoring

```bash
# Collection info
curl "https://your-cluster.region.gcp.cloud.qdrant.io/collections/agents" \
  -H "api-key: your-qdrant-api-key"

# Check point count
curl "https://your-cluster.region.gcp.cloud.qdrant.io/collections/agents/points/count" \
  -H "api-key: your-qdrant-api-key"
```

## Rollback

```bash
# List deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback
```

## Troubleshooting

### Database Connection Issues

```bash
# Test database connection
wrangler d1 execute 8004-backend-db --remote --command="SELECT 1"
```

### Qdrant Connection Issues

```bash
# Test Qdrant connection
curl "https://your-cluster.region.gcp.cloud.qdrant.io/collections" \
  -H "api-key: your-qdrant-api-key"
```

### Secret Issues

```bash
# List secrets (names only)
wrangler secret list

# Delete and re-add a secret
wrangler secret delete QDRANT_API_KEY
wrangler secret put QDRANT_API_KEY
```

### Build Issues

```bash
# Clean build
rm -rf dist node_modules
pnpm install
pnpm run build
```

### Embedding Issues

```bash
# Test Venice AI embeddings
curl -X POST "https://api.venice.ai/api/v1/embeddings" \
  -H "Authorization: Bearer your-venice-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-bge-m3",
    "input": "test embedding"
  }'
```

## CI/CD Deployment

For automated deployments, set these GitHub secrets:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

The release workflow automatically deploys on version tags:

```bash
# Create and push a version tag
git tag v2.0.0
git push origin v2.0.0
```

## Resource Limits

| Resource | Free | Paid |
|----------|------|------|
| Requests/day | 100,000 | Unlimited |
| CPU time | 10ms | 50ms |
| D1 reads/day | 5M | 25B |
| D1 writes/day | 100K | 50M |
| KV reads/day | 100K | Unlimited |
| KV writes/day | 1K | Unlimited |

## Cost Estimation

For typical usage (~100K requests/day):

| Service | Estimated Cost |
|---------|----------------|
| Cloudflare Workers | $5/month (Paid plan) |
| D1 | Included |
| KV | Included |
| Queues | ~$0.40/million messages |
| Qdrant Cloud (Free) | $0 (1GB storage) |
| Qdrant Cloud (Pro) | $25+/month |
| Venice AI | ~$0.0001/embedding |
| Gemini API | ~$0.0001/classification |
| Claude API | ~$0.003/classification (fallback) |

## Support

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler Docs](https://developers.cloudflare.com/workers/wrangler/)
- [D1 Docs](https://developers.cloudflare.com/d1/)
- [Qdrant Docs](https://qdrant.tech/documentation/)
- [Venice AI Docs](https://docs.venice.ai/)
- [Open an Issue](https://github.com/agent0lab/8004-backend/issues)
