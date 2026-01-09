# 8004-backend

[![CI](https://github.com/agent0lab/8004-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/agent0lab/8004-backend/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/agent0lab/8004-backend/branch/main/graph/badge.svg)](https://codecov.io/gh/agent0lab/8004-backend)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Backend service for [8004.dev](https://8004.dev) - the ERC-8004 Agent Explorer.

## Overview

8004-backend provides a unified REST API for the ERC-8004 agent ecosystem:

- **Agent Discovery**: Semantic search powered by Qdrant Cloud + Venice AI embeddings
- **Agent Data**: On-chain data aggregated from multiple blockchains via [agent0-sdk](https://github.com/agent0lab/agent0-ts)
- **OASF Classification**: AI-powered skill/domain classification using [OASF taxonomy](https://docs.agntcy.org/oasf/)
- **Trust & Reputation**: Aggregated reputation from EAS attestations and on-chain feedback
- **Multi-Agent Workflows**: Intent templates for orchestrating agent pipelines

## Features

- RESTful API with OpenAPI specification
- **MCP Server** for AI assistant integration (Claude, Cursor, etc.)
- Semantic search with 27+ native filters
- OASF skill and domain classification
- Trust Graph with PageRank scoring
- Intent Templates for multi-agent orchestration
- I/O compatibility matching for agent discovery
- Multi-chain support (Ethereum Sepolia, Base Sepolia, Polygon Amoy, Linea Sepolia, Hedera Testnet, HyperEVM Testnet, SKALE Base Sepolia)
- Rate limiting and caching
- 70% branch coverage minimum (enforced by CI)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Installation

```bash
git clone https://github.com/agent0lab/8004-backend.git
cd 8004-backend
pnpm install
cp .dev.vars.example .dev.vars
pnpm run dev
```

### Development

```bash
pnpm run dev          # Start development server
pnpm run test         # Run tests
pnpm run test:coverage # Run tests with coverage
pnpm run typecheck    # Type check
pnpm run lint         # Lint
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/agents` | List agents with filters |
| GET | `/api/v1/agents/:agentId` | Get agent details |
| GET | `/api/v1/agents/:agentId/classify` | Get OASF classification |
| POST | `/api/v1/agents/:agentId/classify` | Request classification |
| GET | `/api/v1/agents/:agentId/compatible` | Find I/O compatible agents |
| GET | `/api/v1/agents/:agentId/reputation` | Get agent reputation |
| POST | `/api/v1/search` | Semantic search |
| GET | `/api/v1/chains` | Chain statistics |
| GET | `/api/v1/stats` | Platform statistics |
| GET | `/api/v1/taxonomy` | OASF taxonomy tree |
| GET | `/api/v1/intents` | List intent templates |
| POST | `/api/v1/intents/:id/match` | Match agents to template |
| GET | `/api/v1/events` | Agent lifecycle events |
| POST | `/api/v1/compose` | Multi-agent workflow composition |
| GET | `/api/v1/feedbacks` | List feedbacks |
| GET | `/api/v1/leaderboard` | Agent leaderboard |
| GET | `/api/v1/analytics` | Analytics data |
| POST | `/api/v1/keys` | API key management |
| POST | `/api/v1/webhooks` | Webhook management |
| POST | `/api/v1/verification` | Agent verification |
| GET | `/api/v1/openapi` | OpenAPI specification |

### Example Requests

```bash
# List agents with filters
curl "https://api.8004.dev/api/v1/agents?mcp=true&limit=10" \
  -H "X-API-Key: your-key"

# Semantic search
curl -X POST https://api.8004.dev/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"query": "trading agent with data analysis"}'

# Get agent details
curl "https://api.8004.dev/api/v1/agents/11155111:123" \
  -H "X-API-Key: your-key"

# Find compatible agents
curl "https://api.8004.dev/api/v1/agents/11155111:123/compatible" \
  -H "X-API-Key: your-key"
```

## MCP Server

The API also exposes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server, allowing AI assistants like Claude to interact with agent data directly.

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /mcp` | Server info and capabilities |
| `POST /mcp` | JSON-RPC 2.0 endpoint |
| `GET /sse` | Server-Sent Events stream |

### Available Tools

| Tool | Description |
|------|-------------|
| `search_agents` | Semantic search for agents by name, description, or capabilities |
| `get_agent` | Get detailed information about a specific agent |
| `list_agents` | List agents with optional filters (chain, MCP, A2A, skills, domains) |
| `get_chain_stats` | Get statistics for all supported blockchain networks |

### Available Resources

| URI | Description |
|-----|-------------|
| `8004://taxonomy/skills` | OASF skills taxonomy (136 skills) |
| `8004://taxonomy/domains` | OASF domains taxonomy (204 domains) |
| `8004://stats/chains` | Chain statistics |

### Available Prompts

| Prompt | Description |
|--------|-------------|
| `find_agent_for_task` | Help find the right agent for a specific task |
| `explore_domain` | Explore agents in a specific domain |

### Connect with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "8004-agents": {
      "command": "npx",
      "args": ["mcp-remote", "https://api.8004.dev/sse"]
    }
  }
}
```

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### Connect with Claude Code CLI

```bash
claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse
```

### Example MCP Request

```bash
# List available tools
curl -X POST https://api.8004.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Search for agents
curl -X POST https://api.8004.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_agents","arguments":{"query":"trading bot","limit":5}}}'
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Cloudflare Workers |
| Framework | Hono.js |
| Vector DB | Qdrant Cloud |
| Embeddings | Venice AI (text-embedding-bge-m3) |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Queue | Cloudflare Queues |
| LLM | Gemini API (primary) + Claude API (fallback) |

## Deployment

See [DEPLOY.md](./DEPLOY.md) for detailed deployment instructions including:
- Cloudflare Workers setup
- Qdrant Cloud configuration
- Venice AI setup
- Database migrations

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Related Projects

- [8004.dev](https://github.com/agent0lab/8004.dev) - Frontend explorer
- [agent0-ts](https://github.com/agent0lab/agent0-ts) - TypeScript SDK
- [OASF](https://github.com/agntcy/oasf) - Open Agentic Schema Framework
