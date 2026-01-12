# Deployment Guide

This page provides a quick overview of deployment. For the complete deployment guide with all migrations, troubleshooting steps, and detailed configuration, see the main [DEPLOY.md](/DEPLOY.md) in the repository root.

## Quick Deploy

```bash
# Login to Cloudflare
wrangler login

# Deploy
pnpm run deploy
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare account](https://dash.cloudflare.com/)
- [Qdrant Cloud account](https://cloud.qdrant.io/)
- [Venice AI account](https://venice.ai/) (for embeddings)

## Initial Setup Summary

1. **Create Cloudflare Resources**: D1 database, KV namespace, Queue
2. **Configure Qdrant Cloud**: Create cluster and API key
3. **Set Secrets**: LLM keys, RPC URLs, Qdrant credentials, Venice API key
4. **Run Migrations**: All 20+ migrations (see full guide)
5. **Deploy**: `pnpm run deploy`
6. **Verify**: Test health and search endpoints

## Environment-Specific Deployment

### Staging

```bash
wrangler deploy --env staging
```

### Production

```bash
wrangler deploy
```

## CI/CD

Set these GitHub secrets:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |

Deploy on version tags:

```bash
git tag v2.0.0
git push origin v2.0.0
```

## Monitoring

```bash
# Real-time logs
wrangler tail

# Filter errors
wrangler tail --status error
```

## Rollback

```bash
wrangler deployments list
wrangler rollback
```

## Full Documentation

For complete deployment instructions including:
- All database migrations (20+ files)
- Detailed secret configuration
- Qdrant collection setup
- Venice AI embedding verification
- Custom domain setup
- Troubleshooting guides
- Cost estimation
- Resource limits

See [DEPLOY.md](/DEPLOY.md) in the repository root.

## Related

- [Contributing Guide](/contributing/)
- [Architecture](/contributing/architecture)
- [Testing Guide](/contributing/testing)
