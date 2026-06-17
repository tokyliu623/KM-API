"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callWikiApi = callWikiApi;
exports.testToken = testToken;
exports.getKbInfo = getKbInfo;
exports.getContentTree = getContentTree;
exports.getContentBody = getContentBody;
exports.searchKb = searchKb;
const WIKI_BASE_URL = process.env.WIKI_BASE_URL || 'https://wiki.vivo.xyz';
async function callWikiApi(endpoint, payload, accessToken) {
    const url = `${WIKI_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
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
async function testToken(token) {
    try {
        const result = await callWikiApi('/api/v1/kb/list', {}, token);
        if (result.code === 0 && result.data) {
            return {
                valid: true,
                kb_list: result.data.kb_list,
            };
        }
        return {
            valid: false,
            error: result.msg || 'Token validation failed',
        };
    }
    catch (err) {
        return {
            valid: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}
async function getKbInfo(accessToken) {
    return callWikiApi('/api/v1/kb/list', {}, accessToken);
}
async function getContentTree(kbId, parentId, accessToken) {
    const payload = { kb_id: kbId };
    if (parentId) {
        payload.parent_id = parentId;
    }
    const token = accessToken || '';
    return callWikiApi('/api/v1/content/tree', payload, token);
}
async function getContentBody(contentIds, contentType, accessToken) {
    const payload = {
        content_ids: contentIds,
        content_type: contentType,
    };
    const token = accessToken || '';
    return callWikiApi('/api/v1/content/body', payload, token);
}
async function searchKb(kbId, keyword, page = 1, pageSize = 20, accessToken) {
    const payload = {
        kb_id: kbId,
        keyword,
        page,
        page_size: pageSize,
    };
    const token = accessToken || '';
    return callWikiApi('/api/v1/content/search', payload, token);
}
//# sourceMappingURL=vivo-api.js.map