/**
 * SDK Client for E2E Consistency Tests
 * Direct queries to The Graph subgraph for comparison with API results
 */

import type { SDKAgent } from './consistency-helpers';

const GRAPH_API_KEY = process.env.GRAPH_API_KEY || '';

/**
 * Subgraph URLs for each chain
 */
const SUBGRAPH_URLS: Record<number, string> = {
  11155111: 'https://api.studio.thegraph.com/query/96266/agent0-registry-sepolia/version/latest',
  84532: 'https://api.studio.thegraph.com/query/96266/agent0-registry-base-sepolia/version/latest',
  80002: 'https://api.studio.thegraph.com/query/96266/agent0-registry-polygon-amoy/version/latest',
  59141: 'https://api.studio.thegraph.com/query/96266/agent0-registry-linea-sepolia/version/latest',
  296: 'https://api.studio.thegraph.com/query/96266/agent0-registry-hedera-testnet/version/latest',
  998: 'https://api.studio.thegraph.com/query/96266/agent0-registry-hyperevm-testnet/version/latest',
  1351057110: 'https://api.studio.thegraph.com/query/96266/agent0-registry-skale-base-sepolia/version/latest',
};

/**
 * Raw agent data from subgraph
 */
interface GraphAgent {
  id: string;
  tokenId: string;
  name: string | null;
  description: string | null;
  image: string | null;
  active: boolean;
  operators: string[];
  ens: string | null;
  did: string | null;
  walletAddress: string | null;
  agentWallet: string | null;
  registrationFile: {
    mcp: boolean;
    a2a: boolean;
    x402Support: boolean;
  } | null;
}

/**
 * GraphQL query for agents
 */
const AGENTS_QUERY = `
  query GetAgents($first: Int!, $skip: Int!, $where: Agent_filter) {
    agents(first: $first, skip: $skip, where: $where, orderBy: tokenId, orderDirection: asc) {
      id
      tokenId
      name
      description
      image
      active
      operators
      ens
      did
      walletAddress
      agentWallet
      registrationFile {
        mcp
        a2a
        x402Support
      }
    }
  }
`;

/**
 * Query a single chain's subgraph
 */
async function querySubgraph(
  chainId: number,
  query: string,
  variables: Record<string, unknown>
): Promise<{ data?: { agents: GraphAgent[] }; errors?: Array<{ message: string }> }> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) {
    throw new Error(`No subgraph URL for chain ${chainId}`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(GRAPH_API_KEY ? { Authorization: `Bearer ${GRAPH_API_KEY}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  return response.json();
}

/**
 * Transform Graph agent to SDK format
 */
function transformGraphAgent(agent: GraphAgent, chainId: number): SDKAgent {
  return {
    agentId: `${chainId}:${agent.tokenId}`,
    name: agent.name || `Agent #${agent.tokenId}`,
    description: agent.description || undefined,
    image: agent.image || undefined,
    active: agent.active,
    mcp: agent.registrationFile?.mcp ?? false,
    a2a: agent.registrationFile?.a2a ?? false,
    x402support: agent.registrationFile?.x402Support ?? false,
    chainId,
    tokenId: agent.tokenId,
    operators: agent.operators,
    ens: agent.ens || undefined,
    did: agent.did || undefined,
    walletAddress: agent.walletAddress || agent.agentWallet || undefined,
  };
}

/**
 * Fetch agents from subgraph with filters
 */
export async function fetchAgentsFromSubgraph(
  chainId: number,
  options: {
    limit?: number;
    skip?: number;
    active?: boolean;
    mcp?: boolean;
    a2a?: boolean;
    x402?: boolean;
    hasRegistrationFile?: boolean;
  } = {}
): Promise<SDKAgent[]> {
  const { limit = 100, skip = 0 } = options;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (options.active !== undefined) {
    where.active = options.active;
  }

  // Note: mcp/a2a/x402 filters require registrationFile to exist
  if (options.hasRegistrationFile === true) {
    where.registrationFile_not = null;
  } else if (options.hasRegistrationFile === false) {
    where.registrationFile = null;
  }

  // MCP/A2A/X402 filters (only work when registrationFile exists)
  if (options.mcp !== undefined && options.mcp === true) {
    where.registrationFile_ = { ...(where.registrationFile_ as object || {}), mcp: true };
  }
  if (options.a2a !== undefined && options.a2a === true) {
    where.registrationFile_ = { ...(where.registrationFile_ as object || {}), a2a: true };
  }
  if (options.x402 !== undefined && options.x402 === true) {
    where.registrationFile_ = { ...(where.registrationFile_ as object || {}), x402Support: true };
  }

  try {
    const result = await querySubgraph(chainId, AGENTS_QUERY, {
      first: limit,
      skip,
      where: Object.keys(where).length > 0 ? where : undefined,
    });

    if (result.errors) {
      console.error(`Subgraph errors for chain ${chainId}:`, result.errors);
      return [];
    }

    return (result.data?.agents || []).map(agent => transformGraphAgent(agent, chainId));
  } catch (error) {
    console.error(`Failed to fetch from chain ${chainId}:`, error);
    return [];
  }
}

/**
 * Fetch agents from multiple chains
 */
export async function fetchAgentsFromMultipleChains(
  chainIds: number[],
  options: {
    limitPerChain?: number;
    active?: boolean;
    mcp?: boolean;
    a2a?: boolean;
    x402?: boolean;
  } = {}
): Promise<SDKAgent[]> {
  const { limitPerChain = 50 } = options;

  const results = await Promise.all(
    chainIds.map(chainId =>
      fetchAgentsFromSubgraph(chainId, {
        limit: limitPerChain,
        ...options,
      })
    )
  );

  return results.flat();
}

/**
 * Get agent count from subgraph
 */
export async function getAgentCountFromSubgraph(
  chainId: number,
  options: {
    active?: boolean;
    hasRegistrationFile?: boolean;
  } = {}
): Promise<number> {
  const COUNT_QUERY = `
    query GetAgentCount($where: Agent_filter) {
      agents(first: 1000, where: $where) {
        id
      }
    }
  `;

  const where: Record<string, unknown> = {};

  if (options.active !== undefined) {
    where.active = options.active;
  }

  if (options.hasRegistrationFile === true) {
    where.registrationFile_not = null;
  } else if (options.hasRegistrationFile === false) {
    where.registrationFile = null;
  }

  try {
    const result = await querySubgraph(chainId, COUNT_QUERY, {
      where: Object.keys(where).length > 0 ? where : undefined,
    });

    return result.data?.agents?.length || 0;
  } catch {
    return 0;
  }
}

/**
 * Check if SDK client is available (has subgraph URLs)
 */
export function isSDKAvailable(): boolean {
  return Object.keys(SUBGRAPH_URLS).length > 0;
}

/**
 * Get supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(SUBGRAPH_URLS).map(Number);
}
