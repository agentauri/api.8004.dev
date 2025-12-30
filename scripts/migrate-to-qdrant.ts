#!/usr/bin/env npx tsx
/**
 * Migration script to populate Qdrant with agent data
 * Run with: npx tsx scripts/migrate-to-qdrant.ts
 *
 * Required environment variables:
 * - QDRANT_URL: Qdrant Cloud endpoint
 * - QDRANT_API_KEY: Qdrant API key
 * - VENICE_API_KEY or OPENAI_API_KEY: For embedding generation
 * - SEPOLIA_RPC_URL, BASE_SEPOLIA_RPC_URL, POLYGON_AMOY_RPC_URL: Chain RPC URLs
 */

import 'dotenv/config';

// Supported chains
const CHAINS = [
  { id: 11155111, name: 'Ethereum Sepolia', rpcVar: 'SEPOLIA_RPC_URL' },
  { id: 84532, name: 'Base Sepolia', rpcVar: 'BASE_SEPOLIA_RPC_URL' },
  { id: 80002, name: 'Polygon Amoy', rpcVar: 'POLYGON_AMOY_RPC_URL' },
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

// Dynamic import for SDK (ESM)
async function getSDK(chainId: number, rpcUrl: string) {
  const { SDK } = await import('agent0-sdk');
  return new SDK({ chainId, rpcUrl });
}

// Embedding API endpoint
const EMBEDDING_API_URL = VENICE_API_KEY
  ? 'https://api.venice.ai/api/v1/embeddings'
  : 'https://api.openai.com/v1/embeddings';

const EMBEDDING_API_KEY = VENICE_API_KEY || OPENAI_API_KEY;

interface Agent {
  agentId: string;
  chainId: number;
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
}

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
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
 * Fetch all agents from a chain
 */
async function fetchAgentsFromChain(chainId: number, rpcUrl: string): Promise<Agent[]> {
  const sdk = await getSDK(chainId, rpcUrl);
  const agents: Agent[] = [];

  console.log(`  Fetching agents from chain ${chainId}...`);

  let cursor: string | undefined;
  let page = 0;

  do {
    const result = await sdk.searchAgents({
      limit: 100,
      cursor,
    });

    for (const item of result.items) {
      // SDK returns items directly, not as {agent: ...}
      agents.push({
        agentId: item.agentId,
        chainId: item.chainId,
        name: item.name,
        description: item.description,
        image: item.image,
        active: item.active,
        mcp: item.mcp,
        a2a: item.a2a,
        x402support: item.x402support,
        operators: item.operators ?? [],
        ens: item.ens,
        did: item.did,
        walletAddress: item.walletAddress,
      });
    }

    cursor = result.nextCursor;
    page++;
    console.log(`    Page ${page}: ${result.items.length} agents (total: ${agents.length})`);
  } while (cursor);

  return agents;
}

/**
 * Create Qdrant point from agent
 */
async function createQdrantPoint(agent: Agent): Promise<QdrantPoint> {
  const text = `${agent.name}\n\n${agent.description}`;
  const vector = await generateEmbedding(text);

  // Extract tokenId from agentId (format: chainId:tokenId)
  const tokenId = agent.agentId.split(':')[1] ?? '0';

  return {
    id: agent.agentId.replace(':', '_'), // Qdrant doesn't like colons in IDs
    vector,
    payload: {
      agent_id: agent.agentId,
      chain_id: agent.chainId,
      token_id: tokenId,
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
      // Skills and domains will be empty initially - populated by classification
      skills: [] as string[],
      domains: [] as string[],
      reputation: 0,
      created_at: new Date().toISOString(),
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
  console.log('Qdrant Migration Script');
  console.log('='.repeat(60));
  console.log(`Qdrant URL: ${QDRANT_URL}`);
  console.log(`Collection: ${QDRANT_COLLECTION}`);
  console.log(`Embedding API: ${VENICE_API_KEY ? 'Venice' : 'OpenAI'}`);
  console.log('');

  const allAgents: Agent[] = [];

  // Fetch agents from all chains
  console.log('Step 1: Fetching agents from all chains');
  for (const chain of CHAINS) {
    const rpcUrl = process.env[chain.rpcVar];
    if (!rpcUrl) {
      console.log(`  ⚠️  Skipping ${chain.name}: ${chain.rpcVar} not set`);
      continue;
    }

    try {
      const agents = await fetchAgentsFromChain(chain.id, rpcUrl);
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
          console.error(`    ❌ Failed to embed ${agent.id}: ${error}`);
          errorCount++;
        }
      }

      if (points.length > 0) {
        await upsertToQdrant(points);
        console.log(`    ✅ Upserted ${points.length} points`);
      }

      // Rate limiting - wait between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
    const countResponse = await fetch(
      `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/count`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': QDRANT_API_KEY as string,
        },
        body: JSON.stringify({ exact: true }),
      }
    );
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
