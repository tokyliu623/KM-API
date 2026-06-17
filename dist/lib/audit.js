"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
exports.getAuditStats = getAuditStats;
const token_store_1 = require("./token-store");
async function logAudit(data) {
    await token_store_1.auditLog.create({ data });
}
async function getAuditStats() {
    const logs = await token_store_1.auditLog.findMany();
    const by_action = {};
    const by_status = {};
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
//# sourceMappingURL=audit.js.map