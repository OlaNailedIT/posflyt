/**
 * Phase 3 Step 5 — Global consistency invariant: validate cross-subsystem agreement; repair STATE only (no re-execution).
 */

import { enqueueUfecReconciliationQueueRow, getUfecReconciliationQueuePending } from "../services/db.js";
import { UFEC_WRITE_SOURCE } from "./ufecConcurrency.js";
import { CONVERGENCE_STATE } from "./ufecLedgerConvergence.js";
import { FAILURE_CLASS } from "./ufecFailureClassification.js";
import {
  FSM_STATE,
  loadFinancialEventStateContextFromStores,
  resolveFinancialEventState,
} from "./ufecFinancialEventFsm.js";
import {
  IDEMPOTENCY_STATUS,
  loadUfecIdempotencyEntry,
  markLedgerReconcileRequired,
  persistUfecIdempotencyEntry,
} from "./ufecIdempotencyRegistry.js";
import { getDeterministicRepairPlan } from "./ufecReconciliationEngine.js";

export const VIOLATION_TYPE = {
  FSM_LEDGER_MISMATCH: "FSM_LEDGER_MISMATCH",
  STALE_SUCCESS_CACHE: "STALE_SUCCESS_CACHE",
  IDENTITY_CONFLICT: "IDENTITY_CONFLICT",
  RECONCILIATION_STALL: "RECONCILIATION_STALL",
  RETRY_STUCK_STATE: "RETRY_STUCK_STATE",
  EXECUTION_OVERWRITE: "EXECUTION_OVERWRITE",
};

/** Past-due backoff without progress (heuristic). */
const RETRY_STUCK_MS = 15 * 60 * 1000;

const _env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

function shouldLogConsistency() {
  if (_env.VITE_UFEC_CONSISTENCY_DEBUG === "1") return true;
  if (_env.VITE_UFEC_CONSISTENCY_DEBUG === "0") return false;
  return Boolean(_env.DEV);
}

function maxSeverity(a, b) {
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  return order[a] >= order[b] ? a : b;
}

/**
 * @param {import("./ufecFinancialEventFsm.js").FinancialEventStateContext} eventContext
 * @returns {{
 *   isConsistent: boolean,
 *   violations: Array<{ type: string, severity: string, detail: string }>,
 *   resolvedFsm: { state: string, reason: string, source: string, globalEventId: string },
 *   correctedState: string|null,
 *   severity: string,
 * }}
 */
export function validateSystemConsistency(eventContext) {
  const ctx = eventContext;
  const gid = String(ctx.globalEventId || "");
  const resolvedFsm = resolveFinancialEventState(ctx);
  const entry = ctx.idempotencyEntry ?? null;
  const entryStatus = entry?.status ?? null;
  const lcs =
    ctx.ledgerConvergenceState ?? entry?.ledgerConvergence?.state ?? null;
  const rec = ctx.reconciliationStatus ?? "none";

  /** @type {Array<{ type: string, severity: string, detail: string }>} */
  const violations = [];

  const effectiveLedgerDrift =
    lcs === CONVERGENCE_STATE.DRIFT ||
    lcs === CONVERGENCE_STATE.PARTIAL ||
    entry?.ledgerConvergence?.state === CONVERGENCE_STATE.DRIFT ||
    entry?.ledgerConvergence?.state === CONVERGENCE_STATE.PARTIAL;

  if (
    (resolvedFsm.state === FSM_STATE.SUCCEEDED || resolvedFsm.state === FSM_STATE.CONVERGED) &&
    effectiveLedgerDrift
  ) {
    violations.push({
      type: VIOLATION_TYPE.FSM_LEDGER_MISMATCH,
      severity: "CRITICAL",
      detail: "fsm_success_vs_ledger_drift",
    });
  }

  if (
    entryStatus === IDEMPOTENCY_STATUS.COMPLETED &&
    entry?.cachedResult != null &&
    effectiveLedgerDrift
  ) {
    violations.push({
      type: VIOLATION_TYPE.STALE_SUCCESS_CACHE,
      severity: "CRITICAL",
      detail: "completed_cache_with_ledger_drift",
    });
  }

  if (
    entryStatus === IDEMPOTENCY_STATUS.COMPLETED &&
    resolvedFsm.state === FSM_STATE.FAILED_RETRYABLE &&
    !ctx.lastExecutionOutcome
  ) {
    violations.push({
      type: VIOLATION_TYPE.IDENTITY_CONFLICT,
      severity: "HIGH",
      detail: "completed_vs_failed_retryable_fsm",
    });
  }

  if (
    (resolvedFsm.state === FSM_STATE.RECONCILE_REQUIRED || entryStatus === IDEMPOTENCY_STATUS.RECONCILE_REQUIRED) &&
    rec === "none"
  ) {
    violations.push({
      type: VIOLATION_TYPE.RECONCILIATION_STALL,
      severity: "HIGH",
      detail: "reconcile_required_without_queue",
    });
  }

  if (entryStatus === IDEMPOTENCY_STATUS.FAILED_RETRYABLE && entry?.nextRetryAtMs) {
    const now = Date.now();
    if (now > Number(entry.nextRetryAtMs) + RETRY_STUCK_MS) {
      violations.push({
        type: VIOLATION_TYPE.RETRY_STUCK_STATE,
        severity: "MEDIUM",
        detail: "retry_backoff_long_overdue",
      });
    }
  }

  if (
    ctx.lastExecutionOutcome === "success" &&
    (resolvedFsm.state === FSM_STATE.FAILED_FINAL || entryStatus === IDEMPOTENCY_STATUS.FAILED_FINAL)
  ) {
    violations.push({
      type: VIOLATION_TYPE.EXECUTION_OVERWRITE,
      severity: "CRITICAL",
      detail: "success_vs_failed_final",
    });
  }

  let severity = "LOW";
  for (const v of violations) {
    severity = maxSeverity(severity, v.severity);
  }

  const correctedState = violations.length
    ? computeCorrectedFsmState(ctx, violations, resolvedFsm.state)
    : resolvedFsm.state;

  return {
    isConsistent: violations.length === 0,
    violations,
    resolvedFsm,
    correctedState,
    severity,
  };
}

/**
 * Recommended FSM after applying deterministic non-executing repairs (simulation).
 */
function computeCorrectedFsmState(ctx, violations, currentFsm) {
  const types = new Set(violations.map((v) => v.type));
  if (types.has(VIOLATION_TYPE.EXECUTION_OVERWRITE) || types.has(VIOLATION_TYPE.FSM_LEDGER_MISMATCH)) {
    return FSM_STATE.RECONCILE_REQUIRED;
  }
  if (types.has(VIOLATION_TYPE.STALE_SUCCESS_CACHE)) {
    return FSM_STATE.RECONCILE_REQUIRED;
  }
  if (types.has(VIOLATION_TYPE.RECONCILIATION_STALL)) {
    return FSM_STATE.RECONCILE_REQUIRED;
  }
  if (types.has(VIOLATION_TYPE.IDENTITY_CONFLICT)) {
    return FSM_STATE.RECONCILE_REQUIRED;
  }
  if (types.has(VIOLATION_TYPE.RETRY_STUCK_STATE)) {
    return FSM_STATE.FAILED_RETRYABLE;
  }
  return currentFsm;
}

/**
 * @param {{ isConsistent: boolean, violations: object[], resolvedFsm: object, correctedState: string|null, severity: string }} result
 */
export function logUfecConsistency(result) {
  if (!shouldLogConsistency()) return;
  console.info("[UFEC_CONSISTENCY]", {
    isConsistent: result.isConsistent,
    severity: result.severity,
    fsm: result.resolvedFsm?.state,
    correctedState: result.correctedState,
    violationCount: result.violations?.length ?? 0,
    violations: result.violations,
  });
}

async function hasPendingReconciliationRow(globalEventId) {
  const pending = await getUfecReconciliationQueuePending();
  return pending.some((r) => r.globalEventId === globalEventId);
}

/**
 * State-only repairs: idempotency patch, queue injection, retry clock refresh. No HTTP, no UFEC re-exec.
 * @param {string} globalEventId
 * @returns {Promise<{ applied: string[], after: ReturnType<typeof validateSystemConsistency> }>}
 */
export async function repairFinancialEventConsistency(globalEventId) {
  const gid = String(globalEventId || "");
  const applied = [];

  let ctx = await loadFinancialEventStateContextFromStores(gid);
  let report = validateSystemConsistency(ctx);
  if (report.isConsistent) {
    logUfecConsistency(report);
    return { applied, after: report };
  }

  const entry = await loadUfecIdempotencyEntry(gid);
  const vTypes = new Set(report.violations.map((v) => v.type));

  const needsReconcileMark =
    vTypes.has(VIOLATION_TYPE.STALE_SUCCESS_CACHE) ||
    vTypes.has(VIOLATION_TYPE.FSM_LEDGER_MISMATCH) ||
    vTypes.has(VIOLATION_TYPE.EXECUTION_OVERWRITE) ||
    vTypes.has(VIOLATION_TYPE.IDENTITY_CONFLICT);

  if (needsReconcileMark) {
    let ledgerConvergence = entry?.ledgerConvergence ?? {
      state: CONVERGENCE_STATE.DRIFT,
      driftType: "CONSISTENCY_REPAIR",
      severity: "CRITICAL",
      divergenceReason: "consistency_engine",
    };
    if (vTypes.has(VIOLATION_TYPE.EXECUTION_OVERWRITE)) {
      ledgerConvergence = {
        state: CONVERGENCE_STATE.UNKNOWN,
        driftType: "EXECUTION_OVERWRITE",
        severity: "CRITICAL",
        divergenceReason: "success_vs_failed_final",
      };
    } else if (vTypes.has(VIOLATION_TYPE.IDENTITY_CONFLICT)) {
      ledgerConvergence = {
        state: CONVERGENCE_STATE.UNKNOWN,
        driftType: "IDENTITY_CONFLICT",
        severity: "HIGH",
        divergenceReason: "completed_vs_retryable_fsm",
      };
    }
    await markLedgerReconcileRequired(gid, {
      eventType: entry?.eventType,
      ledgerConvergence,
      writeSource: UFEC_WRITE_SOURCE.RECONCILIATION_ENGINE,
    });
    applied.push("markLedgerReconcileRequired");
  }

  if (vTypes.has(VIOLATION_TYPE.RECONCILIATION_STALL)) {
    const exists = await hasPendingReconciliationRow(gid);
    if (!exists) {
      const plan = getDeterministicRepairPlan(entry?.ledgerConvergence?.driftType ?? null);
      await enqueueUfecReconciliationQueueRow({
        globalEventId: gid,
        eventType: entry?.eventType ?? "UNKNOWN",
        convergenceState: "RECONCILE_REQUIRED",
        driftType: entry?.ledgerConvergence?.driftType ?? "RECONCILIATION_STALL",
        severity: "HIGH",
        divergenceReason: "RECONCILIATION_STALL",
        repairAction: plan.repairAction,
        repairRule: `${plan.rule}|consistency_injection`,
        ledgerComparison: { status: "STALL", details: { reason: "injected_by_consistency_engine" } },
        status: "pending",
      });
      applied.push("enqueueUfecReconciliationQueueRow");
    }
  }

  if (vTypes.has(VIOLATION_TYPE.RETRY_STUCK_STATE) && entry?.status === IDEMPOTENCY_STATUS.FAILED_RETRYABLE) {
    await persistUfecIdempotencyEntry(
      {
        ...entry,
        global_event_id: gid,
        nextRetryAtMs: Date.now(),
        failureReason: entry.failureReason ?? "consistency_retry_clock_refresh",
      },
      { writeSource: UFEC_WRITE_SOURCE.RECONCILIATION_ENGINE }
    );
    applied.push("refresh_retry_backoff_clock");
  }

  ctx = await loadFinancialEventStateContextFromStores(gid);
  report = validateSystemConsistency(ctx);
  logUfecConsistency(report);
  return { applied, after: report };
}

/**
 * Optional audit hook: validate + repair. Safe to call after sync or on a timer.
 * @param {string} globalEventId
 */
export async function runConsistencyAuditForGlobalEvent(globalEventId) {
  const before = validateSystemConsistency(await loadFinancialEventStateContextFromStores(globalEventId));
  logUfecConsistency(before);
  if (before.isConsistent) {
    return { before, after: before, applied: [] };
  }
  return { before, ...(await repairFinancialEventConsistency(globalEventId)) };
}
