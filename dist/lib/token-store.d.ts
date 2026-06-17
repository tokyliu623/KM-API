import type { TokenRecord, AuditRecord } from '@/types';
export declare function initStore(): Promise<void>;
interface WhereCondition {
    id?: string;
    kb_id?: string;
    status?: 'active' | 'revoked';
    owner?: string;
}
interface FindOptions {
    where?: WhereCondition;
    orderBy?: {
        field: keyof TokenRecord;
        direction: 'asc' | 'desc';
    };
    limit?: number;
}
interface UpsertParams {
    where: {
        id: string;
    };
    update: Partial<TokenRecord>;
    create: TokenRecord;
}
interface UpdateParams {
    where: {
        id: string;
    };
    data: Partial<TokenRecord>;
}
declare const tokenStore: {
    findUnique({ where }: {
        where: {
            id: string;
        };
    }): Promise<TokenRecord | null>;
    findMany(options?: FindOptions): Promise<TokenRecord[]>;
    upsert({ where, update, create }: UpsertParams): Promise<TokenRecord>;
    update({ where, data }: UpdateParams): Promise<TokenRecord | null>;
    delete({ where }: {
        where: {
            id: string;
        };
    }): Promise<void>;
};
interface AuditCreateParams {
    data: Omit<AuditRecord, 'id' | 'created_at'>;
}
interface AuditFindOptions {
    where?: {
        token_id?: string;
        action?: string;
        status?: 'success' | 'failed';
        created_after?: string;
        created_before?: string;
    };
    orderBy?: {
        field: keyof AuditRecord;
        direction: 'asc' | 'desc';
    };
    limit?: number;
}
declare const auditLog: {
    create({ data }: AuditCreateParams): Promise<AuditRecord>;
    findMany(options?: AuditFindOptions): Promise<AuditRecord[]>;
};
export { tokenStore, auditLog };
//# sourceMappingURL=token-store.d.ts.map