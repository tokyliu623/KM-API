import type { VivoApiResponse } from '@/types';

const WIKI_BASE_URL = process.env.WIKI_BASE_URL || 'https://wiki.vivo.xyz';

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

export async function callWikiApi<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  accessToken: string
): Promise<VivoApiResponse<T>> {
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

export async function testToken(token: string): Promise<TestTokenResult> {
  try {
    const result = await callWikiApi<{ kb_list: KbInfo[] }>(
      '/api/v1/kb/list',
      {},
      token
    );

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
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function getKbInfo(accessToken: string): Promise<VivoApiResponse<{ kb_list: KbInfo[] }>> {
  return callWikiApi<{ kb_list: KbInfo[] }>('/api/v1/kb/list', {}, accessToken);
}

export async function getContentTree(
  kbId: string,
  parentId?: string,
  accessToken?: string
): Promise<VivoApiResponse<{ tree: ContentNode[] }>> {
  const payload: Record<string, unknown> = { kb_id: kbId };
  if (parentId) {
    payload.parent_id = parentId;
  }

  const token = accessToken || '';
  return callWikiApi<{ tree: ContentNode[] }>('/api/v1/content/tree', payload, token);
}

export async function getContentBody(
  contentIds: string[],
  contentType: string,
  accessToken?: string
): Promise<VivoApiResponse<{ contents: ContentBody[] }>> {
  const payload = {
    content_ids: contentIds,
    content_type: contentType,
  };

  const token = accessToken || '';
  return callWikiApi<{ contents: ContentBody[] }>('/api/v1/content/body', payload, token);
}

export async function searchKb(
  kbId: string,
  keyword: string,
  page: number = 1,
  pageSize: number = 20,
  accessToken?: string
): Promise<VivoApiResponse<{ results: SearchResult[]; total: number }>> {
  const payload = {
    kb_id: kbId,
    keyword,
    page,
    page_size: pageSize,
  };

  const token = accessToken || '';
  return callWikiApi<{ results: SearchResult[]; total: number }>('/api/v1/content/search', payload, token);
}