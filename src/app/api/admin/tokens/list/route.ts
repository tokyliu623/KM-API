import { NextResponse } from 'next/server';
import { tokenStore } from '@/lib/token-store';

export async function GET() {
  try {
    const tokens = await tokenStore.findMany();
    const sanitized = tokens.map(({ token, ...rest }) => rest);
    return NextResponse.json(sanitized);
  } catch (error) {
    console.error('List tokens error:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}