/**
 * Phase 8 — aggregates regional reconciliation PASS/FAIL signals into one envelope (async global view).
 */

/** @typedef {{ regionId: string, status: string, severityScore?: number, anomalies?: string[] }} RegionalReport */

const RISK = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

/**
 * @param {string} businessId
 * @param {RegionalReport[]} regions
 */
function aggregateRegionalReports(businessId, regions) {
  const list = Array.isArray(regions) ? regions : [];
  if (list.length === 0) {
    return {
      businessId,
      status: "UNKNOWN",
      regions: {},
      globalAnomalies: ["NO_REGIONAL_SIGNAL"],
      tier: RISK.MEDIUM,
    };
  }

  const outRegions = {};
  const globalAnomalies = [];
  let hasFail = false;
  let hasDegraded = false;

  for (const r of list) {
    const st = String(r.status || "").toUpperCase();
    outRegions[r.regionId] = st;
    if (st === "FAIL") hasFail = true;
    if (st === "DEGRADED") hasDegraded = true;
    if (Array.isArray(r.anomalies)) globalAnomalies.push(...r.anomalies);
  }

  let status = "PASS";
  if (hasFail) status = "FAIL";
  else if (hasDegraded) status = "DEGRADED";

  if (new Set(Object.values(outRegions)).size > 1 && !hasFail) {
    globalAnomalies.push("REGIONAL_STATUS_MISMATCH");
  }

  const tier =
    status === "FAIL" ? RISK.CRITICAL : status === "DEGRADED" ? RISK.HIGH : RISK.LOW;

  return {
    businessId,
    status,
    regions: outRegions,
    globalAnomalies: [...new Set(globalAnomalies)],
    tier,
  };
}

module.exports = {
  aggregateRegionalReports,
};
