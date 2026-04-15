/**
 * Phase 4D — assign severity + labels for forensic follow-up.
 */

const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

/** @type {Record<string, keyof typeof SEVERITY>} */
const CODE_TO_TYPE = {
  MISSING_LEDGER_LINE: "MISSING_LEDGER_LINE",
  EXTRA_LEDGER_LINE: "EXTRA_LEDGER_LINE",
  DEBIT_DRIFT: "BALANCE_DRIFT",
  CREDIT_DRIFT: "BALANCE_DRIFT",
  BALANCE_AFTER_DRIFT: "BALANCE_DRIFT",
  LINE_KIND_MISMATCH: "LINE_INVARIANT_BREACH",
  SOURCE_EVENT_MISMATCH: "LINE_INVARIANT_BREACH",
  STATE_NET_DRIFT: "STATE_LEDGER_DIVERGENCE",
  REDUCER_REPLAY_INVARIANT: "ENGINE_INTERNAL_INVARIANT",
};

/** @type {Record<string, string>} */
const CODE_TO_SEVERITY = {
  MISSING_LEDGER_LINE: SEVERITY.HIGH,
  EXTRA_LEDGER_LINE: SEVERITY.HIGH,
  DEBIT_DRIFT: SEVERITY.MEDIUM,
  CREDIT_DRIFT: SEVERITY.MEDIUM,
  BALANCE_AFTER_DRIFT: SEVERITY.MEDIUM,
  LINE_KIND_MISMATCH: SEVERITY.HIGH,
  SOURCE_EVENT_MISMATCH: SEVERITY.CRITICAL,
  STATE_NET_DRIFT: SEVERITY.HIGH,
  REDUCER_REPLAY_INVARIANT: SEVERITY.CRITICAL,
};

/**
 * @param {{ code: string, [k: string]: unknown }[]} rawMismatches
 */
function classifyAnomalies(rawMismatches) {
  return rawMismatches.map((m) => {
    const anomalyType = CODE_TO_TYPE[m.code] || "UNKNOWN_MISMATCH";
    const severity = CODE_TO_SEVERITY[m.code] || SEVERITY.MEDIUM;
    return {
      code: m.code,
      anomalyType,
      severity,
      details: m,
    };
  });
}

function severityScore(classified) {
  const weight = { LOW: 1, MEDIUM: 3, HIGH: 8, CRITICAL: 20 };
  return classified.reduce((acc, m) => acc + (weight[m.severity] || 0), 0);
}

module.exports = {
  SEVERITY,
  classifyAnomalies,
  severityScore,
};
