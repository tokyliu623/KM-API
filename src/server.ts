import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 5052;
const DATA_DIR = path.join(process.cwd(), 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'token-store.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.json');
const WIKI_BASE_URL = process.env.WIKI_BASE_URL || 'https://wiki.vivo.xyz';

app.use(cors());
app.use(express.json());

interface TokenRecord {
  id: string;
  kb_name: string;
  kb_id: string;
  owner: string;
  token: string;
  env: string;
  status: 'active' | 'revoked';
  remark?: string;
  created_at: string;
  updated_at: string;
}

interface AuditRecord {
  id: string;
  token_id: string;
  kb_name: string;
  action: string;
  user_ip?: string;
  user_agent?: string;
  latency_ms?: number;
  status: 'success' | 'failed';
  error?: string;
  created_at: string;
}

interface TokenStoreDB {
  tokens: TokenRecord[];
}

interface AuditDB {
  logs: AuditRecord[];
}

interface KbInfo {
  kbId: number;
  kbName: string;
  effectivePermType: string;
  accessBlocked: boolean;
  link: string;
}

interface ContentTreeNode {
  id: number;
  spaceId: number;
  kbId: number;
  parentId: number | null;
  title: string;
  hasChild: boolean;
  spaceName: string;
  kbName: string;
}

interface ContentBody {
  contentId: number;
  title: string;
  content: string;
  kbId: number;
  kbName: string;
  spaceId: number;
  spaceName: string;
  link: string;
}

interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

async function readJsonFile<T>(filepath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

async function writeJsonFile<T>(filepath: string, data: T): Promise<void> {
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

async function initStore(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  const tokenDb = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
  if (!('tokens' in tokenDb)) {
    await writeJsonFile(TOKEN_FILE, { tokens: [] });
  }

  const auditDb = await readJsonFile<AuditDB>(AUDIT_FILE, { logs: [] });
  if (!('logs' in auditDb)) {
    await writeJsonFile(AUDIT_FILE, { logs: [] });
  }
}

async function logAudit(data: Omit<AuditRecord, 'id' | 'created_at'>): Promise<void> {
  const db = await readJsonFile<AuditDB>(AUDIT_FILE, { logs: [] });
  const record: AuditRecord = {
    ...data,
    id: uuidv4(),
    created_at: new Date().toISOString(),
  };
  db.logs.push(record);
  await writeJsonFile(AUDIT_FILE, db);
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function callWikiApi<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  accessToken: string
): Promise<ApiResponse<T>> {
  const url = `${WIKI_BASE_URL}${endpoint}`;
  const requestId = generateRequestId();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accessToken': accessToken,
        'requestId': requestId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        code: response.status,
        msg: `HTTP error: ${response.status} ${response.statusText}`,
      };
    }

    return response.json();
  } catch (err) {
    return {
      code: -1,
      msg: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function testToken(token: string): Promise<{ valid: boolean; error?: string; kbList?: KbInfo[] }> {
  const result = await callWikiApi<KbInfo[]>(
    '/api/knowledge/v1/openapi/kb/info',
    {},
    token
  );

  if (result.code === 1) {
    return { valid: true, kbList: result.data || [] };
  }

  return {
    valid: false,
    error: result.msg || 'Token validation failed',
  };
}

function maskToken(token: string): string {
  if (token.length <= 8) {
    return '****';
  }
  return token.substring(0, 4) + '****' + token.substring(token.length - 4);
}

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
}

async function getTokenByKbId(kbId: string): Promise<TokenRecord | null> {
  const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
  return db.tokens.find((t) => t.kb_id === String(kbId) && t.status === 'active') || null;
}

async function resolveToken(kb_id: string): Promise<{ tokenRecord: TokenRecord | null; error: string | null }> {
  if (!kb_id) {
    return { tokenRecord: null, error: 'kb_id is required' };
  }

  const tokenRecord = await getTokenByKbId(kb_id);
  if (!tokenRecord) {
    return { tokenRecord: null, error: 'No active token found for this kb_id' };
  }
  return { tokenRecord, error: null };
}

app.get('/api/health', async (req, res) => {
  const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
  const activeTokens = db.tokens.filter((t) => t.status === 'active').length;

  res.json({
    status: 'ok',
    activeTokens,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/admin/tokens/upload', async (req, res) => {
  const { kb_name, kb_id, owner, token, env, remark } = req.body;

  if (!kb_name || !kb_id || !owner || !token || !env) {
    res.json({ code: -1, msg: 'Missing required fields' });
    return;
  }

  const tokenTest = await testToken(token);
  if (!tokenTest.valid) {
    res.json({ code: -1, msg: `Token validation failed: ${tokenTest.error}` });
    return;
  }

  const realKbName = tokenTest.kbList?.find((kb) => String(kb.kbId) === String(kb_id))?.kbName || kb_name;

  const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
  const existing = db.tokens.find((t) => t.kb_id === kb_id && t.env === env && t.status === 'active');

  if (existing) {
    res.json({ code: -1, msg: 'Token already exists for this KB and environment' });
    return;
  }

  const newToken: TokenRecord = {
    id: uuidv4(),
    kb_name: realKbName,
    kb_id,
    owner,
    token,
    env,
    status: 'active',
    remark,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.tokens.push(newToken);
  await writeJsonFile(TOKEN_FILE, db);

  await logAudit({
    token_id: newToken.id,
    kb_name: realKbName,
    action: 'token_upload',
    status: 'success',
  });

  res.json({
    code: 1,
    msg: 'Token uploaded successfully',
    data: {
      id: newToken.id,
      kb_name: newToken.kb_name,
      kb_id: newToken.kb_id,
      owner: newToken.owner,
      env: newToken.env,
      status: newToken.status,
      created_at: newToken.created_at,
    },
  });
});

app.get('/api/admin/tokens/list', async (req, res) => {
  const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });

  const tokens = db.tokens.map((t) => ({
    id: t.id,
    kb_name: t.kb_name,
    kb_id: t.kb_id,
    owner: t.owner,
    token: maskToken(t.token),
    env: t.env,
    status: t.status,
    remark: t.remark,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));

  res.json({
    code: 1,
    msg: 'success',
    data: { tokens },
  });
});

app.post('/api/admin/tokens/update', async (req, res) => {
  const { id, kb_name, kb_id, owner, token, env, status, remark } = req.body;

  if (!id) {
    res.json({ code: -1, msg: 'Token ID is required' });
    return;
  }

  const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
  const index = db.tokens.findIndex((t) => t.id === id);

  if (index === -1) {
    res.json({ code: -1, msg: 'Token not found' });
    return;
  }

  if (token) {
    const tokenTest = await testToken(token);
    if (!tokenTest.valid) {
      res.json({ code: -1, msg: `Token validation failed: ${tokenTest.error}` });
      return;
    }
  }

  const updateData: Partial<TokenRecord> = {
    updated_at: new Date().toISOString(),
  };

  if (kb_name !== undefined) updateData.kb_name = kb_name;
  if (kb_id !== undefined) updateData.kb_id = kb_id;
  if (owner !== undefined) updateData.owner = owner;
  if (token !== undefined) updateData.token = token;
  if (env !== undefined) updateData.env = env;
  if (status !== undefined) {
    const currentStatus = db.tokens[index].status;
    const validTransitions: Record<string, string[]> = {
      active: ['revoked'],
      revoked: ['active'],
    };
    if (!validTransitions[currentStatus]?.includes(status)) {
      res.json({ code: -1, msg: `Invalid status transition from ${currentStatus} to ${status}` });
      return;
    }
    updateData.status = status;
  }
  if (remark !== undefined) updateData.remark = remark;

  db.tokens[index] = { ...db.tokens[index], ...updateData };
  await writeJsonFile(TOKEN_FILE, db);

  await logAudit({
    token_id: id,
    kb_name: db.tokens[index].kb_name,
    action: 'token_update',
    status: 'success',
  });

  res.json({
    code: 1,
    msg: 'Token updated successfully',
    data: {
      id: db.tokens[index].id,
      kb_name: db.tokens[index].kb_name,
      status: db.tokens[index].status,
    },
  });
});

app.post('/api/admin/tokens/revoke', async (req, res) => {
  const { id } = req.body;

  if (!id) {
    res.json({ code: -1, msg: 'Token ID is required' });
    return;
  }

  const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
  const index = db.tokens.findIndex((t) => t.id === id);

  if (index === -1) {
    res.json({ code: -1, msg: 'Token not found' });
    return;
  }

  db.tokens[index].status = 'revoked';
  db.tokens[index].updated_at = new Date().toISOString();
  await writeJsonFile(TOKEN_FILE, db);

  await logAudit({
    token_id: id,
    kb_name: db.tokens[index].kb_name,
    action: 'token_revoke',
    status: 'success',
  });

  res.json({
    code: 1,
    msg: 'Token revoked successfully',
  });
});

app.post('/api/kb/info', async (req, res) => {
  const { kb_id } = req.body;

  if (!kb_id) {
    res.json({ code: -1, msg: 'kb_id is required' });
    return;
  }

  const { tokenRecord, error } = await resolveToken(kb_id);
  if (error || !tokenRecord) {
    res.json({ code: -1, msg: error || 'Token not found or inactive' });
    return;
  }

  const result = await callWikiApi<KbInfo[]>(
    '/api/knowledge/v1/openapi/kb/info',
    {},
    tokenRecord.token
  );

  res.json(result);
});

app.post('/api/kb/tree', async (req, res) => {
  const { kb_id, parent_id } = req.body;

  if (!kb_id) {
    res.json({ code: -1, msg: 'kb_id is required' });
    return;
  }

  const { tokenRecord, error } = await resolveToken(kb_id);
  if (error || !tokenRecord) {
    res.json({ code: -1, msg: error || 'Token not found or inactive' });
    return;
  }

  const payload: Record<string, unknown> = { kbId: parseInt(kb_id, 10) };
  if (parent_id) {
    payload.parentId = parseInt(parent_id, 10);
  }

  const result = await callWikiApi<ContentTreeNode[]>(
    '/api/knowledge/v1/openapi/kb/content-tree',
    payload,
    tokenRecord.token
  );

  res.json(result);
});

app.post('/api/kb/content', async (req, res) => {
  const { kb_id, content_ids, content_type } = req.body;

  if (!content_ids || !content_type) {
    res.json({ code: -1, msg: 'content_ids and content_type are required' });
    return;
  }

  if (!['markdown', 'html'].includes(content_type)) {
    res.json({ code: -1, msg: 'content_type must be "markdown" or "html"' });
    return;
  }

  const { tokenRecord, error } = await resolveToken(kb_id);
  if (error || !tokenRecord) {
    res.json({ code: -1, msg: error || 'Token not found or inactive' });
    return;
  }

  if (parseInt(tokenRecord.kb_id, 10) !== parseInt(kb_id, 10)) {
    res.json({ code: -1, msg: 'kb_id does not match token associated kb_id' });
    return;
  }

  const result = await callWikiApi<{ type: string; content: ContentBody[] }>(
    '/api/knowledge/v1/openapi/kb/getContentBody',
    {
      contentIds: content_ids.map((id: string | number) => parseInt(String(id), 10)),
      contentType: content_type,
    },
    tokenRecord.token
  );

  res.json(result);
});

app.post('/api/kb/contents/create', async (req, res) => {
  const { kb_id, parent_id, title, content_type, content } = req.body;

  if (!kb_id) {
    res.json({ code: -1, msg: 'kb_id is required' });
    return;
  }

  if (!content_type || !content) {
    res.json({ code: -1, msg: 'content_type and content are required' });
    return;
  }

  const { tokenRecord, error } = await resolveToken(kb_id);
  if (error || !tokenRecord) {
    res.json({ code: -1, msg: error || 'Token not found or inactive' });
    return;
  }

  const payload: Record<string, unknown> = {
    kbId: parseInt(kb_id, 10),
    contentType: content_type,
    content: content,
  };

  if (parent_id) {
    payload.parentId = parseInt(parent_id, 10);
  }

  if (title) {
    payload.title = title;
  }

  const result = await callWikiApi<{ contentId: number; link: string }>(
    '/api/knowledge/v1/openapi/kb/contents/create',
    payload,
    tokenRecord.token
  );

  res.json(result);
});

app.post('/api/kb/contents/update', async (req, res) => {
  const { kb_id, content_id, title, content_type, content } = req.body;

  if (!content_id) {
    res.json({ code: -1, msg: 'content_id is required' });
    return;
  }

  if (!kb_id) {
    res.json({ code: -1, msg: 'kb_id is required' });
    return;
  }

  if (!content_type || !content) {
    res.json({ code: -1, msg: 'content_type and content are required' });
    return;
  }

  const { tokenRecord, error } = await resolveToken(kb_id);
  if (error || !tokenRecord) {
    res.json({ code: -1, msg: error || 'Token not found or inactive' });
    return;
  }

  const payload: Record<string, unknown> = {
    contentId: parseInt(content_id, 10),
    contentType: content_type,
    content: content,
  };

  if (title) {
    payload.title = title;
  }

  const result = await callWikiApi<{ contentId: number; link: string }>(
    '/api/knowledge/v1/openapi/kb/contents/update',
    payload,
    tokenRecord.token
  );

  res.json(result);
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ code: -1, msg: err.message || 'Internal server error' });
});

async function main() {
  await initStore();
  app.listen(PORT, () => {
    console.log(`KM-API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

main().catch(console.error);