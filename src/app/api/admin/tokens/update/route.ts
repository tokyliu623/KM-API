import { NextRequest, NextResponse } from 'next/server';
import { tokenStore, auditLog } from '@/lib/token-store';
import { testToken } from '@/lib/vivo-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { old_token, new_token, token_id } = body;

    if (!old_token || !new_token || !token_id) {
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

    if (target.token !== old_token) {
      return NextResponse.json(
        { success: false, error: '原 Token 不匹配' },
        { status: 403 }
      );
    }

    const validation = await testToken(new_token);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error || '新 Token 验证失败' },
        { status: 401 }
      );
    }

    await tokenStore.update({
      where: { id: token_id },
      data: { token: new_token, updated_at: new Date().toISOString() }
    });

    await auditLog.create({
      data: {
        token_id,
        kb_name: target.kb_name,
        action: 'update',
        status: 'success',
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update token error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}