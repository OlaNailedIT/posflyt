/**
 * Phase 7 — aggregate chaos run metrics + resilience score (0–100 heuristic).
 */

/**
 * @param {{ pass: number, fail: number, convergenceMs?: number }} o
 */
function resilienceScore(o) {
  const total = o.pass + o.fail;
  if (total === 0) return 100;
  const rate = o.pass / total;
  /** Penalize slow average convergence slightly (optional). */
  const slow = o.convergenceMs != null && o.convergenceMs > 10_000 ? 0.9 : 1;
  return Math.round(Math.min(100, Math.max(0, rate * 100 * slow)));
}

function buildReportEnvelope({
  scenario,
  intensity,
  transactionsTested,
  recovered,
  failed,
  averageConvergenceTimeMs,
  idempotencySuccessRate,
  invariantNotes,
}) {
  return {
    scenario,
    intensity: intensity || "MEDIUM",
    transactionsTested: transactionsTested ?? 0,
    recovered: recovered ?? 0,
    failed: failed ?? 0,
    averageConvergenceTimeMs: averageConvergenceTimeMs ?? null,
    idempotencySuccessRate: idempotencySuccessRate ?? null,
    invariantNotes: invariantNotes || [],
  };
}

module.exports = {
  resilienceScore,
  buildReportEnvelope,
};
