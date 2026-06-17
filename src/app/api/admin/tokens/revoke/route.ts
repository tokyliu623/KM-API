import { NextRequest, NextResponse } from 'next/server';
import { tokenStore, auditLog } from '@/lib/token-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token_id, token } = body;

    if (!token_id || !token) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const target = await tokenStore.findUnique({ where: { id: token_id } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Token 不存在' },
        { status: 404 }
      );
    }

    if (target.token !== token) {
      return NextResponse.json(
        { success: false, error: 'Token 不匹配' },
        { status: 403 }
      );
    }

    await tokenStore.update({
      where: { id: token_id },
      data: { status: 'revoked', updated_at: new Date().toISOString() }
    });

    await auditLog.create({
      data: {
        token_id,
        kb_name: target.kb_name,
        action: 'revoke',
        status: 'success',
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Revoke token error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}