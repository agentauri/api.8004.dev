import { SDK } from 'agent0-sdk';

async function main() {
  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com'
  });

  const result = await sdk.searchAgents({ limit: 2 });
  console.log('Result keys:', Object.keys(result));
  console.log('Items length:', result.items?.length);

  if (result.items?.[0]) {
    console.log('\nFirst item keys:', Object.keys(result.items[0]));
    console.log('First item:', JSON.stringify(result.items[0], null, 2));
  }
}

main().catch(console.error);
