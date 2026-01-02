/**
 * Test script for A2A AgentCard fetch
 *
 * Tests fetching IO modes from real A2A endpoints
 */

import { createA2AClient } from '../src/services/a2a-client';

const TEST_ENDPOINTS = [
  // Deep42 - known working A2A agent
  {
    name: 'Deep42',
    endpoint: 'https://deep42.cambrian.network/.well-known/agent-card.json',
    agentId: '11155111:1032',
  },
  // Example with base URL (not full path)
  {
    name: 'Summary Agent',
    endpoint: 'https://summary.updev.si',
    agentId: '11155111:1039',
  },
  // Invalid endpoint (should fail gracefully)
  {
    name: 'Invalid',
    endpoint: 'https://nonexistent.example.com',
    agentId: '11155111:9999',
  },
  // Localhost (should be blocked)
  {
    name: 'Blocked localhost',
    endpoint: 'http://localhost:4021/summarize-doc',
    agentId: '11155111:1037',
  },
];

async function main() {
  const client = createA2AClient({ timeoutMs: 10000 });

  console.log('Testing A2A AgentCard fetch\n');
  console.log('='.repeat(60));

  for (const test of TEST_ENDPOINTS) {
    console.log(`\n${test.name} (${test.agentId})`);
    console.log(`Endpoint: ${test.endpoint}`);

    const result = await client.fetchIOModes(test.endpoint, test.agentId);

    if (result.success) {
      console.log('Status: ✓ SUCCESS');
      console.log(`Input modes: ${result.inputModes.join(', ') || '(none)'}`);
      console.log(`Output modes: ${result.outputModes.join(', ') || '(none)'}`);
      console.log(`Skills: ${result.skillNames.join(', ') || '(none)'}`);
    } else {
      console.log('Status: ✗ FAILED');
      console.log(`Error: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete');
}

main().catch(console.error);
