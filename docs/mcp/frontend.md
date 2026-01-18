# Frontend Integration

Implement MCP connectivity in your frontend application.

For the complete frontend integration guide with full React component examples, MCP tools/resources/prompts reference, and detailed UI specifications, see [FRONTEND_MCP_INTEGRATION](/FRONTEND_MCP_INTEGRATION).

## Overview

The 8004 MCP Server enables users to connect AI assistants directly to agent data. This guide helps frontend developers implement the "Connect via MCP" feature.

## Endpoints

| Transport | URL | Description |
|-----------|-----|-------------|
| SSE | `https://api.8004.dev/sse` | Server-Sent Events transport |
| HTTP | `https://api.8004.dev/mcp` | JSON-RPC 2.0 endpoint |
| Docs | `https://api.8004.dev/mcp/docs` | Interactive documentation |

## Quick Start

### Claude Code

```bash
claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse
```

### Claude Desktop / Cursor

Add to config file:

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

Config file locations:
- **Claude Desktop (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Cursor (macOS)**: `~/.cursor/mcp.json`
- **Cursor (Windows)**: `%USERPROFILE%\.cursor\mcp.json`

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_agents` | Semantic search for agents |
| `get_agent` | Get agent details by ID |
| `list_agents` | List agents with filters |
| `get_chain_stats` | Blockchain statistics |

## Available MCP Resources

| Resource URI | Description |
|--------------|-------------|
| `8004://taxonomy/skills` | 136 OASF skill categories |
| `8004://taxonomy/domains` | 204 OASF domain categories |
| `8004://stats/chains` | Per-chain statistics |

## Testing Integration

```bash
curl https://api.8004.dev/mcp
```

Expected response:

```json
{
  "name": "8004-agents",
  "version": "1.0.0",
  "protocolVersion": "2024-11-05"
}
```

## Full Documentation

For complete frontend integration including:
- Full React component with tabs for all clients
- Platform-aware config path detection
- MCP tools, prompts, and resources reference
- UI component wireframes
- Placement suggestions

See [FRONTEND_MCP_INTEGRATION](/FRONTEND_MCP_INTEGRATION).

## Related

- [MCP Overview](/mcp/overview)
- [MCP Tools Reference](/mcp/tools)
- [MCP Setup Guide](/mcp/setup)
