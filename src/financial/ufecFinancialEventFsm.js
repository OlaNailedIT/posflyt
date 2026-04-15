/**
 * Phase 3 Step 4 — Single canonical lifecycle (FSM) per FinancialEvent.
 * Subsystems (idempotency, retry, ledger convergence, reconciliation) are inputs — this module resolves truth.
 */

import { getUfecIdempotencyRecord } from "../services/db.js";
import { getUfecReconciliationStatusForGlobalEvent } from "../services/db.js";
import { CONVERGENCE_STATE } from "./ufecLedgerConvergence.js";
import { FAILURE_CLASS } from "./ufecFailureClassification.js";

/** Canonical lifecycle — every FinancialEvent resolves to exactly one. */
export const FSM_STATE = {
  INITIATED: "INITIATED",
  IN_FLIGHT: "IN_FLIGHT",
  /** HTTP succeeded; ledger finalization not yet reflected in durable FSM (transient). */
  SUCCEEDED: "SUCCEEDED",
  FAILED_RETRYABLE: "FAILED_RETRYABLE",
  FAILED_FINAL: "FAILED_FINAL",
  RECONCILE_REQUIRED: "RECONCILE_REQUIRED",
  /** Terminal success: execution + ledger intent aligned (or repair completed). */
  CONVERGED: "CONVERGED",
};

const _env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

function shouldLogFsm() {
  if (_env.VITE_UFEC_FSM_DEBUG === "1") return true;
  if (_env.VITE_UFEC_FSM_DEBUG === "0") return false;
  return Boolean(_env.DEV);
}

/**
 * @typedef {{
 *   globalEventId: string,
 *   idempotencyEntry: object|null|undefined,
 *   ledgerConvergenceState?: string|null,
 *   reconciliationStatus?: 'none'|'queued'|'resolved'|'mixed',
 *   lastExecutionOutcome?: 'success'|'failure'|null,
 *   lastFailureClass?: keyof typeof FAILURE_CLASS | null,
 * }} FinancialEventStateContext
 */

/**
 * @param {FinancialEventStateContext} ctx
 * @returns {{ state: string, reason: string, source: string, globalEventId: string }}
 */
export function resolveFinancialEventState(ctx) {
  const gid = String(ctx.globalEventId || "");
  const entry = ctx.idempotencyEntry ?? null;
  const entryStatus = entry?.status ?? null;
  const lcs =
    ctx.ledgerConvergenceState ??
    entry?.ledgerConvergence?.state ??
    null;
  const rec = ctx.reconciliationStatus ?? "none";

  if (rec === "resolved") {
    return {
      state: FSM_STATE.CONVERGED,
      reason: "RECONCILIATION_RESOLVED",
      source: "RECONCILIATION_QUEUE",
      globalEventId: gid,
    };
  }

  if (lcs === CONVERGENCE_STATE.DRIFT || lcs === CONVERGENCE_STATE.PARTIAL) {
    return {
      state: FSM_STATE.RECONCILE_REQUIRED,
      reason: "LEDGER_DRIFT",
      source: "CONVERGENCE_ENGINE",
      globalEventId: gid,
    };
  }

  if (entryStatus === "RECONCILE_REQUIRED") {
    return {
      state: FSM_STATE.RECONCILE_REQUIRED,
      reason: "IDEMPOTENCY_RECONCILE",
      source: "IDEMPOTENCY",
      globalEventId: gid,
    };
  }

  if (rec === "queued" || rec === "mixed") {
    return {
      state: FSM_STATE.RECONCILE_REQUIRED,
      reason: "REPAIR_QUEUED",
      source: "RECONCILIATION_QUEUE",
      globalEventId: gid,
    };
  }

  if (entryStatus === "FAILED_RETRYABLE") {
    return {
      state: FSM_STATE.FAILED_RETRYABLE,
      reason: "RETRY_BACKOFF",
      source: "RETRY_ENGINE",
      globalEventId: gid,
    };
  }

  if (lcs === CONVERGENCE_STATE.UNKNOWN) {
    return {
      state: FSM_STATE.FAILED_RETRYABLE,
      reason: "LEDGER_UNKNOWN",
      source: "CONVERGENCE_ENGINE",
      globalEventId: gid,
    };
  }

  if (entryStatus === "FAILED_FINAL") {
    return {
      state: FSM_STATE.FAILED_FINAL,
      reason: "IDEMPOTENCY_FAILED_FINAL",
      source: "IDEMPOTENCY",
      globalEventId: gid,
    };
  }

  if (ctx.lastExecutionOutcome === "failure" && ctx.lastFailureClass === FAILURE_CLASS.NON_RETRYABLE) {
    return {
      state: FSM_STATE.FAILED_FINAL,
      reason: "EXECUTION_NON_RETRYABLE",
      source: "EXECUTION",
      globalEventId: gid,
    };
  }

  if (entryStatus === "IN_FLIGHT") {
    return {
      state: FSM_STATE.IN_FLIGHT,
      reason: "EXECUTION_IN_FLIGHT",
      source: "IDEMPOTENCY",
      globalEventId: gid,
    };
  }

  if (entryStatus === "COMPLETED") {
    const storedLc = entry?.ledgerConvergence?.state;
    if (storedLc === CONVERGENCE_STATE.DRIFT || storedLc === CONVERGENCE_STATE.PARTIAL) {
      return {
        state: FSM_STATE.RECONCILE_REQUIRED,
        reason: "STORED_LEDGER_DRIFT",
        source: "CONVERGENCE_ENGINE",
        globalEventId: gid,
      };
    }
    if (lcs === CONVERGENCE_STATE.MATCH || storedLc === CONVERGENCE_STATE.MATCH || !entry?.ledgerConvergence) {
      return {
        state: FSM_STATE.CONVERGED,
        reason: "LEDGER_MATCH",
        source: "CONVERGENCE_ENGINE",
        globalEventId: gid,
      };
    }
    return {
      state: FSM_STATE.CONVERGED,
      reason: "IDEMPOTENCY_COMPLETED",
      source: "IDEMPOTENCY",
      globalEventId: gid,
    };
  }

  if (ctx.lastExecutionOutcome === "success") {
    return {
      state: FSM_STATE.SUCCEEDED,
      reason: "AWAITING_LEDGER_FINALIZE",
      source: "EXECUTION",
      globalEventId: gid,
    };
  }

  if (ctx.lastExecutionOutcome === "failure") {
    if (ctx.lastFailureClass === FAILURE_CLASS.DEGRADED) {
      return {
        state: FSM_STATE.RECONCILE_REQUIRED,
        reason: "EXECUTION_DEGRADED",
        source: "EXECUTION",
        globalEventId: gid,
      };
    }
    if (ctx.lastFailureClass === FAILURE_CLASS.RETRYABLE) {
      return {
        state: FSM_STATE.FAILED_RETRYABLE,
        reason: "EXECUTION_RETRYABLE",
        source: "EXECUTION",
        globalEventId: gid,
      };
    }
    return {
      state: FSM_STATE.FAILED_FINAL,
      reason: "EXECUTION_FAILURE",
      source: "EXECUTION",
      globalEventId: gid,
    };
  }

  if (!entry || entryStatus === "INITIATED") {
    return {
      state: FSM_STATE.INITIATED,
      reason: "NO_SIGNAL",
      source: "DEFAULT",
      globalEventId: gid,
    };
  }

  return {
    state: FSM_STATE.INITIATED,
    reason: "UNCLASSIFIED",
    source: "DEFAULT",
    globalEventId: gid,
  };
}

/**
 * Loads idempotency + reconciliation queue signals from IndexedDB (no execution hints).
 * @param {string} globalEventId
 * @returns {Promise<FinancialEventStateContext>}
 */
export async function loadFinancialEventStateContextFromStores(globalEventId) {
  const idempotencyEntry = await getUfecIdempotencyRecord(globalEventId);
  const reconciliationStatus = await getUfecReconciliationStatusForGlobalEvent(globalEventId);
  const ledgerConvergenceState = idempotencyEntry?.ledgerConvergence?.state ?? null;
  return {
    globalEventId,
    idempotencyEntry: idempotencyEntry ?? null,
    ledgerConvergenceState,
    reconciliationStatus,
    lastExecutionOutcome: null,
    lastFailureClass: null,
  };
}

/**
 * @param {string} globalEventId
 * @returns {Promise<{ state: string, reason: string, source: string, globalEventId: string }>}
 */
export async function resolveFinancialEventStateFromStores(globalEventId) {
  const ctx = await loadFinancialEventStateContextFromStores(globalEventId);
  return resolveFinancialEventState(ctx);
}

/**
 * @param {{ state: string, reason: string, source: string, globalEventId?: string }} resolved
 */
export function logUfecFsm(resolved) {
  if (!shouldLogFsm()) return;
  console.info("[UFEC_FSM]", {
    state: resolved.state,
    reason: resolved.reason,
    source: resolved.source,
    global_event_id: resolved.globalEventId,
  });
}

/**
 * Monotonic transition rules (for assertions / debug). Returns true if `to` is forbidden from `from`.
 * @param {string} from
 * @param {string} to
 */
export function isForbiddenFsmTransition(from, to) {
  if (from === to) return false;
  if (from === FSM_STATE.CONVERGED) {
    return to !== FSM_STATE.CONVERGED;
  }
  if (from === FSM_STATE.FAILED_FINAL && to === FSM_STATE.SUCCEEDED) return true;
  if (from === FSM_STATE.SUCCEEDED && to === FSM_STATE.FAILED_FINAL) return true;
  if (from === FSM_STATE.SUCCEEDED && to === FSM_STATE.FAILED_RETRYABLE) return true;
  if (from === FSM_STATE.RECONCILE_REQUIRED && to === FSM_STATE.SUCCEEDED) return true;
  if (from === FSM_STATE.RECONCILE_REQUIRED && to === FSM_STATE.CONVERGED) return false;
  return false;
}
