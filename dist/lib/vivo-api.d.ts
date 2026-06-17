import type { VivoApiResponse } from '@/types';
interface KbInfo {
    id: string;
    name: string;
    owner: string;
    created_at: string;
}
interface ContentNode {
    id: string;
    title: string;
    type: string;
    parent_id?: string;
    children?: ContentNode[];
}
interface ContentBody {
    id: string;
    content: string;
    type: string;
}
interface SearchResult {
    id: string;
    title: string;
    type: string;
    score: number;
}
interface TestTokenResult {
    valid: boolean;
    kb_list?: KbInfo[];
    error?: string;
}
export declare function callWikiApi<T>(endpoint: string, payload: Record<string, unknown>, accessToken: string): Promise<VivoApiResponse<T>>;
export declare function testToken(token: string): Promise<TestTokenResult>;
export declare function getKbInfo(accessToken: string): Promise<VivoApiResponse<{
    kb_list: KbInfo[];
}>>;
export declare function getContentTree(kbId: string, parentId?: string, accessToken?: string): Promise<VivoApiResponse<{
    tree: ContentNode[];
}>>;
export declare function getContentBody(contentIds: string[], contentType: string, accessToken?: string): Promise<VivoApiResponse<{
    contents: ContentBody[];
}>>;
export declare function searchKb(kbId: string, keyword: string, page?: number, pageSize?: number, accessToken?: string): Promise<VivoApiResponse<{
    results: SearchResult[];
    total: number;
}>>;
export {};
//# sourceMappingURL=vivo-api.d.ts.map