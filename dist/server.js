"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fsSync = __importStar(require("fs"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const fetch = require('node-fetch');
function loadEnvFile() {
    const envPath = path_1.default.join(process.cwd(), '.env');
    try {
        const content = fsSync.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...valueParts] = trimmed.split('=');
                if (key && valueParts.length > 0) {
                    process.env[key.trim()] = valueParts.join('=').trim();
                }
            }
        }
    }
    catch (_a) {
        // .env file not found, use defaults
    }
}
loadEnvFile();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5052;
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
const TOKEN_FILE = path_1.default.join(DATA_DIR, 'token-store.json');
const AUDIT_FILE = path_1.default.join(DATA_DIR, 'audit-log.json');
const WIKI_BASE_URL = process.env.WIKI_BASE_URL || 'https://wiki.vivo.xyz';
const LLM_API_URL = process.env.LLM_API_URL || 'http://jiuwen-api.vmic.xyz/v1/chat-messages';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_BOT_ID = process.env.LLM_BOT_ID || '';
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const translateSessions = new Map();
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [kbId, session] of translateSessions.entries()) {
        if (now - session.lastUsed > SESSION_TIMEOUT_MS) {
            translateSessions.delete(kbId);
        }
    }
}
const sessionCleanupTimer = setInterval(cleanupExpiredSessions, 60 * 1000);
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
async function getTokenByKbId(kbId) {
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
    return db.tokens.find((t) => t.kb_id === String(kbId) && t.status === 'active') || null;
}
async function resolveToken(kb_id) {
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
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
    const activeTokens = db.tokens.filter((t) => t.status === 'active').length;
    res.json({
        status: 'ok',
        activeTokens,
        timestamp: new Date().toISOString(),
    });
});
app.post('/api/admin/tokens/upload', async (req, res) => {
    var _a, _b;
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
    const realKbName = ((_b = (_a = tokenTest.kbList) === null || _a === void 0 ? void 0 : _a.find((kb) => String(kb.kbId) === String(kb_id))) === null || _b === void 0 ? void 0 : _b.kbName) || kb_name;
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
    const existing = db.tokens.find((t) => t.kb_id === kb_id && t.env === env && t.status === 'active');
    if (existing) {
        res.json({ code: -1, msg: 'Token already exists for this KB and environment' });
        return;
    }
    const newToken = {
        id: (0, uuid_1.v4)(),
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
    var _a;
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
    if (status !== undefined) {
        const currentStatus = db.tokens[index].status;
        const validTransitions = {
            active: ['revoked'],
            revoked: ['active'],
        };
        if (!((_a = validTransitions[currentStatus]) === null || _a === void 0 ? void 0 : _a.includes(status))) {
            res.json({ code: -1, msg: `Invalid status transition from ${currentStatus} to ${status}` });
            return;
        }
        updateData.status = status;
    }
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
app.post('/api/admin/tokens/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) {
        res.json({ code: -1, msg: 'Token ID is required' });
        return;
    }
    const db = await readJsonFile(TOKEN_FILE, { tokens: [] });
    const index = db.tokens.findIndex((t) => t.id === id);
    if (index === -1) {
        res.json({ code: -1, msg: 'Token不存在' });
        return;
    }
    if (db.tokens[index].status !== 'revoked') {
        res.json({ code: -1, msg: '只能删除已撤销的Token' });
        return;
    }
    const kb_name = db.tokens[index].kb_name;
    db.tokens.splice(index, 1);
    await writeJsonFile(TOKEN_FILE, db);
    await logAudit({
        token_id: id,
        kb_name,
        action: 'token_delete',
        status: 'success',
    });
    res.json({
        code: 1,
        msg: 'Token已删除',
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
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/info', {}, tokenRecord.token);
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
    const payload = { kbId: parseInt(kb_id, 10) };
    if (parent_id) {
        payload.parentId = parseInt(parent_id, 10);
    }
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/content-tree', payload, tokenRecord.token);
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
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/getContentBody', {
        contentIds: content_ids.map((id) => parseInt(String(id), 10)),
        contentType: content_type,
    }, tokenRecord.token);
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
    const payload = {
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
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/contents/create', payload, tokenRecord.token);
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
    const payload = {
        contentId: parseInt(content_id, 10),
        contentType: content_type,
        content: content,
    };
    if (title) {
        payload.title = title;
    }
    const result = await callWikiApi('/api/knowledge/v1/openapi/kb/contents/update', payload, tokenRecord.token);
    res.json(result);
});
app.post('/api/llm/translate', async (req, res) => {
    var _a;
    const { prompt, kb_id, conversation_id } = req.body;
    if (!prompt) {
        res.json({ success: false, error: 'prompt is required' });
        return;
    }
    const sessionKey = kb_id || 'default';
    if (!sessionKey) {
        return res.status(400).json({ error: 'kb_id is required' });
    }
    let session = translateSessions.get(sessionKey);
    if (!session) {
        session = { conversationId: null, lastUsed: Date.now() };
        translateSessions.set(sessionKey, session);
    }
    session.lastUsed = Date.now();
    const systemPrompt = `你是一个专业的翻译专家，负责将中文翻译为英文。请遵循以下规则：
1. 只返回翻译结果，不要添加任何解释或额外内容
2. 翻译要简洁、专业、符合技术文档风格
3. 使用小写字母和连字符（kebab-case）格式
4. 如果是Skill名称，返回JSON格式：{"candidates": ["xxx-xxx-xxx"]}
5. 如果是多个候选名称，返回多个选项`;
    const timeoutMs = 35000;
    try {
        const requestBody = {
            query: prompt,
            inputs: {},
            response_mode: 'blocking',
            user: 'km-api',
        };
        const requestConversationId = conversation_id || session.conversationId;
        if (requestConversationId) {
            requestBody.conversation_id = requestConversationId;
        }
        console.log('[DEBUG] 九问 API 请求:', LLM_API_URL);
        console.log('[DEBUG] 请求体:', JSON.stringify(requestBody));
        const { stdout, stderr } = await execFileAsync('curl', [
            '-s',
            '-X', 'POST',
            LLM_API_URL,
            '-H', 'Content-Type: application/json',
            '-H', `Authorization: Bearer ${LLM_API_KEY}`,
            '-d', JSON.stringify(requestBody),
            '--max-time', '30',
        ], { timeout: timeoutMs });
        if (stderr) {
            console.log('[DEBUG] curl stderr:', stderr);
        }
        let data;
        try {
            data = JSON.parse(stdout);
        }
        catch (_b) {
            console.log('[DEBUG] curl 返回非 JSON:', stdout);
            res.json({ success: false, error: 'Invalid response from upstream API', raw: stdout });
            return;
        }
        console.log('[DEBUG] 九问 API 响应:', JSON.stringify(data));
        if (data.code && data.code !== 200 && data.code !== 0) {
            res.json({ success: false, error: `API error: ${data.message || data.msg || 'Unknown'}`, details: data });
            return;
        }
        if (data.error) {
            res.json({ success: false, error: data.error });
            return;
        }
        const content = data.answer || ((_a = data.data) === null || _a === void 0 ? void 0 : _a.answer) || '';
        if (data.conversation_id && !session.conversationId) {
            session.conversationId = data.conversation_id;
        }
        res.json({ success: true, data: { content, conversation_id: session.conversationId } });
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.log('[DEBUG] 九问 API 异常:', errorMessage);
        res.json({ success: false, error: errorMessage });
    }
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