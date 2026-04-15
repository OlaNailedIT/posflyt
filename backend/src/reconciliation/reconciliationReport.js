/**
 * Phase 4D — unified forensic report envelope.
 */
const { randomUUID } = require("crypto");
const { SEVERITY, classifyAnomalies, severityScore } = require("./anomalyClassifier");

/**
 * @param {object} args
 */
function buildReconciliationReport(args) {
  const {
    businessId,
    clientTransactionId,
    comparison,
    terminalState,
    eventCount,
    ledgerLineCountExpected,
    ledgerLineCountStored,
    fingerprints,
  } = args;

  const classified = classifyAnomalies(comparison.mismatches);
  const score = severityScore(classified);
  const hasCritical = classified.some((m) => m.severity === SEVERITY.CRITICAL);
  const hasHigh = classified.some((m) => m.severity === SEVERITY.HIGH);

  let status = "PASS";
  if (!comparison.match) {
    if (hasCritical || hasHigh) {
      status = "FAIL";
    } else {
      status = "DEGRADED";
    }
  }

  const balanceDelta =
    terminalState && args.ledgerNetFromStored != null
      ? roundSafe(terminalState.runningNet - args.ledgerNetFromStored)
      : null;

  return {
    reconciliationId: randomUUID(),
    businessId,
    clientTransactionId,
    status,
    summary: {
      eventCount,
      ledgerLineCountExpected,
      ledgerLineCountStored,
      balanceDelta,
    },
    mismatches: classified,
    fingerprint: fingerprints,
    severityScore: score,
    terminalStateSnapshot: terminalState
      ? {
          status: terminalState.status,
          runningNet: terminalState.runningNet,
          balance: terminalState.balance,
        }
      : null,
  };
}

function roundSafe(n) {
  return Math.round(n * 1e6) / 1e6;
}

module.exports = {
  buildReconciliationReport,
};
