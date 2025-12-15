import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  let cursor: string | undefined;
  let pagesChecked = 0;
  const pageSize = 100;
  const queryLower = 'ciro';

  while (pagesChecked < 50) {
    const result = await sdk.searchAgents({}, ['createdAt:desc'], pageSize, cursor);
    
    let foundOnPage = false;
    for (const agent of result.items) {
      const nameMatch = agent.name?.toLowerCase().includes(queryLower);
      if (nameMatch) {
        console.log('FOUND on page', pagesChecked + 1, ':', agent.agentId, agent.name, 'active:', agent.active);
        foundOnPage = true;
      }
    }

    cursor = result.nextCursor;
    pagesChecked++;
    
    if (!cursor) {
      console.log('No more pages after', pagesChecked);
      break;
    }
    
    if (!foundOnPage && pagesChecked % 10 === 0) {
      console.log('Checked', pagesChecked, 'pages...');
    }
  }
}

main().catch(console.error);
