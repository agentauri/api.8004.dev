# Frontend MCP Integration Guide

Documentation for implementing the "Connect via MCP" feature on 8004.dev.

---

## Overview

The 8004 MCP Server allows users to interact with agent data directly from AI assistants like Claude Desktop, Claude Code, Cursor, and other MCP-compatible clients.

**Production Endpoints:**
- SSE Transport: `https://api.8004.dev/sse`
- HTTP Transport: `https://api.8004.dev/mcp`
- Documentation: `https://api.8004.dev/mcp/docs`

---

## User Connection Methods

### 1. Claude Code (CLI)

Single command - easiest method:

```bash
claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse
```

**UI Implementation:**
- Copy button with the command
- Brief explanation text

---

### 2. Claude Desktop

Users need to edit their config file and restart Claude Desktop.

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Config to add:**

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

**UI Implementation:**
- Show full config with syntax highlighting
- Copy button for the JSON
- Link to config file path (platform-aware if possible)
- Note: "Restart Claude Desktop after saving"

---

### 3. Cursor IDE

Same config format as Claude Desktop.

**Config file location:**
- macOS: `~/.cursor/mcp.json`
- Windows: `%USERPROFILE%\.cursor\mcp.json`

**Config:**

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

---

### 4. Other MCP Clients (Generic)

For any MCP-compatible client:

| Transport | URL |
|-----------|-----|
| SSE | `https://api.8004.dev/sse` |
| HTTP | `https://api.8004.dev/mcp` |

---

## UI Component Specification

### Suggested Component: `<MCPConnectModal />`

A modal or expandable section with tabs for each client type.

#### Visual Structure

```
┌─────────────────────────────────────────────────────────┐
│  🔌 Connect via MCP                              [X]    │
├─────────────────────────────────────────────────────────┤
│  [Claude Code] [Claude Desktop] [Cursor] [Other]        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Run this command in your terminal:                     │
│                                                         │
│  ┌────────────────────────────────────────────┐ [Copy] │
│  │ claude mcp add --transport http \          │        │
│  │   --scope local 8004-agents \              │        │
│  │   https://api.8004.dev/sse                 │        │
│  └────────────────────────────────────────────┘        │
│                                                         │
│  ℹ️  Requires Claude Code CLI installed                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Tab Content

**Tab: Claude Code**
```
Run this command in your terminal:

[code block with copy button]
claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse

ℹ️ Requires Claude Code CLI. Install: npm install -g @anthropic-ai/claude-code
```

**Tab: Claude Desktop**
```
Add this to your Claude Desktop config file:

📁 Config location: ~/Library/Application Support/Claude/claude_desktop_config.json

[code block with copy button - JSON config]

⚠️ Restart Claude Desktop after saving the config.
```

**Tab: Cursor**
```
Add this to your Cursor MCP config:

📁 Config location: ~/.cursor/mcp.json

[code block with copy button - JSON config]

⚠️ Restart Cursor after saving.
```

**Tab: Other**
```
For other MCP-compatible clients, use these endpoints:

SSE Transport:  https://api.8004.dev/sse
HTTP Transport: https://api.8004.dev/mcp

📖 Full documentation: https://api.8004.dev/mcp/docs
```

---

## Available MCP Tools

Once connected, users can use these tools:

| Tool | Description | Example Usage |
|------|-------------|---------------|
| `search_agents` | Semantic search for agents | "Find trading bots" |
| `get_agent` | Get agent details by ID | "Show agent 11155111:123" |
| `list_agents` | List agents with filters | "List all MCP-enabled agents" |
| `get_chain_stats` | Blockchain statistics | "How many agents on Base?" |

---

## Available MCP Resources

Static data that clients can read:

| Resource URI | Description |
|--------------|-------------|
| `8004://taxonomy/skills` | 136 OASF skill categories |
| `8004://taxonomy/domains` | 204 OASF domain categories |
| `8004://stats/chains` | Per-chain statistics |

---

## Available MCP Prompts

Pre-built prompt templates:

| Prompt | Parameters | Description |
|--------|------------|-------------|
| `find_agent_for_task` | `task: string` | Helps find the right agent for a task |
| `explore_domain` | `domain: string` | Explores agents in a specific domain |

---

## React Implementation Example

```tsx
import { useState } from 'react';
import { Copy, Check, Terminal, Settings, Code2, MoreHorizontal } from 'lucide-react';

const configs = {
  claudeCode: {
    label: 'Claude Code',
    icon: Terminal,
    command: 'claude mcp add --transport http --scope local 8004-agents https://api.8004.dev/sse',
    note: 'Requires Claude Code CLI installed',
  },
  claudeDesktop: {
    label: 'Claude Desktop',
    icon: Settings,
    configPath: {
      mac: '~/Library/Application Support/Claude/claude_desktop_config.json',
      windows: '%APPDATA%\\Claude\\claude_desktop_config.json',
    },
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
    icon: Code2,
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
  other: {
    label: 'Other',
    icon: MoreHorizontal,
    endpoints: {
      sse: 'https://api.8004.dev/sse',
      http: 'https://api.8004.dev/mcp',
    },
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
    <button onClick={handleCopy} className="copy-btn">
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function MCPConnectButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<keyof typeof configs>('claudeCode');

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="mcp-connect-btn">
        🔌 Connect via MCP
      </button>

      {isOpen && (
        <div className="modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>Connect via MCP</h2>
              <button onClick={() => setIsOpen(false)}>✕</button>
            </header>

            <nav className="tabs">
              {Object.entries(configs).map(([key, { label, icon: Icon }]) => (
                <button
                  key={key}
                  className={activeTab === key ? 'active' : ''}
                  onClick={() => setActiveTab(key as keyof typeof configs)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>

            <div className="tab-content">
              {activeTab === 'claudeCode' && (
                <div>
                  <p>Run this command in your terminal:</p>
                  <div className="code-block">
                    <code>{configs.claudeCode.command}</code>
                    <CopyButton text={configs.claudeCode.command} />
                  </div>
                  <p className="note">ℹ️ {configs.claudeCode.note}</p>
                </div>
              )}

              {activeTab === 'claudeDesktop' && (
                <div>
                  <p>Add this to your Claude Desktop config:</p>
                  <p className="path">
                    📁 {configs.claudeDesktop.configPath.mac}
                  </p>
                  <div className="code-block">
                    <pre>{JSON.stringify(configs.claudeDesktop.config, null, 2)}</pre>
                    <CopyButton text={JSON.stringify(configs.claudeDesktop.config, null, 2)} />
                  </div>
                  <p className="warning">⚠️ {configs.claudeDesktop.note}</p>
                </div>
              )}

              {activeTab === 'cursor' && (
                <div>
                  <p>Add this to your Cursor MCP config:</p>
                  <p className="path">📁 {configs.cursor.configPath}</p>
                  <div className="code-block">
                    <pre>{JSON.stringify(configs.cursor.config, null, 2)}</pre>
                    <CopyButton text={JSON.stringify(configs.cursor.config, null, 2)} />
                  </div>
                  <p className="warning">⚠️ {configs.cursor.note}</p>
                </div>
              )}

              {activeTab === 'other' && (
                <div>
                  <p>Use these endpoints for other MCP clients:</p>
                  <table>
                    <tbody>
                      <tr>
                        <td>SSE Transport</td>
                        <td>
                          <code>{configs.other.endpoints.sse}</code>
                          <CopyButton text={configs.other.endpoints.sse} />
                        </td>
                      </tr>
                      <tr>
                        <td>HTTP Transport</td>
                        <td>
                          <code>{configs.other.endpoints.http}</code>
                          <CopyButton text={configs.other.endpoints.http} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p>
                    📖 <a href="https://api.8004.dev/mcp/docs">Full documentation</a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

---

## Placement Suggestions

1. **Header/Navbar**: "Connect MCP" button next to existing actions
2. **Agent Detail Page**: "Use this agent via MCP" section
3. **Footer**: Link to MCP documentation
4. **Landing Page**: Feature section about MCP connectivity

---

## API Endpoints Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | GET | Server info (name, version, protocol) |
| `/mcp` | POST | JSON-RPC 2.0 endpoint for all MCP operations |
| `/mcp/docs` | GET | HTML documentation page |
| `/mcp/schema.json` | GET | JSON Schema for the MCP server |
| `/sse` | GET | Server-Sent Events transport |

---

## Testing the Integration

Frontend devs can test MCP is working:

```bash
# Check server info
curl https://api.8004.dev/mcp

# Expected response:
{
  "name": "8004-agents",
  "version": "1.0.0",
  "protocolVersion": "2024-11-05"
}
```

---

## Questions?

- MCP Server implementation: `src/mcp/index.ts`
- API documentation: https://api.8004.dev/mcp/docs
- MCP Protocol spec: https://modelcontextprotocol.io
