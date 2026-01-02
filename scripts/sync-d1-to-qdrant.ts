/**
 * Sync D1 classifications and reputation to Qdrant
 *
 * This script updates Qdrant payloads with skills/domains/reputation from D1
 * without re-generating embeddings.
 *
 * Usage:
 *   QDRANT_URL=xxx QDRANT_API_KEY=yyy npx tsx scripts/sync-d1-to-qdrant.ts
 *
 * Or with wrangler to get secrets:
 *   npx wrangler secret get QDRANT_URL && npx wrangler secret get QDRANT_API_KEY
 *
 * D1 data is fetched via wrangler d1 execute
 */

import { execSync } from 'node:child_process';

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = 'agents';
const D1_DATABASE = '8004-backend-db';

interface ClassificationRow {
  agent_id: string;
  skills: string; // JSON string
  domains: string; // JSON string
  confidence: number;
}

interface ReputationRow {
  agent_id: string;
  average_score: number;
  feedback_count: number;
}

interface SkillOrDomain {
  slug: string;
  confidence: number;
  reasoning?: string;
}

/**
 * Fetch data from D1 using wrangler CLI
 */
function fetchD1<T>(sql: string): T[] {
  const cmd = `npx wrangler d1 execute ${D1_DATABASE} --remote --command="${sql}" --json 2>/dev/null`;
  const output = execSync(cmd, { encoding: 'utf-8' });
  const data = JSON.parse(output) as Array<{ results: T[] }>;
  return data[0]?.results ?? [];
}

async function setQdrantPayload(
  agentId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    throw new Error('Missing QDRANT_URL or QDRANT_API_KEY');
  }

  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': QDRANT_API_KEY,
    },
    body: JSON.stringify({
      payload,
      filter: {
        must: [{ key: 'agent_id', match: { value: agentId } }],
      },
      wait: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to update ${agentId}: ${error}`);
    return false;
  }

  return true;
}

async function main() {
  console.log('=== Syncing D1 to Qdrant ===\n');

  // Fetch all classifications from D1
  console.log('Fetching classifications from D1...');
  const classifications = fetchD1<ClassificationRow>(
    'SELECT agent_id, skills, domains, confidence FROM agent_classifications'
  );
  console.log(`Found ${classifications.length} classifications\n`);

  // Fetch all reputation from D1
  console.log('Fetching reputation from D1...');
  const reputation = fetchD1<ReputationRow>(
    'SELECT agent_id, average_score, feedback_count FROM agent_reputation'
  );
  console.log(`Found ${reputation.length} reputation records\n`);

  // Create reputation map
  const reputationMap = new Map<string, number>();
  for (const r of reputation) {
    // Convert 1-5 scale to 0-100
    reputationMap.set(r.agent_id, Math.round(r.average_score * 20));
  }

  // Sync classifications to Qdrant
  console.log('Syncing classifications to Qdrant...');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < classifications.length; i++) {
    const c = classifications[i];

    try {
      // Parse skills and domains JSON
      const skillsData = JSON.parse(c.skills) as SkillOrDomain[];
      const domainsData = JSON.parse(c.domains) as SkillOrDomain[];

      // Extract just the slugs
      const skills = skillsData.map((s) => s.slug);
      const domains = domainsData.map((d) => d.slug);

      // Get reputation if available
      const rep = reputationMap.get(c.agent_id) ?? 0;

      // Update Qdrant payload
      const success = await setQdrantPayload(c.agent_id, {
        skills,
        domains,
        reputation: rep,
      });

      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Progress logging
      if ((i + 1) % 50 === 0 || i === classifications.length - 1) {
        console.log(`Progress: ${i + 1}/${classifications.length} (${successCount} ok, ${failCount} failed)`);
      }

      // Rate limiting - 100 req/sec max
      await new Promise((resolve) => setTimeout(resolve, 15));
    } catch (error) {
      console.error(`Error processing ${c.agent_id}:`, error);
      failCount++;
    }
  }

  console.log('\n=== Sync Complete ===');
  console.log(`Classifications synced: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  // Verify by checking a random agent
  if (successCount > 0) {
    const sampleAgent = classifications[0].agent_id;
    console.log(`\nVerifying agent ${sampleAgent}...`);

    const verifyResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': QDRANT_API_KEY!,
      },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'agent_id', match: { value: sampleAgent } }],
        },
        limit: 1,
        with_payload: true,
      }),
    });

    if (verifyResponse.ok) {
      const verifyData = (await verifyResponse.json()) as {
        result: { points: Array<{ payload: { skills: string[]; domains: string[]; reputation: number } }> };
      };
      const point = verifyData.result.points[0];
      if (point) {
        console.log('Skills:', point.payload.skills);
        console.log('Domains:', point.payload.domains);
        console.log('Reputation:', point.payload.reputation);
      }
    }
  }
}

main().catch(console.error);
