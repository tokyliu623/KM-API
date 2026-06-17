"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const fetch = require('node-fetch');
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5052;
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
const TOKEN_FILE = path_1.default.join(DATA_DIR, 'token-store.json');
const AUDIT_FILE = path_1.default.join(DATA_DIR, 'audit-log.json');
const WIKI_BASE_URL = process.env.WIKI_BASE_URL || 'https://wiki.vivo.xyz';
app.use((0, cors_1.default)());
app.use(express_1.default.json());
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
async function logAudit(data) {
    const db = await readJsonFile(AUDIT_FILE, { logs: [] });
    const record = Object.assign(Object.assign({}, data), { id: (0, uuid_1.v4)(), created_at: new Date().toISOString() });
    db.logs.push(record);
    await writeJsonFile(AUDIT_FILE, db);
}
function generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
async function callWikiApi(endpoint, payload, accessToken) {
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
    }
    catch (err) {
        return {
            code: -1,
            msg: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}
async function testToken(token) {
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/info', {}, token);
    if (result.code === 1) {
        return { valid: true, kbList: result.data || [] };
    }
    return {
        valid: false,
        error: result.msg || 'Token validation failed',
    };
}
function maskToken(token) {
    if (token.length <= 8) {
        return '****';
    }
    return token.substring(0, 4) + '****' + token.substring(token.length - 4);
}
function getClientIp(req) {
    return req.headers['x-forwarded-for'] || req.ip || 'unknown';
}
app.get('/api/health', async (req, res) => {
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
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
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
    const existing = db.tokens.find((t) => t.kb_id === kb_id && t.env === env && t.status === 'active');
    if (existing) {
        res.json({ code: -1, msg: 'Token already exists for this KB and environment' });
        return;
    }
    const newToken = {
        id: (0, uuid_1.v4)(),
        kb_name,
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
        kb_name,
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
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
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
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
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
    const updateData = {
        updated_at: new Date().toISOString(),
    };
    if (kb_name !== undefined)
        updateData.kb_name = kb_name;
    if (kb_id !== undefined)
        updateData.kb_id = kb_id;
    if (owner !== undefined)
        updateData.owner = owner;
    if (token !== undefined)
        updateData.token = token;
    if (env !== undefined)
        updateData.env = env;
    if (status !== undefined)
        updateData.status = status;
    if (remark !== undefined)
        updateData.remark = remark;
    db.tokens[index] = Object.assign(Object.assign({}, db.tokens[index]), updateData);
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
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
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
    const { token_id } = req.body;
    if (!token_id) {
        res.json({ code: -1, msg: 'token_id is required' });
        return;
    }
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
    const tokenRecord = db.tokens.find((t) => t.id === token_id && t.status === 'active');
    if (!tokenRecord) {
        res.json({ code: -1, msg: 'Token not found or inactive' });
        return;
    }
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/info', {}, tokenRecord.token);
    res.json(result);
});
app.post('/api/kb/tree', async (req, res) => {
    const { token_id, kb_id, parent_id } = req.body;
    if (!token_id || !kb_id) {
        res.json({ code: -1, msg: 'token_id and kb_id are required' });
        return;
    }
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
    const tokenRecord = db.tokens.find((t) => t.id === token_id && t.status === 'active');
    if (!tokenRecord) {
        res.json({ code: -1, msg: 'Token not found or inactive' });
        return;
    }
    const payload = { kbId: parseInt(kb_id, 10) };
    if (parent_id) {
        payload.parentId = parseInt(parent_id, 10);
    }
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/content-tree', payload, tokenRecord.token);
    res.json(result);
});
app.post('/api/kb/content', async (req, res) => {
    const { token_id, kb_id, content_ids, content_type } = req.body;
    if (!token_id || !content_ids || !content_type) {
        res.json({ code: -1, msg: 'token_id, content_ids, and content_type are required' });
        return;
    }
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
    const tokenRecord = db.tokens.find((t) => t.id === token_id && t.status === 'active');
    if (!tokenRecord) {
        res.json({ code: -1, msg: 'Token not found or inactive' });
        return;
    }
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/getContentBody', {
        contentIds: content_ids.map((id) => parseInt(String(id), 10)),
        contentType: content_type,
    }, tokenRecord.token);
    res.json(result);
});
app.use((err, req, res, next) => {
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
//# sourceMappingURL=server.js.map