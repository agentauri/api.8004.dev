import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo'
  });

  // Get the ciro agents directly
  const ciroIds = ['11155111:1390', '11155111:771', '11155111:770', '11155111:769'];
  
  for (const id of ciroIds) {
    console.log('\n=== Agent', id, '===');
    const agent = await sdk.getAgent(id);
    if (agent) {
      console.log('  name:', agent.name);
      console.log('  active:', agent.active);
      console.log('  description:', agent.description);
    } else {
      console.log('  NOT FOUND');
    }
  }
}

main().catch(console.error);
