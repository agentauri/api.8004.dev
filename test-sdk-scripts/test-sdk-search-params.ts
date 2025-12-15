import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Test various search params to find one that actually filters
  const tests = [
    { name: 'ciro' },
    { description: 'ciro' },
    { query: 'ciro' } as any,
    { names: ['ciro'] } as any,
  ];

  for (const params of tests) {
    console.log('\nTest:', JSON.stringify(params));
    const r = await sdk.searchAgents(params, undefined, 50);
    const matching = r.items.filter(a => 
      a.name.toLowerCase().includes('ciro') || 
      a.description?.toLowerCase().includes('ciro')
    );
    console.log('  Total:', r.items.length, '| Con "ciro":', matching.length);
    if (matching.length > 0) {
      for (const a of matching) {
        console.log('    -', a.agentId, a.name);
      }
    }
  }
}

main().catch(console.error);
