#!/usr/bin/env npx tsx
/**
 * Migration script to populate Qdrant with agent data from The Graph
 * Uses direct GraphQL queries instead of SDK for better performance
 *
 * Run with: npx tsx scripts/migrate-to-qdrant-graph.ts
 */

import 'dotenv/config';

// Subgraph endpoints (from agent0-sdk)
const SUBGRAPH_URLS: Record<number, string> = {
  11155111:
    'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT',
  84532:
    'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/GjQEDgEKqoh5Yc8MUgxoQoRATEJdEiH7HbocfR1aFiHa',
  80002:
    'https://gateway.thegraph.com/api/REDACTED_GRAPH_API_KEY/subgraphs/id/2A1JB18r1mF2VNP4QBH4mmxd74kbHoM6xLXC8ABAKf7j',
};

const CHAINS = [
  { id: 11155111, name: 'Ethereum Sepolia' },
  { id: 84532, name: 'Base Sepolia' },
  { id: 80002, name: 'Polygon Amoy' },
];

// Qdrant and Embedding config
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const VENICE_API_KEY = process.env.VENICE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'agents';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-bge-m3';

// Validate required environment variables
if (!QDRANT_URL || !QDRANT_API_KEY) {
  console.error('Error: QDRANT_URL and QDRANT_API_KEY are required');
  process.exit(1);
}

if (!VENICE_API_KEY && !OPENAI_API_KEY) {
  console.error('Error: VENICE_API_KEY or OPENAI_API_KEY is required');
  process.exit(1);
}

// Embedding API endpoint
const EMBEDDING_API_URL = VENICE_API_KEY
  ? 'https://api.venice.ai/api/v1/embeddings'
  : 'https://api.openai.com/v1/embeddings';

const EMBEDDING_API_KEY = VENICE_API_KEY || OPENAI_API_KEY;

/**
 * Generate a deterministic UUID v5-like ID from agentId (chainId:tokenId)
 * Format: 8-4-4-4-12 hex characters
 */
function agentIdToUUID(agentId: string): string {
  // Simple hash function for determinism
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    const char = agentId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Use agentId directly padded to form a valid UUID-like format
  // chainId:tokenId -> convert to hex and pad
  const [chainId, tokenId] = agentId.split(':');
  const chainHex = parseInt(chainId ?? '0', 10).toString(16).padStart(8, '0');
  const tokenHex = parseInt(tokenId ?? '0', 10).toString(16).padStart(16, '0');

  // Format as UUID: 8-4-4-4-12
  const uuid = `${chainHex}-${tokenHex.slice(0, 4)}-4${tokenHex.slice(4, 7)}-a${tokenHex.slice(7, 10)}-${tokenHex.slice(10, 16)}000000`;
  return uuid;
}

interface GraphAgent {
  id: string;
  chainId: string;
  agentId: string;
  operators: string[];
  registrationFile: {
    name: string;
    description: string;
    image?: string;
    active?: boolean;
    mcpEndpoint?: string;
    a2aEndpoint?: string;
    x402support?: boolean;
    ens?: string;
    did?: string;
    agentWallet?: string;
    // MCP/A2A capabilities (string arrays from Graph)
    mcpTools?: string[];
    mcpPrompts?: string[];
    mcpResources?: string[];
    a2aSkills?: string[];
    createdAt?: string; // Unix timestamp as string
  } | null;
}

interface Agent {
  agentId: string;
  chainId: number;
  tokenId: string;
  name: string;
  description: string;
  image?: string;
  active: boolean;
  mcp: boolean;
  a2a: boolean;
  x402support: boolean;
  operators: string[];
  ens?: string;
  did?: string;
  walletAddress?: string;
  // MCP/A2A capabilities for enriched embedding
  mcpTools: string[];
  mcpPrompts: string[];
  mcpResources: string[];
  a2aSkills: string[];
  createdAt: string; // ISO timestamp
}

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

/**
 * GraphQL query to fetch agents with pagination
 * Includes all MCP/A2A capabilities for enriched embeddings
 */
const AGENTS_QUERY = `
  query GetAgents($first: Int!, $skip: Int!) {
    agents(
      first: $first
      skip: $skip
      orderBy: agentId
      orderDirection: asc
      where: { registrationFile_not: null }
    ) {
      id
      chainId
      agentId
      operators
      registrationFile {
        name
        description
        image
        active
        mcpEndpoint
        a2aEndpoint
        x402support
        ens
        did
        agentWallet
        mcpTools
        mcpPrompts
        mcpResources
        a2aSkills
        createdAt
      }
    }
  }
`;

/**
 * Query The Graph for agents
 */
async function queryGraph(chainId: number, first: number, skip: number): Promise<GraphAgent[]> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) throw new Error(`No subgraph URL for chain ${chainId}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: AGENTS_QUERY,
      variables: { first, skip },
    }),
  });

  if (!response.ok) {
    throw new Error(`Graph query failed: ${response.status}`);
  }

  const json = (await response.json()) as { data?: { agents: GraphAgent[] }; errors?: unknown[] };
  if (json.errors) {
    throw new Error(`Graph errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data?.agents ?? [];
}

/**
 * Convert Unix timestamp (seconds) to ISO string
 */
function unixToISO(unixTimestamp?: string): string {
  if (!unixTimestamp) return new Date().toISOString();
  const ts = parseInt(unixTimestamp, 10);
  return new Date(ts * 1000).toISOString();
}

/**
 * Fetch all agents from a chain using direct GraphQL
 */
async function fetchAgentsFromChain(chainId: number): Promise<Agent[]> {
  const agents: Agent[] = [];
  const PAGE_SIZE = 1000; // Much larger than SDK's 100!
  let skip = 0;

  console.log(`  Fetching agents from chain ${chainId}...`);

  while (true) {
    const graphAgents = await queryGraph(chainId, PAGE_SIZE, skip);

    if (graphAgents.length === 0) break;

    for (const ga of graphAgents) {
      const reg = ga.registrationFile;
      if (!reg) continue; // Skip agents without registration

      agents.push({
        agentId: ga.id, // Already formatted as chainId:tokenId
        chainId,
        tokenId: ga.agentId,
        name: reg.name || `Agent #${ga.agentId}`,
        description: reg.description || '',
        image: reg.image,
        active: reg.active ?? true,
        mcp: !!reg.mcpEndpoint,
        a2a: !!reg.a2aEndpoint,
        x402support: reg.x402support ?? false,
        operators: ga.operators ?? [],
        ens: reg.ens,
        did: reg.did,
        walletAddress: reg.agentWallet,
        // MCP/A2A capabilities from Graph
        mcpTools: reg.mcpTools ?? [],
        mcpPrompts: reg.mcpPrompts ?? [],
        mcpResources: reg.mcpResources ?? [],
        a2aSkills: reg.a2aSkills ?? [],
        createdAt: unixToISO(reg.createdAt),
      });
    }

    console.log(`    Page ${Math.floor(skip / PAGE_SIZE) + 1}: ${graphAgents.length} agents (total: ${agents.length})`);

    if (graphAgents.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return agents;
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(EMBEDDING_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      input: text,
      model: EMBEDDING_MODEL,
      dimensions: 1024,
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  const embedding = data.data[0]?.embedding;
  if (!embedding) {
    throw new Error('No embedding returned from API');
  }
  return embedding;
}

/**
 * Upsert points to Qdrant
 */
async function upsertToQdrant(points: QdrantPoint[]): Promise<void> {
  const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'api-key': QDRANT_API_KEY as string,
    },
    body: JSON.stringify({
      points,
      wait: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qdrant upsert error: ${error}`);
  }
}

/**
 * Format agent text for embedding generation
 * Matches search-service format: name, description, capabilities, tools, skills
 * This creates a rich semantic representation for accurate vector search
 */
function formatAgentText(agent: Agent): string {
  const parts: string[] = [agent.name, agent.description];

  // Add MCP tools if available
  if (agent.mcpTools.length > 0) {
    parts.push(`MCP Tools: ${agent.mcpTools.join(', ')}`);
  }

  // Add MCP prompts if available
  if (agent.mcpPrompts.length > 0) {
    parts.push(`MCP Prompts: ${agent.mcpPrompts.join(', ')}`);
  }

  // Add MCP resources if available
  if (agent.mcpResources.length > 0) {
    parts.push(`MCP Resources: ${agent.mcpResources.join(', ')}`);
  }

  // Add A2A skills if available
  if (agent.a2aSkills.length > 0) {
    parts.push(`A2A Skills: ${agent.a2aSkills.join(', ')}`);
  }

  // Add capability indicators
  const capabilities: string[] = [];
  if (agent.mcp) capabilities.push('MCP protocol support');
  if (agent.a2a) capabilities.push('A2A protocol support');
  if (agent.x402support) capabilities.push('x402 payment support');
  if (capabilities.length > 0) {
    parts.push(`Capabilities: ${capabilities.join(', ')}`);
  }

  // Join with double newlines and limit to 30000 chars (embedding limit)
  return parts.filter(Boolean).join('\n\n').slice(0, 30000);
}

/**
 * Create Qdrant point from agent
 */
async function createQdrantPoint(agent: Agent): Promise<QdrantPoint> {
  // Use enriched text for embedding (matches search-service format)
  const text = formatAgentText(agent);
  const vector = await generateEmbedding(text);

  return {
    id: agentIdToUUID(agent.agentId), // UUID format required by Qdrant
    vector,
    payload: {
      agent_id: agent.agentId,
      chain_id: agent.chainId,
      token_id: agent.tokenId,
      name: agent.name,
      description: agent.description,
      image: agent.image ?? '',
      active: agent.active,
      has_mcp: agent.mcp,
      has_a2a: agent.a2a,
      x402_support: agent.x402support,
      operators: agent.operators,
      ens: agent.ens ?? '',
      did: agent.did ?? '',
      wallet_address: agent.walletAddress ?? '',
      // MCP/A2A capabilities
      mcp_tools: agent.mcpTools,
      mcp_prompts: agent.mcpPrompts,
      mcp_resources: agent.mcpResources,
      a2a_skills: agent.a2aSkills,
      // Skills and domains will be empty initially - populated by classification
      skills: [] as string[],
      domains: [] as string[],
      reputation: 0,
      created_at: agent.createdAt,
      input_modes: [] as string[],
      output_modes: [] as string[],
    },
  };
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('='.repeat(60));
  console.log('Qdrant Migration Script (Direct Graph)');
  console.log('='.repeat(60));
  console.log(`Qdrant URL: ${QDRANT_URL}`);
  console.log(`Collection: ${QDRANT_COLLECTION}`);
  console.log(`Embedding API: ${VENICE_API_KEY ? 'Venice' : 'OpenAI'}`);
  console.log('');

  const allAgents: Agent[] = [];

  // Fetch agents from all chains
  console.log('Step 1: Fetching agents from all chains');
  for (const chain of CHAINS) {
    try {
      const agents = await fetchAgentsFromChain(chain.id);
      console.log(`  ✅ ${chain.name}: ${agents.length} agents`);
      allAgents.push(...agents);
    } catch (error) {
      console.error(`  ❌ ${chain.name}: ${error}`);
    }
  }

  console.log(`\nTotal agents: ${allAgents.length}`);

  if (allAgents.length === 0) {
    console.log('No agents to migrate. Exiting.');
    return;
  }

  // Generate embeddings and upsert to Qdrant
  console.log('\nStep 2: Generating embeddings and upserting to Qdrant');

  const BATCH_SIZE = 10;
  const batches = Math.ceil(allAgents.length / BATCH_SIZE);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < batches; i++) {
    const batch = allAgents.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    console.log(`  Batch ${i + 1}/${batches} (${batch.length} agents)...`);

    try {
      const points: QdrantPoint[] = [];

      for (const agent of batch) {
        try {
          const point = await createQdrantPoint(agent);
          points.push(point);
          successCount++;
        } catch (error) {
          console.error(`    ❌ Failed to embed ${agent.agentId}: ${error}`);
          errorCount++;
        }
      }

      if (points.length > 0) {
        await upsertToQdrant(points);
        console.log(`    ✅ Upserted ${points.length} points`);
      }

      // Rate limiting - wait between batches
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`    ❌ Batch failed: ${error}`);
      errorCount += batch.length;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Complete!');
  console.log('='.repeat(60));
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);

  // Verify count
  try {
    const countResponse = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': QDRANT_API_KEY as string,
      },
      body: JSON.stringify({ exact: true }),
    });
    const countData = (await countResponse.json()) as { result: { count: number } };
    console.log(`\nQdrant collection now has ${countData.result.count} points`);
  } catch (error) {
    console.error('Failed to verify count:', error);
  }
}

// Run migration
migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
