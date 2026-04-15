/**
 * Phase 3 Step 3 — Ledger convergence: UFEC intent vs observed ledger (API-shaped) → decision + drift typing.
 *
 * Input is the same bundle as `buildLedgerComparison` / ledger shadow (`expected`, `actual`, `comparison`).
 */

import { LEDGER_STATUS } from "./ufecLedgerShadow.js";

const _env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

function shouldLogConvergence() {
  if (_env.VITE_UFEC_LEDGER_CONVERGENCE_DEBUG === "1") return true;
  if (_env.VITE_UFEC_LEDGER_CONVERGENCE_DEBUG === "0") return false;
  return Boolean(_env.DEV);
}

/** @typedef {'MATCH'|'DRIFT'|'PARTIAL'|'UNKNOWN'} ConvergenceState */

export const CONVERGENCE_STATE = {
  MATCH: "MATCH",
  DRIFT: "DRIFT",
  PARTIAL: "PARTIAL",
  UNKNOWN: "UNKNOWN",
};

export const DRIFT_TYPE = {
  AMOUNT_DRIFT: "AMOUNT_DRIFT",
  MISSING_LEDGER_ENTRY: "MISSING_LEDGER_ENTRY",
  DUPLICATE_LEDGER_ENTRY: "DUPLICATE_LEDGER_ENTRY",
  ORDER_DRIFT: "ORDER_DRIFT",
  PARTIAL_APPLY: "PARTIAL_APPLY",
};

export const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

/** Aligns with ufecLedgerShadow minor drift band */
const MINOR_DRIFT_USD = 0.1;

/**
 * @param {object} event — FinancialEvent
 * @param {{ expected?: object, actual?: unknown, comparison: { status: string, details?: object, enforcementLevel?: number } }} ledgerState
 * @returns {{ state: ConvergenceState, driftType: string|null, severity: string|null, divergenceReason: string|null, expectedLedgerOutcome: string, actualLedgerOutcome: string }}
 */
export function evaluateLedgerConvergence(event, ledgerState) {
  const comparison = ledgerState?.comparison;
  if (!comparison) {
    return {
      state: CONVERGENCE_STATE.UNKNOWN,
      driftType: null,
      severity: SEVERITY.HIGH,
      divergenceReason: "no_comparison",
      expectedLedgerOutcome: "unavailable",
      actualLedgerOutcome: "unavailable",
    };
  }

  const status = comparison.status;
  const details = comparison.details || {};
  const reason = details.reason;

  const expectedLedgerOutcome = summarizeExpectedOutcome(ledgerState.expected, event);
  const actualLedgerOutcome = summarizeActualOutcome(ledgerState.actual, status, details);

  if (status === LEDGER_STATUS.MATCH) {
    if (details.note === "partial_parse") {
      return {
        state: CONVERGENCE_STATE.PARTIAL,
        driftType: DRIFT_TYPE.PARTIAL_APPLY,
        severity: SEVERITY.MEDIUM,
        divergenceReason: reason || "partial_parse",
        expectedLedgerOutcome,
        actualLedgerOutcome,
      };
    }
    return {
      state: CONVERGENCE_STATE.MATCH,
      driftType: null,
      severity: null,
      divergenceReason: null,
      expectedLedgerOutcome,
      actualLedgerOutcome,
    };
  }

  if (status === LEDGER_STATUS.ORDER_VIOLATION) {
    return {
      state: CONVERGENCE_STATE.DRIFT,
      driftType: DRIFT_TYPE.ORDER_DRIFT,
      severity: SEVERITY.HIGH,
      divergenceReason: reason || "order_violation",
      expectedLedgerOutcome,
      actualLedgerOutcome,
    };
  }

  if (status === LEDGER_STATUS.ORPHAN) {
    if (reason === "missing_transaction_row" || reason === "missing_return_document") {
      return {
        state: CONVERGENCE_STATE.DRIFT,
        driftType: DRIFT_TYPE.MISSING_LEDGER_ENTRY,
        severity: SEVERITY.HIGH,
        divergenceReason: reason,
        expectedLedgerOutcome,
        actualLedgerOutcome,
      };
    }
    return {
      state: CONVERGENCE_STATE.UNKNOWN,
      driftType: null,
      severity: SEVERITY.MEDIUM,
      divergenceReason: reason || "orphan_unknown",
      expectedLedgerOutcome,
      actualLedgerOutcome,
    };
  }

  if (status === LEDGER_STATUS.MISMATCH) {
    if (reason === "duplicate_ledger_batch") {
      return {
        state: CONVERGENCE_STATE.DRIFT,
        driftType: DRIFT_TYPE.DUPLICATE_LEDGER_ENTRY,
        severity: SEVERITY.CRITICAL,
        divergenceReason: reason,
        expectedLedgerOutcome,
        actualLedgerOutcome,
      };
    }
    if (reason === "amount_delta_client_vs_server") {
      const c = Number(details.clientIndicative);
      const s = Number(details.serverAuthoritative);
      let sev = SEVERITY.HIGH;
      if (Number.isFinite(c) && Number.isFinite(s)) {
        const d = Math.abs(c - s);
        if (d <= MINOR_DRIFT_USD) sev = SEVERITY.MEDIUM;
      }
      return {
        state: CONVERGENCE_STATE.DRIFT,
        driftType: DRIFT_TYPE.AMOUNT_DRIFT,
        severity: sev,
        divergenceReason: reason,
        expectedLedgerOutcome,
        actualLedgerOutcome,
      };
    }
    if (reason === "negative_sale_total" || reason === "return_total_should_be_non_positive") {
      return {
        state: CONVERGENCE_STATE.DRIFT,
        driftType: DRIFT_TYPE.AMOUNT_DRIFT,
        severity: SEVERITY.CRITICAL,
        divergenceReason: reason,
        expectedLedgerOutcome,
        actualLedgerOutcome,
      };
    }
    if (reason === "no_actual_parse") {
      return {
        state: CONVERGENCE_STATE.UNKNOWN,
        driftType: null,
        severity: SEVERITY.HIGH,
        divergenceReason: reason,
        expectedLedgerOutcome,
        actualLedgerOutcome,
      };
    }
    return {
      state: CONVERGENCE_STATE.DRIFT,
      driftType: DRIFT_TYPE.AMOUNT_DRIFT,
      severity: SEVERITY.MEDIUM,
      divergenceReason: reason || "mismatch_generic",
      expectedLedgerOutcome,
      actualLedgerOutcome,
    };
  }

  return {
    state: CONVERGENCE_STATE.UNKNOWN,
    driftType: null,
    severity: SEVERITY.MEDIUM,
    divergenceReason: reason || "unclassified",
    expectedLedgerOutcome,
    actualLedgerOutcome,
  };
}

function summarizeExpectedOutcome(expected, event) {
  try {
    const entries = expected?.entries;
    if (!Array.isArray(entries) || entries.length === 0) return "empty";
    const r = entries[0]?.role;
    const amt = entries[0]?.clientIndicativeAmount;
    if (amt != null && Number.isFinite(Number(amt))) return `${r}:${Number(amt)}`;
    return String(r || "entry");
  } catch {
    return "unknown";
  }
}

function summarizeActualOutcome(actual, status, details) {
  if (!actual) return details?.reason === "no_actual_parse" ? "unparsed" : "absent";
  if (actual.multiTransactionSurfaces) return "duplicate_surfaces";
  if (actual.kind === "SALE") {
    if (!actual.hasTransactionRow && (actual.status === "created" || actual.status === "duplicate")) {
      return "missing_row";
    }
    return `sale_total:${actual.totalAmount ?? "?"}`;
  }
  if (actual.kind === "RETURN") {
    if (!actual.hasTransactionRow && !actual.hasSaleReturn) return "missing_docs";
    return `return_total:${actual.totalAmount ?? "?"}`;
  }
  return status || "unknown";
}

/**
 * @param {ReturnType<typeof evaluateLedgerConvergence>} convergence
 */
export function convergenceRequiresReconciliationQueue(convergence) {
  return (
    convergence.state === CONVERGENCE_STATE.DRIFT ||
    convergence.state === CONVERGENCE_STATE.PARTIAL ||
    convergence.state === CONVERGENCE_STATE.UNKNOWN
  );
}

/**
 * Shadow input for reconciliation (diagnostic + queue driver).
 * @param {object} event
 * @param {{ comparison?: object }} ledgerBundle
 * @param {ReturnType<typeof evaluateLedgerConvergence>} convergence
 */
export function logLedgerConvergenceShadow(event, ledgerBundle, convergence) {
  if (!shouldLogConvergence()) return;
  console.info("[UFEC_LEDGER_CONVERGENCE]", {
    clientEventId: event.clientEventId,
    eventType: event.type,
    state: convergence.state,
    driftType: convergence.driftType,
    severity: convergence.severity,
    divergenceReason: convergence.divergenceReason,
    expectedLedgerOutcome: convergence.expectedLedgerOutcome,
    actualLedgerOutcome: convergence.actualLedgerOutcome,
    ledgerStatus: ledgerBundle?.comparison?.status,
    expectedVsActual: {
      expectedSummary: ledgerBundle?.expected,
      actualSummary: ledgerBundle?.actual,
    },
  });
}
