import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  console.log('Search { name: "Agente" }:');
  const r = await sdk.searchAgents({ name: 'Agente' }, undefined, 20);
  console.log('  Risultati:', r.items.length);
  for (const a of r.items) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }

  console.log('\nSearch { name: "agente" } (lowercase):');
  const r2 = await sdk.searchAgents({ name: 'agente' }, undefined, 20);
  console.log('  Risultati:', r2.items.length);
  for (const a of r2.items) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }
}

main().catch(console.error);
