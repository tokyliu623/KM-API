import fs from 'fs';
import path from 'path';

const TOKEN_STORE_FILE = process.env.TOKEN_STORE_FILE || './data/token-store.json';

interface TokenRecord {
  status: string;
  [key: string]: unknown;
}

function cleanupTokens(): void {
  const filePath = path.resolve(TOKEN_STORE_FILE);

  if (!fs.existsSync(filePath)) {
    console.log('Token store file not found, nothing to clean up.');
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const tokens: TokenRecord[] = JSON.parse(content);

  const originalCount = tokens.length;
  const filteredTokens = tokens.filter(t => t.status !== 'revoked');
  const removedCount = originalCount - filteredTokens.length;

  fs.writeFileSync(filePath, JSON.stringify(filteredTokens, null, 2), 'utf-8');

  console.log(`Cleanup complete: removed ${removedCount} revoked tokens, ${filteredTokens.length} remaining.`);
}

cleanupTokens();