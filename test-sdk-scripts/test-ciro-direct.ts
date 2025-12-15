import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Test with 'query' param (fuzzy search)
  console.log('Test con { query: "ciro" }:');
  const r1 = await sdk.searchAgents({ query: 'ciro' } as any, undefined, 20);
  console.log('  Risultati:', r1.items.length);
  for (const a of r1.items) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }

  // Test with 'name' param (exact match)
  console.log('\nTest con { name: "ciro" }:');
  const r2 = await sdk.searchAgents({ name: 'ciro' }, undefined, 20);
  console.log('  Risultati:', r2.items.length);
  for (const a of r2.items) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }
}

main().catch(console.error);
