import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { tokenStore, auditLog } from '@/lib/token-store';
import { testToken } from '@/lib/vivo-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, kb_name, kb_id, owner, env = 'prd', remark } = body;

    if (!token || !kb_id) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数 token 或 kb_id' },
        { status: 400 }
      );
    }

    const validation = await testToken(token);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error || 'Token 验证失败' },
        { status: 401 }
      );
    }

    const existing = await tokenStore.findMany({
      where: { kb_id, status: 'active' }
    });
    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: '该知识库已存在有效 Token' },
        { status: 409 }
      );
    }

    const tokenId = uuidv4();
    const now = new Date().toISOString();
    
    const newToken = await tokenStore.upsert({
      where: { id: tokenId },
      update: {},
      create: {
        id: tokenId,
        token,
        kb_id,
        kb_name: kb_name || '',
        owner: owner || '',
        env,
        status: 'active',
        remark,
        created_at: now,
        updated_at: now,
      }
    });

    await auditLog.create({
      data: {
        token_id: tokenId,
        kb_name: newToken.kb_name,
        action: 'upload',
        status: 'success',
      }
    });

    return NextResponse.json({
      success: true,
      token_id: tokenId,
      kb_name: newToken.kb_name,
      kb_id: newToken.kb_id,
    });
  } catch (error) {
    console.error('Upload token error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}