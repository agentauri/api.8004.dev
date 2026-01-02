#!/bin/bash
# 8004 Agents MCP Setup Script
# Automatically configures Claude Desktop to use the 8004-agents MCP server
# Usage: curl -fsSL https://api.8004.dev/mcp-setup | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}8004 Agents MCP Setup${NC}"
echo "========================"
echo ""

# Detect OS and config path
if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    OS_NAME="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_DIR="$HOME/.config/Claude"
    OS_NAME="Linux"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WSL_DISTRO_NAME" ]]; then
    # Windows (Git Bash, Cygwin, or WSL)
    if [[ -n "$WSL_DISTRO_NAME" ]]; then
        # WSL - access Windows AppData
        WIN_APPDATA=$(wslpath "$(cmd.exe /c 'echo %APPDATA%' 2>/dev/null | tr -d '\r')")
        CONFIG_DIR="$WIN_APPDATA/Claude"
    else
        CONFIG_DIR="$APPDATA/Claude"
    fi
    OS_NAME="Windows"
else
    echo -e "${RED}Error: Unsupported OS ($OSTYPE)${NC}"
    echo "Please configure manually. See: https://8004.dev/mcp-setup"
    exit 1
fi

CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

echo -e "Detected OS: ${GREEN}$OS_NAME${NC}"
echo -e "Config path: ${BLUE}$CONFIG_FILE${NC}"
echo ""

# Check if Claude Desktop is installed
if [ ! -d "$CONFIG_DIR" ]; then
    echo -e "${RED}Error: Claude Desktop not found${NC}"
    echo ""
    echo "Please install Claude Desktop first:"
    echo "  https://claude.ai/download"
    echo ""
    echo "After installation, run this script again."
    exit 1
fi

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo -e "${RED}Error: npx not found${NC}"
    echo ""
    echo "Please install Node.js (v18+) first:"
    echo "  https://nodejs.org/"
    echo ""
    echo "After installation, run this script again."
    exit 1
fi

NODE_VERSION=$(node -v 2>/dev/null || echo "unknown")
echo -e "Node.js version: ${GREEN}$NODE_VERSION${NC}"
echo ""

# Backup existing config
if [ -f "$CONFIG_FILE" ]; then
    BACKUP_FILE="$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$CONFIG_FILE" "$BACKUP_FILE"
    echo -e "${YELLOW}Backed up existing config to:${NC}"
    echo "  $BACKUP_FILE"
    echo ""
fi

# MCP server configuration
MCP_CONFIG='{
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://api.8004.dev/mcp"]
}'

# Create or update config
if [ -f "$CONFIG_FILE" ]; then
    echo "Updating existing configuration..."

    # Use jq if available, otherwise use node
    if command -v jq &> /dev/null; then
        jq --argjson mcp "$MCP_CONFIG" '.mcpServers = (.mcpServers // {}) | .mcpServers["8004-agents"] = $mcp' "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
        mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
    else
        # Fallback to node
        node -e "
            const fs = require('fs');
            const configPath = '$CONFIG_FILE';
            let config;
            try {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (e) {
                config = {};
            }
            config.mcpServers = config.mcpServers || {};
            config.mcpServers['8004-agents'] = {
                command: 'npx',
                args: ['-y', 'mcp-remote', 'https://api.8004.dev/mcp']
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        "
    fi
else
    echo "Creating new configuration..."

    # Create config directory if needed
    mkdir -p "$CONFIG_DIR"

    # Create new config file
    cat > "$CONFIG_FILE" << 'EOF'
{
  "mcpServers": {
    "8004-agents": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.8004.dev/mcp"]
    }
  }
}
EOF
fi

echo ""
echo -e "${GREEN}Success! 8004-agents MCP configured.${NC}"
echo ""
echo "============================================"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "  1. Restart Claude Desktop"
echo "     (Quit completely and reopen)"
echo ""
echo "  2. Look for the hammer icon in Claude Desktop"
echo "     You should see '8004-agents' in the tools menu"
echo ""
echo "============================================"
echo ""
echo -e "${BLUE}Available tools:${NC}"
echo ""
echo "  search_agents   - Search AI agents by capability"
echo "  get_agent       - Get detailed agent information"
echo "  list_agents     - List agents with filters"
echo "  get_chain_stats - Get blockchain statistics"
echo ""
echo "============================================"
echo ""
echo -e "Need help? Visit: ${BLUE}https://8004.dev/mcp-setup${NC}"
echo ""
