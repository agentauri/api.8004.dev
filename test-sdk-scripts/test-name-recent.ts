import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Get first agent name
  console.log('Get first agent:');
  const first = await sdk.searchAgents({}, undefined, 1);
  const firstName = first.items[0]?.name;
  console.log('  First agent name:', firstName);

  // Now search for it
  if (firstName) {
    console.log('\nSearch { name: "' + firstName.substring(0, 5) + '" }:');
    const r = await sdk.searchAgents({ name: firstName.substring(0, 5) }, undefined, 10);
    console.log('  Risultati:', r.items.length);
    for (const a of r.items) {
      console.log('  -', a.agentId, a.name);
    }
  }
}

main().catch(console.error);
