# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-12-08

### Added

- Initial release
- REST API with Hono.js on Cloudflare Workers
- Agent listing and detail endpoints (`/api/v1/agents`)
- Semantic search endpoint (`/api/v1/search`)
- OASF classification endpoints (`/api/v1/agents/:id/classify`)
- Chain statistics endpoint (`/api/v1/chains`)
- Taxonomy endpoint (`/api/v1/taxonomy`)
- Health check endpoint (`/api/v1/health`)
- Multi-chain support (Ethereum Sepolia, Base Sepolia, Polygon Amoy)
- Integration with agent0-sdk for on-chain data
- Integration with search-service for semantic search
- OASF classification with Claude API
- D1 database for classification storage
- KV cache for response caching
- Queues for async classification processing
- Rate limiting (60 req/min anonymous, 300 req/min with API key)
- 100% test coverage with Vitest
- CI/CD with GitHub Actions
- Cloudflare Workers deployment

### Security

- Input validation with Zod
- Security headers middleware
- CORS configuration
- Rate limiting protection

[Unreleased]: https://github.com/agent0lab/8004-backend/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/agent0lab/8004-backend/releases/tag/v1.0.0
