import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Simulate what our code does - paginate and filter locally
  let cursor: string | undefined;
  let allItems: any[] = [];
  let pagesChecked = 0;
  const maxPages = 15;
  const pageSize = 100;
  const queryLower = 'ciro';

  while (pagesChecked < maxPages) {
    console.log('Fetching page', pagesChecked + 1);
    const result = await sdk.searchAgents({}, ['createdAt:desc'], pageSize, cursor);
    console.log('  Got', result.items.length, 'items, cursor:', !!result.nextCursor);

    for (const agent of result.items) {
      const nameMatch = agent.name?.toLowerCase().includes(queryLower);
      const descMatch = agent.description?.toLowerCase().includes(queryLower);
      if (nameMatch || descMatch) {
        allItems.push({ id: agent.agentId, name: agent.name, active: agent.active });
        console.log('  MATCH:', agent.agentId, agent.name);
      }
    }

    cursor = result.nextCursor;
    pagesChecked++;
    if (!cursor) {
      console.log('  No more pages');
      break;
    }
  }

  console.log('\n=== RISULTATO ===');
  console.log('Trovati', allItems.length, 'agenti con "ciro"');
  for (const a of allItems) {
    console.log(' -', a.id, a.name, 'active:', a.active);
  }
}

main().catch(console.error);
