import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Fetch more agents and filter locally
  console.log('Cercando agenti con "ciro" nel nome...');
  let cursor: string | undefined;
  let found: any[] = [];
  let pages = 0;
  
  while (pages < 20) {
    const result = await sdk.searchAgents({}, ['createdAt:desc'], 100, cursor);
    
    for (const a of result.items) {
      if (a.name.toLowerCase().includes('ciro') || a.description?.toLowerCase().includes('ciro')) {
        found.push({ id: a.agentId, name: a.name, active: a.active });
      }
    }
    
    cursor = result.nextCursor;
    pages++;
    if (!cursor) break;
  }

  console.log('\nAgenti trovati con "ciro":', found.length);
  for (const a of found) {
    console.log('  -', a.id, a.name, 'active:', a.active);
  }
}

main().catch(console.error);
