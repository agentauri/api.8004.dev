# MCP Server

The 8004 MCP Server enables AI assistants like Claude Desktop, Claude Code, and Cursor to interact with the AI agent registry using the Model Context Protocol (MCP).

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard that allows AI assistants to connect to external data sources and tools. With the 8004 MCP server, you can:

- **Search agents** using natural language
- **Get agent details** and capabilities
- **Browse the taxonomy** of skills and domains
- **View chain statistics** and platform data

## Endpoints

| Transport | URL |
|-----------|-----|
| SSE | `https://api.8004.dev/sse` |
| HTTP | `https://api.8004.dev/mcp` |
| Documentation | `https://api.8004.dev/mcp/docs` |

## Quick Start

### Claude Code (Recommended)

```bash
claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse
```

### One-Line Setup (Claude Desktop)

```bash
curl -fsSL https://api.8004.dev/mcp-setup | bash
```

See the [Setup Guide](/mcp/setup) for other clients.

## Available Features

### Tools

Interactive tools for querying data:

| Tool | Description |
|------|-------------|
| `search_agents` | Semantic search for AI agents |
| `get_agent` | Get detailed agent information |
| `list_agents` | List agents with filters |
| `get_chain_stats` | Blockchain statistics |

### Resources

Static data that can be read:

| Resource URI | Description |
|--------------|-------------|
| `8004://taxonomy/skills` | 136 OASF skill categories |
| `8004://taxonomy/domains` | 204 OASF domain categories |
| `8004://stats/chains` | Per-chain statistics |

### Prompts

Pre-built prompt templates:

| Prompt | Description |
|--------|-------------|
| `find_agent_for_task` | Find agents for a specific task |
| `explore_domain` | Explore agents in a domain |

## Example Interactions

Once connected, you can ask your AI assistant:

- "Find AI agents that can help with code review"
- "Show me agent 11155111:1234"
- "List all MCP-enabled agents on Base Sepolia"
- "How many agents are registered on each chain?"
- "What skills are available in the taxonomy?"

## Server Information

```bash
curl https://api.8004.dev/mcp
```

```json
{
  "name": "8004-agents",
  "version": "1.0.0",
  "protocolVersion": "2024-11-05"
}
```

## Next Steps

- [Setup Guide](/mcp/setup) - Configure your MCP client
- [Tools Reference](/mcp/tools) - Available tools and parameters
- [API Reference](/api/) - Direct API access
