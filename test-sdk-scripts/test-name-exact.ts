import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Test with exact name
  console.log('Test { name: "Agente Ciro" }:');
  const r1 = await sdk.searchAgents({ name: 'Agente Ciro' }, undefined, 50);
  console.log('  Risultati:', r1.items.length);
  for (const a of r1.items) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }

  // Test with partial name (case insensitive?)
  console.log('\nTest { name: "Agente" }:');
  const r2 = await sdk.searchAgents({ name: 'Agente' }, undefined, 50);
  console.log('  Risultati:', r2.items.length);
  for (const a of r2.items.slice(0, 5)) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }

  // Test with "Ciro" uppercase
  console.log('\nTest { name: "Ciro" }:');
  const r3 = await sdk.searchAgents({ name: 'Ciro' }, undefined, 50);
  console.log('  Risultati:', r3.items.length);
  for (const a of r3.items) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }
}

main().catch(console.error);
