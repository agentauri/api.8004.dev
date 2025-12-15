import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  console.log('Search { description: "Neapolitan" }:');
  const r = await sdk.searchAgents({ description: 'Neapolitan' }, undefined, 20);
  console.log('  Risultati:', r.items.length);
  for (const a of r.items) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }
}

main().catch(console.error);
