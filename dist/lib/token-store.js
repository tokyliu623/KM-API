"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLog = exports.tokenStore = void 0;
exports.initStore = initStore;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
const TOKEN_FILE = path_1.default.join(DATA_DIR, 'token-store.json');
const AUDIT_FILE = path_1.default.join(DATA_DIR, 'audit-log.json');
async function readJsonFile(filepath, defaultValue) {
    try {
        const content = await fs_1.promises.readFile(filepath, 'utf-8');
        return JSON.parse(content);
    }
    catch (_a) {
        return defaultValue;
    }
}
async function writeJsonFile(filepath, data) {
    await fs_1.promises.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
}
async function initStore() {
    try {
        await fs_1.promises.access(DATA_DIR);
    }
    catch (_a) {
        await fs_1.promises.mkdir(DATA_DIR, { recursive: true });
    }
    const tokenDb = await readJsonFile(TOKEN_FILE, { tokens: [] });
    if (!('tokens' in tokenDb)) {
        await writeJsonFile(TOKEN_FILE, { tokens: [] });
    }
    const auditDb = await readJsonFile(AUDIT_FILE, { logs: [] });
    if (!('logs' in auditDb)) {
        await writeJsonFile(AUDIT_FILE, { logs: [] });
    }
}
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
const tokenStore = {
    async findUnique({ where }) {
        const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
        return db.tokens.find((t) => t.id === where.id) || null;
    },
    async findMany(options) {
        const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
        let results = [...db.tokens];
        if (options === null || options === void 0 ? void 0 : options.where) {
            const { id, kb_id, status, owner } = options.where;
            if (id)
                results = results.filter((t) => t.id === id);
            if (kb_id)
                results = results.filter((t) => t.kb_id === kb_id);
            if (status)
                results = results.filter((t) => t.status === status);
            if (owner)
                results = results.filter((t) => t.owner === owner);
        }
        if (options === null || options === void 0 ? void 0 : options.orderBy) {
            const { field, direction } = options.orderBy;
            results.sort((a, b) => {
                var _a, _b;
                const aVal = (_a = a[field]) !== null && _a !== void 0 ? _a : '';
                const bVal = (_b = b[field]) !== null && _b !== void 0 ? _b : '';
                if (aVal < bVal)
                    return direction === 'asc' ? -1 : 1;
                if (aVal > bVal)
                    return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        if (options === null || options === void 0 ? void 0 : options.limit) {
            results = results.slice(0, options.limit);
        }
        return results;
    },
    async upsert({ where, update, create }) {
        const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
        const index = db.tokens.findIndex((t) => t.id === where.id);
        if (index !== -1) {
            db.tokens[index] = Object.assign(Object.assign(Object.assign({}, db.tokens[index]), update), { updated_at: new Date().toISOString() });
            await writeJsonFile(TOKEN_FILE, db);
            return db.tokens[index];
        }
        db.tokens.push(create);
        await writeJsonFile(TOKEN_FILE, db);
        return create;
    },
    async update({ where, data }) {
        const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
        const index = db.tokens.findIndex((t) => t.id === where.id);
        if (index === -1)
            return null;
        db.tokens[index] = Object.assign(Object.assign(Object.assign({}, db.tokens[index]), data), { updated_at: new Date().toISOString() });
        await writeJsonFile(TOKEN_FILE, db);
        return db.tokens[index];
    },
    async delete({ where }) {
        const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
        db.tokens = db.tokens.filter((t) => t.id !== where.id);
        await writeJsonFile(TOKEN_FILE, db);
    },
};
exports.tokenStore = tokenStore;
const auditLog = {
    async create({ data }) {
        const db = await readJsonFile(AUDIT_FILE, { logs: [] });
        const record = Object.assign(Object.assign({}, data), { id: generateId(), created_at: new Date().toISOString() });
        db.logs.push(record);
        await writeJsonFile(AUDIT_FILE, db);
        return record;
    },
    async findMany(options) {
        const db = await readJsonFile(AUDIT_FILE, { logs: [] });
        let results = [...db.logs];
        if (options === null || options === void 0 ? void 0 : options.where) {
            const { token_id, action, status, created_after, created_before } = options.where;
            if (token_id)
                results = results.filter((l) => l.token_id === token_id);
            if (action)
                results = results.filter((l) => l.action === action);
            if (status)
                results = results.filter((l) => l.status === status);
            if (created_after)
                results = results.filter((l) => l.created_at >= created_after);
            if (created_before)
                results = results.filter((l) => l.created_at <= created_before);
        }
        if (options === null || options === void 0 ? void 0 : options.orderBy) {
            const { field, direction } = options.orderBy;
            results.sort((a, b) => {
                var _a, _b;
                const aVal = (_a = a[field]) !== null && _a !== void 0 ? _a : '';
                const bVal = (_b = b[field]) !== null && _b !== void 0 ? _b : '';
                if (aVal < bVal)
                    return direction === 'asc' ? -1 : 1;
                if (aVal > bVal)
                    return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        if (options === null || options === void 0 ? void 0 : options.limit) {
            results = results.slice(0, options.limit);
        }
        return results;
    },
};
exports.auditLog = auditLog;
//# sourceMappingURL=token-store.js.map