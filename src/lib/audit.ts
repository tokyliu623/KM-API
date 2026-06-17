import { auditLog } from './token-store';
import type { AuditRecord } from '@/types';

export async function logAudit(data: Omit<AuditRecord, 'id' | 'created_at'>): Promise<void> {
  await auditLog.create({ data });
}

interface ActionStats {
  [action: string]: number;
}

interface StatusStats {
  [status: string]: number;
}

interface AuditStats {
  total: number;
  by_action: ActionStats;
  by_status: StatusStats;
}

export async function getAuditStats(): Promise<AuditStats> {
  const logs = await auditLog.findMany();

  const by_action: ActionStats = {};
  const by_status: StatusStats = {};

  for (const log of logs) {
    by_action[log.action] = (by_action[log.action] || 0) + 1;
    by_status[log.status] = (by_status[log.status] || 0) + 1;
  }

  return {
    total: logs.length,
    by_action,
    by_status,
  };
}