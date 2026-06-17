import type { AuditRecord } from '@/types';
export declare function logAudit(data: Omit<AuditRecord, 'id' | 'created_at'>): Promise<void>;
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
export declare function getAuditStats(): Promise<AuditStats>;
export {};
//# sourceMappingURL=audit.d.ts.map