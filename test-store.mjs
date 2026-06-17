import { tokenStore, initStore } from './src/lib/token-store';

async function main() {
  console.log('Initializing store...');
  await initStore();
  
  console.log('Fetching tokens...');
  const tokens = await tokenStore.findMany();
  console.log('Tokens count:', tokens.length);
  
  console.log('All OK!');
}

main().catch(console.error);