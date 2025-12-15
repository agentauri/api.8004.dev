import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Test with 'query' param
  console.log('Test con { query: "ciro" }:');
  const r1 = await sdk.searchAgents({ query: 'ciro', limit: 3 });
  console.log('  Risultati:', r1.items.length);

  // Test with 'name' param  
  console.log('\nTest con { name: "ciro" }:');
  const r2 = await sdk.searchAgents({ name: 'ciro', limit: 3 });
  console.log('  Risultati:', r2.items.length);
}

main().catch(console.error);
