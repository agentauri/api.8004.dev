# 8004-backend

[![CI](https://github.com/agent0lab/8004-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/agent0lab/8004-backend/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/agent0lab/8004-backend/branch/main/graph/badge.svg)](https://codecov.io/gh/agent0lab/8004-backend)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Backend service for [8004.dev](https://8004.dev) - the ERC-8004 Agent Explorer.

## Overview

8004-backend provides a unified REST API that aggregates data from multiple sources:

- **Agent Data**: On-chain agent data from ERC-8004 contracts via [agent0-sdk](https://github.com/agent0lab/agent0-ts)
- **Semantic Search**: Natural language search via [search-service](https://github.com/agent0lab/search-service)
- **OASF Classification**: AI-powered classification using [OASF taxonomy](https://docs.agntcy.org/oasf/)

## Features

- RESTful API with OpenAPI specification
- **MCP Server** for AI assistant integration (Claude, ChatGPT, etc.)
- Semantic search for agents
- OASF skill and domain classification
- Multi-chain support (Ethereum Sepolia, Base Sepolia, Polygon Amoy)
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
| POST | `/api/v1/search` | Semantic search |
| GET | `/api/v1/chains` | Chain statistics |
| GET | `/api/v1/stats` | Platform statistics |
| GET | `/api/v1/taxonomy` | OASF taxonomy tree |
| GET | `/api/v1/openapi` | OpenAPI specification |

### Example Requests

```bash
# List agents
curl https://api.8004.dev/api/v1/agents

# Search agents
curl -X POST https://api.8004.dev/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "trading agent"}'

# Get agent details
curl https://api.8004.dev/api/v1/agents/11155111:1
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

### Example MCP Request

```bash
# Initialize connection
curl -X POST https://api.8004.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

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
| Database | Cloudflare D1 |
| Cache | Cloudflare KV |
| Queue | Cloudflare Queues |
| LLM | Gemini API (Google) + Claude API (Anthropic) |

## Deployment

See [DEPLOY.md](./DEPLOY.md) for detailed deployment instructions.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Related Projects

- [8004.dev](https://github.com/agent0lab/8004.dev) - Frontend explorer
- [agent0-ts](https://github.com/agent0lab/agent0-ts) - TypeScript SDK
- [search-service](https://github.com/agent0lab/search-service) - Semantic search
- [OASF](https://github.com/agntcy/oasf) - Open Agentic Schema Framework
