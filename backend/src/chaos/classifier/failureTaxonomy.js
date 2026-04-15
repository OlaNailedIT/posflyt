/**
 * Maps chaos / validation signals to coarse tiers (Phase 7 taxonomy).
 */

const TIER = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

/**
 * @param {{ pass?: boolean, reconciliationStatus?: string, readStale?: boolean }} v
 */
function classifyValidation(v) {
  if (v.pass) {
    return { tier: TIER.LOW, code: "CONVERGED" };
  }
  if (v.reconciliationStatus === "FAIL") {
    return { tier: TIER.CRITICAL, code: "RECONCILIATION_FAIL" };
  }
  if (v.reconciliationStatus === "DEGRADED" || v.readStale) {
    return { tier: TIER.HIGH, code: "DRIFT_OR_DEGRADED" };
  }
  return { tier: TIER.MEDIUM, code: "UNKNOWN_DIVERGENCE" };
}

module.exports = {
  TIER,
  classifyValidation,
};
