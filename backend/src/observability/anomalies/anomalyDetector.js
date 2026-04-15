const { nowISOString } = require("../../utils/date.js");
/**
 * Phase 6 — anomaly feed from snapshot lag + optional deep reconciliation samples.
 */
const { runReconciliationScope } = require("../../reconciliation/reconciliationService");
const { findStaleSnapshotScopes } = require("../metrics/financialMetricsEngine");
const { getCrossRegionDriftInfo } = require("../../distributed/aggregation/fetchRegionalSnapshots");

const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

/**
 * Promote to HIGH when deep scan shows reconciliation mismatch (optional).
 * @param {string} status
 */
function severityFromReconcileStatus(status) {
  const u = String(status || "").toUpperCase();
  if (u === "PASS") return SEVERITY.LOW;
  if (u === "DEGRADED") return SEVERITY.MEDIUM;
  if (u === "FAIL") return SEVERITY.HIGH;
  return SEVERITY.CRITICAL;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {{ limit?: number, deep?: boolean }} opts
 */
async function getObservabilityAnomalies(prisma, businessId, opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 30));
  const deep = Boolean(opts.deep);

  const stale = await findStaleSnapshotScopes(prisma, businessId, limit);

  const items = stale.map((row) => ({
    type: "SNAPSHOT_LAG",
    severity: SEVERITY.MEDIUM,
    clientTransactionId: row.clientTransactionId,
    description: `Events (${row.eventCount}) ahead of snapshot (${row.snapshotEventCount})`,
    affectedTransactionId: row.clientTransactionId,
  }));

  try {
    const drift = await getCrossRegionDriftInfo(businessId);
    if (drift.drift) {
      items.push({
        type: "CROSS_REGION_BALANCE_DRIFT",
        severity: SEVERITY.HIGH,
        clientTransactionId: null,
        description: `Regional merge (${drift.regionalSum}) ≠ primary aggregate (${drift.directSum})`,
        affectedTransactionId: null,
      });
    }
  } catch {
    /* non-fatal */
  }

  if (!deep) {
    return { items, deepScan: false, generatedAt: nowISOString() };
  }

  const reconciliationSamples = [];
  const cap = Math.min(5, stale.length);
  for (let i = 0; i < cap; i += 1) {
    const id = stale[i].clientTransactionId;
    try {
      const report = await runReconciliationScope({
        businessId,
        clientTransactionId: id,
        emitStream: false,
      });
      reconciliationSamples.push({
        clientTransactionId: id,
        status: report.status,
        mismatches: report.mismatches,
        severityScore: report.severityScore,
        suggestedSeverity: severityFromReconcileStatus(report.status),
      });
    } catch (err) {
      reconciliationSamples.push({
        clientTransactionId: id,
        error: err?.message || "RECONCILE_FAILED",
        suggestedSeverity: SEVERITY.HIGH,
      });
    }
  }

  return {
    items,
    deepScan: true,
    reconciliationSamples,
    generatedAt: nowISOString(),
  };
}

module.exports = {
  SEVERITY,
  getObservabilityAnomalies,
};
