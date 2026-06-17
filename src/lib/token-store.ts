import { promises as fs } from 'fs';
import path from 'path';
import type { TokenRecord, TokenStoreDB, AuditRecord, AuditDB } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'token-store.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.json');

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

export async function initStore(): Promise<void> {
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

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

interface WhereCondition {
  id?: string;
  kb_id?: string;
  status?: 'active' | 'revoked';
  owner?: string;
}

interface FindOptions {
  where?: WhereCondition;
  orderBy?: { field: keyof TokenRecord; direction: 'asc' | 'desc' };
  limit?: number;
}

interface UpsertParams {
  where: { id: string };
  update: Partial<TokenRecord>;
  create: TokenRecord;
}

interface UpdateParams {
  where: { id: string };
  data: Partial<TokenRecord>;
}

const tokenStore = {
  async findUnique({ where }: { where: { id: string } }): Promise<TokenRecord | null> {
    const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
    return db.tokens.find((t) => t.id === where.id) || null;
  },

  async findMany(options?: FindOptions): Promise<TokenRecord[]> {
    const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
    let results = [...db.tokens];

    if (options?.where) {
      const { id, kb_id, status, owner } = options.where;
      if (id) results = results.filter((t) => t.id === id);
      if (kb_id) results = results.filter((t) => t.kb_id === kb_id);
      if (status) results = results.filter((t) => t.status === status);
      if (owner) results = results.filter((t) => t.owner === owner);
    }

    if (options?.orderBy) {
      const { field, direction } = options.orderBy;
      results.sort((a, b) => {
        const aVal = a[field] ?? '';
        const bVal = b[field] ?? '';
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  },

  async upsert({ where, update, create }: UpsertParams): Promise<TokenRecord> {
    const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
    const index = db.tokens.findIndex((t) => t.id === where.id);

    if (index !== -1) {
      db.tokens[index] = { ...db.tokens[index], ...update, updated_at: new Date().toISOString() };
      await writeJsonFile(TOKEN_FILE, db);
      return db.tokens[index];
    }

    db.tokens.push(create);
    await writeJsonFile(TOKEN_FILE, db);
    return create;
  },

  async update({ where, data }: UpdateParams): Promise<TokenRecord | null> {
    const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
    const index = db.tokens.findIndex((t) => t.id === where.id);

    if (index === -1) return null;

    db.tokens[index] = { ...db.tokens[index], ...data, updated_at: new Date().toISOString() };
    await writeJsonFile(TOKEN_FILE, db);
    return db.tokens[index];
  },

  async delete({ where }: { where: { id: string } }): Promise<void> {
    const db = await readJsonFile<TokenStoreDB>(TOKEN_FILE, { tokens: [] });
    db.tokens = db.tokens.filter((t) => t.id !== where.id);
    await writeJsonFile(TOKEN_FILE, db);
  },
};

interface AuditCreateParams {
  data: Omit<AuditRecord, 'id' | 'created_at'>;
}

interface AuditFindOptions {
  where?: {
    token_id?: string;
    action?: string;
    status?: 'success' | 'failed';
    created_after?: string;
    created_before?: string;
  };
  orderBy?: { field: keyof AuditRecord; direction: 'asc' | 'desc' };
  limit?: number;
}

const auditLog = {
  async create({ data }: AuditCreateParams): Promise<AuditRecord> {
    const db = await readJsonFile<AuditDB>(AUDIT_FILE, { logs: [] });
    const record: AuditRecord = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
    };
    db.logs.push(record);
    await writeJsonFile(AUDIT_FILE, db);
    return record;
  },

  async findMany(options?: AuditFindOptions): Promise<AuditRecord[]> {
    const db = await readJsonFile<AuditDB>(AUDIT_FILE, { logs: [] });
    let results = [...db.logs];

    if (options?.where) {
      const { token_id, action, status, created_after, created_before } = options.where;
      if (token_id) results = results.filter((l) => l.token_id === token_id);
      if (action) results = results.filter((l) => l.action === action);
      if (status) results = results.filter((l) => l.status === status);
      if (created_after) results = results.filter((l) => l.created_at >= created_after);
      if (created_before) results = results.filter((l) => l.created_at <= created_before);
    }

    if (options?.orderBy) {
      const { field, direction } = options.orderBy;
      results.sort((a, b) => {
        const aVal = a[field] ?? '';
        const bVal = b[field] ?? '';
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  },
};

export { tokenStore, auditLog };