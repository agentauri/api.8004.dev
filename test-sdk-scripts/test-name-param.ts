import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Test name parameter for substring search
  console.log('Test { name: "ciro" }:');
  const result = await sdk.searchAgents({ name: 'ciro' }, undefined, 50);
  console.log('  Risultati:', result.items.length);
  for (const a of result.items) {
    console.log('  -', a.agentId, a.name, 'active:', a.active);
  }
}

main().catch(console.error);
