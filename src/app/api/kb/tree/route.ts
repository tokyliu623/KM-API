import { NextRequest, NextResponse } from 'next/server';
import { tokenStore, auditLog } from '@/lib/token-store';
import { getContentTree } from '@/lib/vivo-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token_id, kb_id, parent_id } = body;

    if (!token_id) {
      return NextResponse.json(
        { success: false, error: '缺少 token_id' },
        { status: 400 }
      );
    }

    const tokenInfo = await tokenStore.findUnique({ where: { id: token_id } });
    if (!tokenInfo || tokenInfo.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Token 无效或已停用' },
        { status: 401 }
      );
    }

    const startTime = Date.now();
    const data = await getContentTree(kb_id || tokenInfo.kb_id, parent_id, tokenInfo.token);
    const latency = Date.now() - startTime;

    await auditLog.create({
      data: {
        token_id,
        kb_name: tokenInfo.kb_name,
        action: 'kb_tree',
        latency_ms: latency,
        status: 'success',
      }
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('KB tree error:', error);
    return NextResponse.json(
      { success: false, error: '请求 wiki 服务失败' },
      { status: 502 }
    );
  }
}