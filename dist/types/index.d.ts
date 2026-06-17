export interface TokenRecord {
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
export interface AuditRecord {
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
export interface TokenStoreDB {
    tokens: TokenRecord[];
}
export interface AuditDB {
    logs: AuditRecord[];
}
export interface VivoApiResponse<T = unknown> {
    code: number;
    msg: string;
    data?: T;
}
export interface UploadTokenRequest {
    kb_name: string;
    kb_id: string;
    owner: string;
    token: string;
    env: string;
    remark?: string;
}
export interface UpdateTokenRequest {
    id: string;
    kb_name?: string;
    kb_id?: string;
    owner?: string;
    token?: string;
    env?: string;
    status?: 'active' | 'revoked';
    remark?: string;
}
export interface RevokeTokenRequest {
    id: string;
}
