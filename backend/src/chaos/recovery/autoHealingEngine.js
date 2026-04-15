/**
 * Phase 7 — bounded recovery attempts (rebuild snapshot + reconcile). Safe: no destructive deletes.
 */
const prisma = require("../../config/prisma");
const { buildSnapshot } = require("../../snapshot/snapshotEngine");
const { runReconciliationScope } = require("../../reconciliation/reconciliationService");

/**
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
async function healScope(businessId, clientTransactionId) {
  const t0 = Date.now();
  await buildSnapshot(prisma, businessId, clientTransactionId);
  const report = await runReconciliationScope({
    businessId,
    clientTransactionId,
    emitStream: false,
  });
  return {
    ok: report.status === "PASS",
    reconciliationStatus: report.status,
    durationMs: Date.now() - t0,
    severityScore: report.severityScore,
  };
}

module.exports = {
  healScope,
};
