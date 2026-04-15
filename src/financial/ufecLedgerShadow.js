/**
 * Phase 2 — UFEC ledger shadow: **client source of truth** for expected vs actual (API response).
 * Phase 2 Step 5 — enforcementLevel (0–3). Step 7 — correctness narrative is UFEC + ledger comparison,
 * not backend service logic. Server also emits [UFEC_LEDGER] observation (backend ufecLedgerObservation).
 *
 * @see docs/UFEC_PHASE2_DOMINANCE.md
 */

import {
  ENFORCEMENT_ACTION,
  ENFORCEMENT_LEVEL,
  evaluateUfecEnforcement,
  UfecEnforcementError,
} from "./ufecEnforcement.js";
import { FINANCIAL_EVENT_TYPE } from "./ufecSyncShadow.js";

const LEDGER_STATUS = {
  MATCH: "MATCH",
  MISMATCH: "MISMATCH",
  ORDER_VIOLATION: "ORDER_VIOLATION",
  ORPHAN: "ORPHAN",
};

const EPS = 0.02;
/** Minor drift threshold (USD): at or below → LEVEL 1; above → LEVEL 2 for amount deltas */
const MINOR_DRIFT_USD = 0.1;

const _viteEnv =
  typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

function shouldLogUfecLedger() {
  if (_viteEnv.VITE_UFEC_LEDGER_DEBUG === "1") return true;
  if (_viteEnv.VITE_UFEC_LEDGER_DEBUG === "0") return false;
  return Boolean(_viteEnv.DEV);
}

/**
 * In-memory expected ledger intent (no server truth).
 * @param {object} event — FinancialEvent from executeFinancialEvent
 */
export function simulateExpectedLedger(event) {
  if (event.type === FINANCIAL_EVENT_TYPE.SALE_EVENT) {
    const raw = event.payload?.total;
    const n = raw != null && raw !== "" ? Number(raw) : NaN;
    return {
      entries: [
        {
          role: "SALE_RECORD",
          direction: "positive_revenue",
          clientIndicativeAmount: Number.isFinite(n) ? n : null,
        },
      ],
    };
  }
  if (event.type === FINANCIAL_EVENT_TYPE.RETURN_EVENT) {
    return {
      entries: [
        {
          role: "RETURN_REVERSAL",
          direction: "negative_reversal",
          clientIndicativeAmount: null,
        },
      ],
    };
  }
  return { entries: [] };
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} event
 * @param {unknown} result — API unwrap body from postTransaction / postTransactionReturn
 */
export function extractActualLedgerFromResult(event, result) {
  if (event.type === FINANCIAL_EVENT_TYPE.SALE_EVENT) {
    const results = result?.results;
    const arr = Array.isArray(results) ? results : [];
    const first = arr[0] ?? null;
    const tx = first?.transaction;
    const withTx = arr.filter((r) => r?.transaction);
    /** Multiple persisted transaction rows in one response → critical integrity risk */
    const multiTransactionSurfaces = withTx.length > 1;
    return {
      source: "api",
      kind: "SALE",
      clientEventId: event.clientEventId,
      totalAmount: tx != null ? num(tx.totalAmount) : null,
      status: first?.status ?? null,
      hasTransactionRow: Boolean(tx),
      multiTransactionSurfaces,
    };
  }
  if (event.type === FINANCIAL_EVENT_TYPE.RETURN_EVENT) {
    const tx = result?.transaction;
    return {
      source: "api",
      kind: "RETURN",
      clientEventId: event.clientEventId,
      totalAmount: tx != null ? num(tx.totalAmount) : null,
      transactionType: tx?.transactionType ?? null,
      hasTransactionRow: Boolean(tx),
      hasSaleReturn: Boolean(result?.saleReturn),
    };
  }
  return null;
}

/**
 * @param {string} status
 * @param {object} [details]
 * @param {{ multiTransactionSurfaces?: boolean }} [actual]
 */
export function enforcementLevelFromLedgerCompare(status, details, actual) {
  if (status === LEDGER_STATUS.MATCH) {
    return ENFORCEMENT_LEVEL.L0;
  }

  if (actual?.multiTransactionSurfaces) {
    return ENFORCEMENT_LEVEL.L3;
  }

  if (status === LEDGER_STATUS.ORPHAN) {
    /** Missing ledger row/document: important drift, flag — do not block (Step 5) */
    return ENFORCEMENT_LEVEL.L2;
  }

  const reason = details?.reason;

  if (reason === "negative_sale_total" || reason === "return_total_should_be_non_positive") {
    return ENFORCEMENT_LEVEL.L3;
  }

  if (reason === "amount_delta_client_vs_server") {
    const c = Number(details?.clientIndicative);
    const s = Number(details?.serverAuthoritative);
    if (Number.isFinite(c) && Number.isFinite(s)) {
      const d = Math.abs(c - s);
      if (d > EPS && d <= MINOR_DRIFT_USD) {
        return ENFORCEMENT_LEVEL.L1;
      }
    }
    return ENFORCEMENT_LEVEL.L2;
  }

  if (reason === "no_actual_parse") {
    return ENFORCEMENT_LEVEL.L2;
  }

  if (status === LEDGER_STATUS.MISMATCH || status === LEDGER_STATUS.ORDER_VIOLATION) {
    return ENFORCEMENT_LEVEL.L2;
  }

  return ENFORCEMENT_LEVEL.L2;
}

/**
 * @returns {{ status: string, enforcementLevel: number, details?: object }}
 */
export function compareExpectedVsActualLedger(event, expected, actual) {
  if (!actual) {
    const details = { reason: "no_actual_parse" };
    const status = LEDGER_STATUS.MISMATCH;
    return {
      status,
      enforcementLevel: enforcementLevelFromLedgerCompare(status, details, actual),
      details,
    };
  }

  if (event.type === FINANCIAL_EVENT_TYPE.SALE_EVENT) {
    if (actual.multiTransactionSurfaces) {
      const details = { reason: "duplicate_ledger_batch" };
      const status = LEDGER_STATUS.MISMATCH;
      return {
        status,
        enforcementLevel: enforcementLevelFromLedgerCompare(status, details, actual),
        details,
      };
    }
    if (!actual.hasTransactionRow && (actual.status === "created" || actual.status === "duplicate")) {
      const details = { reason: "missing_transaction_row" };
      const status = LEDGER_STATUS.ORPHAN;
      return {
        status,
        enforcementLevel: enforcementLevelFromLedgerCompare(status, details, actual),
        details,
      };
    }
    const clientAmt = expected?.entries?.[0]?.clientIndicativeAmount;
    const serverAmt = actual.totalAmount;
    /** Authoritative negative total is critical — classify before amount-delta drift */
    if (serverAmt != null && serverAmt < 0) {
      const details = { reason: "negative_sale_total" };
      const status = LEDGER_STATUS.MISMATCH;
      return {
        status,
        enforcementLevel: enforcementLevelFromLedgerCompare(status, details, actual),
        details,
      };
    }
    if (clientAmt != null && serverAmt != null && Math.abs(clientAmt - serverAmt) > EPS) {
      const details = {
        reason: "amount_delta_client_vs_server",
        clientIndicative: clientAmt,
        serverAuthoritative: serverAmt,
      };
      const status = LEDGER_STATUS.MISMATCH;
      return {
        status,
        enforcementLevel: enforcementLevelFromLedgerCompare(status, details, actual),
        details,
      };
    }
    const status = LEDGER_STATUS.MATCH;
    return {
      status,
      enforcementLevel: enforcementLevelFromLedgerCompare(status, { serverAuthoritative: serverAmt }, actual),
      details: { serverAuthoritative: serverAmt },
    };
  }

  if (event.type === FINANCIAL_EVENT_TYPE.RETURN_EVENT) {
    if (!actual.hasTransactionRow && !actual.hasSaleReturn) {
      const details = { reason: "missing_return_document" };
      const status = LEDGER_STATUS.ORPHAN;
      return {
        status,
        enforcementLevel: enforcementLevelFromLedgerCompare(status, details, actual),
        details,
      };
    }
    const ta = actual.totalAmount;
    if (ta != null && ta > EPS) {
      const details = { reason: "return_total_should_be_non_positive", totalAmount: ta };
      const status = LEDGER_STATUS.MISMATCH;
      return {
        status,
        enforcementLevel: enforcementLevelFromLedgerCompare(status, details, actual),
        details,
      };
    }
    if (ta != null && ta <= 0) {
      const status = LEDGER_STATUS.MATCH;
      return {
        status,
        enforcementLevel: enforcementLevelFromLedgerCompare(status, { totalAmount: ta }, actual),
        details: { totalAmount: ta },
      };
    }
    const status = LEDGER_STATUS.MATCH;
    return {
      status,
      enforcementLevel: enforcementLevelFromLedgerCompare(status, { note: "partial_parse" }, actual),
      details: { note: "partial_parse" },
    };
  }

  const details = { reason: "unknown_event" };
  const status = LEDGER_STATUS.MISMATCH;
  return {
    status,
    enforcementLevel: enforcementLevelFromLedgerCompare(status, details, actual),
    details,
  };
}

function logUfecLedgerLine(payload) {
  if (!shouldLogUfecLedger()) return;
  console.info("[UFEC_LEDGER]", payload);
}

/**
 * @param {object} event
 * @param {unknown} result
 */
export function buildLedgerComparison(event, result) {
  const expected = simulateExpectedLedger(event);
  const actual = extractActualLedgerFromResult(event, result);
  const comparison = compareExpectedVsActualLedger(event, expected, actual);
  return { expected, actual, comparison };
}

/**
 * Shadow compare + graduated enforcement (WARN / FLAG / BLOCK on L3 only).
 * @param {object} event
 * @param {unknown} result — unwrapped API body
 * @returns {{ expected: object, actual: unknown, comparison: object }|undefined}
 * @throws {UfecEnforcementError} when post-execution comparison is LEVEL 3
 */
export function applyUfecPostExecutionEnforcement(event, result) {
  let built;
  try {
    built = buildLedgerComparison(event, result);
  } catch (e) {
    if (_viteEnv.DEV) {
      console.warn("[UFEC_LEDGER] build error (ignored)", e);
    }
    return undefined;
  }

  const { expected, actual, comparison } = built;

  try {
    logUfecLedgerLine({
      status: comparison.status,
      enforcementLevel: comparison.enforcementLevel,
      eventId: event.clientEventId,
      eventType: event.type,
      expectedSummary: expected,
      actualSummary: actual,
      details: comparison.details,
    });

    if (comparison.status === LEDGER_STATUS.MISMATCH || comparison.status === LEDGER_STATUS.ORPHAN) {
      logUfecLedgerLine({
        kind: "LEDGER_DRIFT",
        eventId: event.clientEventId,
        eventType: event.type,
        ...comparison,
      });
    }

    const decision = evaluateUfecEnforcement(event, comparison);

    if (decision.action === ENFORCEMENT_ACTION.WARN) {
      console.warn("[UFEC_ENFORCE]", {
        action: decision.action,
        level: decision.level,
        reason: decision.reason,
        clientEventId: event.clientEventId,
        eventType: event.type,
      });
    }

    if (decision.action === ENFORCEMENT_ACTION.FLAG) {
      console.info("[UFEC_FLAG]", {
        type: "UFEC_FLAG",
        clientEventId: event.clientEventId,
        eventType: event.type,
        level: decision.level,
        reason: decision.reason,
        status: comparison.status,
        details: comparison.details,
      });
    }

    if (decision.action === ENFORCEMENT_ACTION.BLOCK) {
      throw new UfecEnforcementError(decision.reason, {
        level: decision.level,
        action: decision.action,
        phase: "post_execution",
      });
    }
    return { expected, actual, comparison };
  } catch (e) {
    if (e instanceof UfecEnforcementError) {
      throw e;
    }
    if (_viteEnv.DEV) {
      console.warn("[UFEC_LEDGER] shadow error (ignored)", e);
    }
    return { expected, actual, comparison };
  }
}

export { LEDGER_STATUS };
