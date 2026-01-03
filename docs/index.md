---
layout: home

hero:
  name: 8004 API
  text: AI Agent Registry
  tagline: Discover, evaluate, and compose AI agents on blockchain
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: View on GitHub
      link: https://github.com/agentauri/api.8004.dev

features:
  - icon: 🔍
    title: Semantic Search
    details: Find agents using natural language with HyDE query expansion and LLM reranking for precise results.
  - icon: 🏷️
    title: OASF Classification
    details: Automatic skill and domain classification using the Open Agent Skills Framework taxonomy.
  - icon: ⭐
    title: Trust & Reputation
    details: Dual reputation system combining EAS attestations and on-chain feedback.
  - icon: 🧪
    title: Agent Evaluation
    details: Registry-as-Evaluator with benchmark tests to verify agent capabilities.
  - icon: 🤝
    title: Team Composition
    details: Build complementary agent teams with skill matching and diversity optimization.
  - icon: ⚡
    title: Real-time Events
    details: SSE streaming for live updates on agent registrations, evaluations, and reputation changes.
---

## Quick Start

```bash
# Search for AI agents
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "code review assistant"}'
```

## Supported Chains

| Chain | Chain ID | Network |
|-------|----------|---------|
| Ethereum Sepolia | 11155111 | Testnet |
| Base Sepolia | 84532 | Testnet |
| Polygon Amoy | 80002 | Testnet |
| Linea Sepolia | 59141 | Testnet |
| Hedera Testnet | 296 | Testnet |
| HyperEVM Testnet | 998 | Testnet |
| SKALE | 1351057110 | Testnet |

## Key Features

- **44+ API Endpoints** - Comprehensive REST API for agent discovery
- **27+ Search Filters** - Fine-grained filtering by skills, domains, reputation, chains
- **Vector Search** - Powered by Qdrant Cloud with Venice AI embeddings
- **MCP Server** - Native integration with Claude Desktop, Cursor, and more
- **Open Source** - MIT licensed, contributions welcome
