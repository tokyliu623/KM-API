import http from 'http';
import { initStore, tokenStore } from './src/lib/token-store.ts';

const PORT = 5052;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '';
  
  try {
    if (url === '/api/health') {
      const tokens = await tokenStore.findMany();
      const activeCount = tokens.filter(t => t.status === 'active').length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        tokens: activeCount,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    if (url === '/api/admin/tokens/list' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const tokens = await tokenStore.findMany();
        const sanitized = tokens.map(t => ({
          id: t.id,
          kb_name: t.kb_name,
          kb_id: t.kb_id,
          owner: t.owner,
          status: t.status,
          created_at: t.created_at,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 1, data: sanitized, msg: 'success' }));
      });
      return;
    }

    if (url === '/api/admin/tokens/upload' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const { kb_name, kb_id, token, owner } = JSON.parse(body);
        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        await tokenStore.upsert({
          where: { id },
          update: {},
          create: {
            id,
            kb_name,
            kb_id: String(kb_id),
            token,
            owner,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 1, data: { id }, msg: 'Token uploaded' }));
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, msg: 'Not found' }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, msg: String(e) }));
  }
});

async function main() {
  await initStore();
  server.listen(PORT, () => {
    console.log(`KM-API running at http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
  });
}

main().catch(console.error);