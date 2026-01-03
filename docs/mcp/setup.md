# MCP Setup Guide

Configure your AI assistant to use the 8004 Agent Registry.

## Claude Code (Recommended)

The fastest way to connect:

```bash
claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse
```

That's it! You can now ask Claude about AI agents.

::: info Requirements
Requires Claude Code CLI installed. Install with:
```bash
npm install -g @anthropic-ai/claude-code
```
:::

---

## Claude Desktop

### Automatic Setup

Run the setup script:

```bash
curl -fsSL https://api.8004.dev/mcp-setup | bash
```

This will:
1. Detect your OS
2. Find your Claude Desktop config
3. Add the 8004-agents server
4. Create a backup of your existing config

### Manual Setup

1. **Find your config file:**

   | OS | Path |
   |----|------|
   | macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
   | Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
   | Linux | `~/.config/Claude/claude_desktop_config.json` |

2. **Add this configuration:**

   ```json
   {
     "mcpServers": {
       "8004-agents": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://api.8004.dev/sse"]
       }
     }
   }
   ```

   If you have existing servers, merge with your config:

   ```json
   {
     "mcpServers": {
       "existing-server": { ... },
       "8004-agents": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://api.8004.dev/sse"]
       }
     }
   }
   ```

3. **Restart Claude Desktop**

::: warning Important
You must restart Claude Desktop after modifying the config file.
:::

---

## Cursor IDE

1. **Open config file:**

   | OS | Path |
   |----|------|
   | macOS | `~/.cursor/mcp.json` |
   | Windows | `%USERPROFILE%\.cursor\mcp.json` |
   | Linux | `~/.cursor/mcp.json` |

2. **Add configuration:**

   ```json
   {
     "mcpServers": {
       "8004-agents": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://api.8004.dev/sse"]
       }
     }
   }
   ```

3. **Restart Cursor**

---

## Other MCP Clients

For any MCP-compatible client, use these endpoints:

| Transport | URL |
|-----------|-----|
| SSE | `https://api.8004.dev/sse` |
| HTTP | `https://api.8004.dev/mcp` |

### Server Information

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

---

## Verification

After setup, test your connection:

### Claude Desktop / Cursor

Ask: "Can you search for AI agents that help with code review?"

Expected response: The AI should return a list of agents from the registry.

### CLI Test

```bash
curl https://api.8004.dev/mcp
```

Expected:
```json
{
  "name": "8004-agents",
  "version": "1.0.0",
  "protocolVersion": "2024-11-05"
}
```

---

## Troubleshooting

### "MCP server not found"

- Verify the config file path is correct for your OS
- Ensure you saved the file as valid JSON
- Restart your AI assistant

### "npx not found"

Install Node.js (v18+):
- Download from [nodejs.org](https://nodejs.org)
- Or use a package manager: `brew install node`

### "Connection refused"

- Check your internet connection
- Verify the endpoint URL is correct
- The server might be temporarily down - check [status.8004.dev](https://status.8004.dev)

### Config file doesn't exist

Create the config directory and file:

**macOS:**
```bash
mkdir -p ~/Library/Application\ Support/Claude
echo '{"mcpServers":{}}' > ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Linux:**
```bash
mkdir -p ~/.config/Claude
echo '{"mcpServers":{}}' > ~/.config/Claude/claude_desktop_config.json
```

---

## Support

- MCP Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- API Documentation: [api.8004.dev/mcp/docs](https://api.8004.dev/mcp/docs)
- Issues: [github.com/agentauri/api.8004.dev](https://github.com/agentauri/api.8004.dev/issues)
