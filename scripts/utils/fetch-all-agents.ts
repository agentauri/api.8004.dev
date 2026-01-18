#!/usr/bin/env npx tsx
/**
 * Fetch All Agents Script
 *
 * Fetches all agents from all active chains via the 8004 API.
 * Can be run standalone whenever needed.
 *
 * Usage:
 *   npx tsx scripts/utils/fetch-all-agents.ts [options]
 *
 * Options:
 *   --chain <chainId>    Fetch only from specific chain (can be repeated)
 *   --output <file>      Write output to JSON file
 *   --summary            Only show summary counts (no agent details)
 *   --active             Only fetch active agents
 *   --api-url <url>      API base URL (default: https://api.8004.dev)
 *   --api-key <key>      API key (or set API_KEY env var)
 *   --help               Show this help message
 *
 * Environment:
 *   API_KEY              API key for 8004.dev (or use --api-key)
 *
 * Examples:
 *   npx tsx scripts/utils/fetch-all-agents.ts
 *   npx tsx scripts/utils/fetch-all-agents.ts --chain 11155111
 *   npx tsx scripts/utils/fetch-all-agents.ts --output /tmp/agents.json
 *   npx tsx scripts/utils/fetch-all-agents.ts --summary
 *   npx tsx scripts/utils/fetch-all-agents.ts --api-key YOUR_KEY
 */

import { config } from 'dotenv';

// Load environment variables from .env only (not .dev.vars which has dev-only keys)
config({ path: '.env' });

// Active chains with ERC-8004 v1.0 contracts
const ACTIVE_CHAINS = [
  { chainId: 11155111, name: 'Ethereum Sepolia' },
  { chainId: 84532, name: 'Base Sepolia' },
  { chainId: 80002, name: 'Polygon Amoy' },
];

// Default API URL
const DEFAULT_API_URL = 'https://api.8004.dev';

interface Agent {
  agentId: string;
  chainId: number;
  tokenId: string;
  name: string;
  description: string;
  owner: string;
  active: boolean;
  hasMcp: boolean;
  hasA2a: boolean;
  createdAt: string;
}

interface ChainResult {
  chainId: number;
  chainName: string;
  agents: Agent[];
  count: number;
  error?: string;
}

interface FetchResult {
  timestamp: string;
  totalAgents: number;
  chains: ChainResult[];
}

interface ApiResponse {
  success: boolean;
  data: {
    agents: Agent[];
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  error?: string;
}

function parseArgs(): {
  chains: number[];
  output: string | null;
  summary: boolean;
  active: boolean;
  apiUrl: string;
  apiKey: string;
  help: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    chains: [] as number[],
    output: null as string | null,
    summary: false,
    active: false,
    apiUrl: DEFAULT_API_URL,
    apiKey: process.env.API_KEY || '',
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--chain':
        if (args[i + 1]) {
          result.chains.push(Number(args[++i]));
        }
        break;
      case '--output':
        if (args[i + 1]) {
          result.output = args[++i];
        }
        break;
      case '--api-url':
        if (args[i + 1]) {
          result.apiUrl = args[++i];
        }
        break;
      case '--api-key':
        if (args[i + 1]) {
          result.apiKey = args[++i];
        }
        break;
      case '--summary':
        result.summary = true;
        break;
      case '--active':
        result.active = true;
        break;
      case '--help':
        result.help = true;
        break;
    }
  }

  // Default to all active chains if none specified
  if (result.chains.length === 0) {
    result.chains = ACTIVE_CHAINS.map((c) => c.chainId);
  }

  return result;
}

function showHelp(): void {
  console.log(`
Fetch All Agents Script

Fetches all agents from all active chains via the 8004 API.

Usage:
  npx tsx scripts/utils/fetch-all-agents.ts [options]

Options:
  --chain <chainId>    Fetch only from specific chain (can be repeated)
  --output <file>      Write output to JSON file
  --summary            Only show summary counts (no agent details)
  --active             Only fetch active agents
  --api-url <url>      API base URL (default: ${DEFAULT_API_URL})
  --api-key <key>      API key (or set API_KEY env var)
  --help               Show this help message

Active Chains:
${ACTIVE_CHAINS.map((c) => `  - ${c.chainId}: ${c.name}`).join('\n')}

Examples:
  npx tsx scripts/utils/fetch-all-agents.ts
  npx tsx scripts/utils/fetch-all-agents.ts --chain 11155111
  npx tsx scripts/utils/fetch-all-agents.ts --chain 11155111 --chain 84532
  npx tsx scripts/utils/fetch-all-agents.ts --output /tmp/agents.json
  npx tsx scripts/utils/fetch-all-agents.ts --summary
  npx tsx scripts/utils/fetch-all-agents.ts --active --summary
`);
}

async function fetchAgentsFromChain(
  chainId: number,
  activeOnly: boolean,
  apiUrl: string,
  apiKey: string
): Promise<{ agents: Agent[]; error?: string }> {
  const agents: Agent[] = [];
  const pageSize = 100;
  let offset = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const params = new URLSearchParams({
        chainIds: String(chainId),
        limit: String(pageSize),
        offset: String(offset),
      });

      if (activeOnly) {
        params.set('active', 'true');
      }

      const url = `${apiUrl}/api/v1/agents?${params}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      const response = await fetch(url, { headers });
      const result = (await response.json()) as ApiResponse;

      if (!result.success) {
        throw new Error(result.error || 'API request failed');
      }

      const fetchedAgents = result.data?.agents ?? [];
      if (fetchedAgents.length === 0) {
        hasMore = false;
        break;
      }

      agents.push(...fetchedAgents);
      offset += pageSize;
      hasMore = result.pagination?.hasMore ?? false;

      // Progress indicator
      process.stdout.write(`\r  Fetched ${agents.length} agents from chain ${chainId}...`);
    }

    process.stdout.write(`\r  Fetched ${agents.length} agents from chain ${chainId}    \n`);
    return { agents };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\n  Error fetching from chain ${chainId}: ${errorMsg}`);
    return { agents, error: errorMsg };
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.apiKey) {
    console.error('Error: API key is required for the 8004 API.');
    console.error('Provide an API key using:');
    console.error('  --api-key YOUR_KEY');
    console.error('  or set API_KEY environment variable');
    console.error('\nFor local development, use:');
    console.error('  --api-url http://localhost:8787 --api-key $(grep API_KEY .dev.vars | cut -d= -f2)');
    process.exit(1);
  }

  console.log('Fetching agents from 8004 API...\n');

  const result: FetchResult = {
    timestamp: new Date().toISOString(),
    totalAgents: 0,
    chains: [],
  };

  for (const chainId of args.chains) {
    const chainInfo = ACTIVE_CHAINS.find((c) => c.chainId === chainId);
    const chainName = chainInfo?.name ?? `Chain ${chainId}`;

    console.log(`Fetching from ${chainName} (${chainId})...`);

    const { agents, error } = await fetchAgentsFromChain(
      chainId,
      args.active,
      args.apiUrl,
      args.apiKey
    );

    result.chains.push({
      chainId,
      chainName,
      agents: args.summary ? [] : agents,
      count: agents.length,
      error,
    });

    result.totalAgents += agents.length;
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Timestamp: ${result.timestamp}`);
  console.log(`Total Agents: ${result.totalAgents}`);
  console.log('\nBy Chain:');
  for (const chain of result.chains) {
    const status = chain.error ? ` (ERROR: ${chain.error})` : '';
    console.log(`  ${chain.chainName}: ${chain.count} agents${status}`);
  }

  // Write to file if requested
  if (args.output) {
    const fs = await import('fs');
    fs.writeFileSync(args.output, JSON.stringify(result, null, 2));
    console.log(`\nOutput written to: ${args.output}`);
  }

  // Print agent details if not summary mode and not outputting to file
  if (!args.summary && !args.output) {
    console.log('\n' + '='.repeat(50));
    console.log('AGENT DETAILS');
    console.log('='.repeat(50));
    for (const chain of result.chains) {
      if (chain.agents.length > 0) {
        console.log(`\n${chain.chainName} (${chain.chainId}):`);
        for (const agent of chain.agents.slice(0, 10)) {
          const name = agent.name || `Agent #${agent.tokenId}`;
          console.log(`  ${agent.agentId} - ${name}`);
        }
        if (chain.agents.length > 10) {
          console.log(`  ... and ${chain.agents.length - 10} more`);
        }
      }
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
