import { NextResponse } from 'next/server';
import { tokenStore } from '@/lib/token-store';

export async function GET() {
  const tokens = await tokenStore.findMany();
  const activeCount = tokens.filter(t => t.status === 'active').length;
  return NextResponse.json({
    status: 'ok',
    tokens: activeCount,
    timestamp: new Date().toISOString(),
  });
}