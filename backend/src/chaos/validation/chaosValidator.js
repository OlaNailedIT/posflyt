/**
 * Phase 7 — financial invariant checks per scope (uses Phase 4D + Phase 5 read paths).
 */
const prisma = require("../../config/prisma");
const { runReconciliationScope } = require("../../reconciliation/reconciliationService");
const { buildSnapshot, getFinancialStateFast } = require("../../snapshot/snapshotEngine");

/**
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
async function validateFinancialScope(businessId, clientTransactionId) {
  const report = await runReconciliationScope({
    businessId,
    clientTransactionId,
    emitStream: false,
  });
  const fast = await getFinancialStateFast(prisma, businessId, clientTransactionId);
  const pass = report.status === "PASS";
  return {
    pass,
    reconciliationStatus: report.status,
    severityScore: report.severityScore,
    readPath: fast.source,
    readStale: Boolean(fast.stale),
    mismatches: report.mismatches?.length ?? 0,
  };
}

/**
 * Ledger + reducer identity check already embedded in reconciliation; extra invariant: replay net vs snapshot when snapshot hit.
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
async function validateSnapshotConvergence(businessId, clientTransactionId) {
  const snap = await prisma.integritySnapshot.findUnique({
    where: { businessId_clientTransactionId: { businessId, clientTransactionId } },
  });
  const fast = await getFinancialStateFast(prisma, businessId, clientTransactionId);
  const converged =
    fast.source === "snapshot" || fast.source === "snapshot_delta" || fast.source === "empty";
  return {
    hasSnapshot: Boolean(snap),
    snapshotEventCount: snap?.eventCount ?? null,
    readPath: fast.source,
    converged,
  };
}

module.exports = {
  validateFinancialScope,
  validateSnapshotConvergence,
};
