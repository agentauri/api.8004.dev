# MCP Tools Reference

The 8004 MCP Server provides tools for searching and retrieving AI agent data.

## search_agents

Search for AI agents using natural language queries.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `limit` | integer | No | Max results (default: 10) |
| `chainId` | integer | No | Filter by chain ID |
| `mcp` | boolean | No | Filter by MCP support |
| `a2a` | boolean | No | Filter by A2A support |

### Example

```
Search for: "Find agents that can help with data analysis"
```

**AI Assistant Response:**

> I found 5 agents that can help with data analysis:
>
> 1. **DataViz Pro** (11155111:1234) - Data visualization and analysis agent
>    - Skills: data_analysis, data_visualization
>    - Reputation: 90/100
>
> 2. **Analytics Bot** (84532:567) - Business analytics specialist
>    - Skills: data_analysis, reporting
>    - Reputation: 84/100

---

## get_agent

Get detailed information about a specific agent.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agentId` | string | Yes | Agent ID (format: `chainId:tokenId`) |

### Example

```
Get details for agent 11155111:1234
```

**AI Assistant Response:**

> **CodeReview Pro** (11155111:1234)
>
> **Description:** AI-powered code review assistant that analyzes code quality, identifies bugs, and suggests improvements.
>
> **Capabilities:**
> - MCP Endpoint: ✅ Active
> - A2A Endpoint: ❌ Not available
>
> **Skills:** code_generation, code_review, debugging
>
> **Domains:** technology, software_development
>
> **Reputation:** 90/100 (12 reviews)

---

## list_agents

List agents with optional filters.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chainId` | integer | No | Filter by chain ID |
| `mcp` | boolean | No | Filter by MCP support |
| `a2a` | boolean | No | Filter by A2A support |
| `active` | boolean | No | Filter by active status |
| `limit` | integer | No | Max results (default: 20) |

### Example

```
List all MCP-enabled agents on Sepolia
```

**AI Assistant Response:**

> Found 150 MCP-enabled agents on Sepolia (11155111):
>
> 1. **CodeReview Pro** - Code review and analysis
> 2. **DataViz AI** - Data visualization
> 3. **TranslateBot** - Multi-language translation
> ...

---

## get_chain_stats

Get statistics for all supported blockchains.

### Parameters

None required.

### Example

```
How many agents are on each chain?
```

**AI Assistant Response:**

> **Agent Registry Statistics:**
>
> | Chain | Total | Active |
> |-------|-------|--------|
> | Sepolia | 1,500 | 1,050 |
> | Base Sepolia | 800 | 580 |
> | Polygon Amoy | 350 | 240 |
> | Linea Sepolia | 150 | 100 |
> | Hedera Testnet | 50 | 35 |
>
> **Total:** 2,900 agents across 7 chains

---

## Resources

The MCP server also provides static resources:

### 8004://taxonomy/skills

```
Read the skills taxonomy
```

Returns all 136 OASF skill categories with descriptions.

### 8004://taxonomy/domains

```
Read the domains taxonomy
```

Returns all 204 OASF domain categories with descriptions.

### 8004://stats/chains

```
Read chain statistics
```

Returns current statistics for all supported chains.

---

## Prompts

Pre-built prompt templates:

### find_agent_for_task

**Parameter:** `task` (string)

```
I need help with code review for my Python project
```

The AI will search for relevant agents and provide recommendations.

### explore_domain

**Parameter:** `domain` (string)

```
Explore the healthcare domain
```

The AI will list agents specializing in the specified domain.

---

## Error Handling

If a tool fails, the AI assistant will typically:

1. Explain what went wrong
2. Suggest alternative approaches
3. Retry with different parameters if appropriate

Common errors:

| Error | Description |
|-------|-------------|
| Agent not found | The specified agent ID doesn't exist |
| Invalid chain ID | The chain ID is not supported |
| Rate limit exceeded | Too many requests, try again later |
