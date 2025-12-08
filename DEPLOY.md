# Deployment Guide

This guide covers deploying 8004-backend to Cloudflare Workers.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- API keys for external services

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

## Step 2: Set Secrets

Set required secrets using Wrangler:

```bash
# Claude API key for OASF classification
wrangler secret put ANTHROPIC_API_KEY
# Enter: sk-ant-api03-xxxxx

# Search service URL
wrangler secret put SEARCH_SERVICE_URL
# Enter: https://your-search-service.workers.dev

# RPC URLs for blockchain access
wrangler secret put SEPOLIA_RPC_URL
# Enter: https://eth-sepolia.g.alchemy.com/v2/your-key

wrangler secret put BASE_SEPOLIA_RPC_URL
# Enter: https://base-sepolia.g.alchemy.com/v2/your-key

wrangler secret put POLYGON_AMOY_RPC_URL
# Enter: https://polygon-amoy.g.alchemy.com/v2/your-key
```

## Step 3: Run Migrations

```bash
# Run migrations on production database
wrangler d1 execute 8004-backend-db --file=./migrations/0001_init.sql

# Verify tables were created
wrangler d1 execute 8004-backend-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

## Step 4: Deploy

```bash
# Deploy to production
pnpm run deploy

# Or with wrangler directly
wrangler deploy
```

## Step 5: Verify Deployment

```bash
# Check health endpoint
curl https://8004-backend.your-subdomain.workers.dev/api/v1/health

# Expected response:
# {"status":"ok","timestamp":"...","version":"1.0.0","services":{...}}
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
wrangler d1 execute 8004-backend-db --command="SELECT 1"
```

### Secret Issues

```bash
# List secrets (names only)
wrangler secret list

# Delete and re-add a secret
wrangler secret delete ANTHROPIC_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

### Build Issues

```bash
# Clean build
rm -rf dist node_modules
pnpm install
pnpm run build
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
git tag v1.0.0
git push origin v1.0.0
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

For typical usage:

| Service | Estimated Cost |
|---------|----------------|
| Workers | $5/month (Paid plan) |
| D1 | Included |
| KV | Included |
| Queues | ~$0.40/million messages |
| Claude API | ~$0.003/classification |

## Support

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler Docs](https://developers.cloudflare.com/workers/wrangler/)
- [D1 Docs](https://developers.cloudflare.com/d1/)
- [Open an Issue](https://github.com/agent0lab/8004-backend/issues)
