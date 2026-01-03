# Frontend Integration

Implement MCP connectivity in your frontend application.

## Overview

The 8004 MCP Server enables users to connect AI assistants directly to agent data. This guide helps frontend developers implement the "Connect via MCP" feature.

## Endpoints

| Transport | URL | Description |
|-----------|-----|-------------|
| SSE | `https://api.8004.dev/sse` | Server-Sent Events transport |
| HTTP | `https://api.8004.dev/mcp` | JSON-RPC 2.0 endpoint |
| Docs | `https://api.8004.dev/mcp/docs` | Interactive documentation |

## UI Component Design

### Recommended Structure

A modal or expandable section with tabs for each client type:

```
+-------------------------------------------------------------+
|  Connect via MCP                                      [X]   |
+-------------------------------------------------------------+
|  [Claude Code] [Claude Desktop] [Cursor] [Other]            |
+-------------------------------------------------------------+
|                                                             |
|  Run this command in your terminal:                         |
|                                                             |
|  +----------------------------------------------+ [Copy]   |
|  | claude mcp add --transport http \            |          |
|  |   --scope local 8004-agents \                |          |
|  |   https://api.8004.dev/sse                   |          |
|  +----------------------------------------------+          |
|                                                             |
|  Note: Requires Claude Code CLI installed                   |
|                                                             |
+-------------------------------------------------------------+
```

## Client Configurations

### Claude Code

Single command in terminal:

```bash
claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse
```

**Note**: Requires Claude Code CLI installed.

### Claude Desktop

Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

JSON configuration:

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

**Note**: Restart Claude Desktop after saving.

### Cursor IDE

Config file locations:
- **macOS**: `~/.cursor/mcp.json`
- **Windows**: `%USERPROFILE%\.cursor\mcp.json`

Same JSON configuration as Claude Desktop.

**Note**: Restart Cursor after saving.

### Generic MCP Clients

For other MCP-compatible clients:

| Transport | URL |
|-----------|-----|
| SSE | `https://api.8004.dev/sse` |
| HTTP | `https://api.8004.dev/mcp` |

## React Implementation

```tsx
import { useState } from 'react';
import { Copy, Check, Terminal, Settings } from 'lucide-react';

const configs = {
  claudeCode: {
    label: 'Claude Code',
    command: 'claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse',
    note: 'Requires Claude Code CLI installed',
  },
  claudeDesktop: {
    label: 'Claude Desktop',
    configPath: '~/Library/Application Support/Claude/claude_desktop_config.json',
    config: {
      mcpServers: {
        '8004-agents': {
          command: 'npx',
          args: ['mcp-remote', 'https://api.8004.dev/sse'],
        },
      },
    },
    note: 'Restart Claude Desktop after saving',
  },
  cursor: {
    label: 'Cursor',
    configPath: '~/.cursor/mcp.json',
    config: {
      mcpServers: {
        '8004-agents': {
          command: 'npx',
          args: ['mcp-remote', 'https://api.8004.dev/sse'],
        },
      },
    },
    note: 'Restart Cursor after saving',
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function MCPConnectModal() {
  const [activeTab, setActiveTab] = useState('claudeCode');

  return (
    <div className="mcp-modal">
      <nav className="tabs">
        {Object.entries(configs).map(([key, { label }]) => (
          <button
            key={key}
            className={activeTab === key ? 'active' : ''}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="content">
        {activeTab === 'claudeCode' && (
          <div>
            <p>Run this command in your terminal:</p>
            <div className="code-block">
              <code>{configs.claudeCode.command}</code>
              <CopyButton text={configs.claudeCode.command} />
            </div>
            <p className="note">{configs.claudeCode.note}</p>
          </div>
        )}

        {(activeTab === 'claudeDesktop' || activeTab === 'cursor') && (
          <div>
            <p>Add to your config file:</p>
            <p className="path">{configs[activeTab].configPath}</p>
            <div className="code-block">
              <pre>{JSON.stringify(configs[activeTab].config, null, 2)}</pre>
              <CopyButton text={JSON.stringify(configs[activeTab].config, null, 2)} />
            </div>
            <p className="warning">{configs[activeTab].note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

## Placement Suggestions

1. **Header/Navbar**: "Connect MCP" button next to existing actions
2. **Agent Detail Page**: "Use this agent via MCP" section
3. **Footer**: Link to MCP documentation
4. **Landing Page**: Feature section about MCP connectivity

## Testing Integration

Verify MCP server is accessible:

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

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | GET | Server info (name, version, protocol) |
| `/mcp` | POST | JSON-RPC 2.0 endpoint for operations |
| `/mcp/docs` | GET | Interactive documentation |
| `/mcp/schema.json` | GET | JSON Schema for the server |
| `/sse` | GET | Server-Sent Events transport |

## Related

- [MCP Overview](/mcp/overview)
- [MCP Tools Reference](/mcp/tools)
- [MCP Setup Guide](/mcp/setup)
