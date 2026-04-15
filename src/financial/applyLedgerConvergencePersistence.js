/**
 * Phase 3 Step 3 — After HTTP success: converge ledger observation vs UFEC intent, then persist idempotency + repair queue.
 */

import {
  completeUfecExecution,
  IDEMPOTENCY_STATUS,
  loadUfecIdempotencyEntry,
  markLedgerReconcileRequired,
  ufecFingerprintExecutionResult,
} from "./ufecIdempotencyRegistry.js";
import { createDeviceEventSignature, DEVICE_TRUST_WEIGHT } from "./ufecDafta.js";
import { getUfecDeviceId } from "./ufecDeviceSequence.js";
import { getUfecReconciliationStatusForGlobalEvent } from "../services/db.js";
import {
  CONVERGENCE_STATE,
  convergenceRequiresReconciliationQueue,
  evaluateLedgerConvergence,
  logLedgerConvergenceShadow,
} from "./ufecLedgerConvergence.js";
import { persistUfecReconciliationArtifacts } from "./ufecReconciliationQueue.js";
import {
  loadFinancialEventStateContextFromStores,
  logUfecFsm,
  resolveFinancialEventState,
} from "./ufecFinancialEventFsm.js";
import {
  logUfecConsistency,
  repairFinancialEventConsistency,
  validateSystemConsistency,
} from "./ufecSystemConsistency.js";
import { emitLedgerFsmObservationFireAndForget } from "./ufecIfets.js";

/**
 * Phase 4 Step 4 — DAFTA execution footprint (per device, same globalEventId).
 * @param {string} globalEventId
 * @param {unknown} result
 * @param {{ state: string, driftType?: string|null, severity?: string|null, divergenceReason?: string|null }|null|undefined} convergence
 * @param {string} finalStatus — IDEMPOTENCY_STATUS
 * @param {'none'|'queued'|'resolved'|'mixed'|undefined} [reconciliationStatusOverride]
 */
async function buildDaftaExecutionSignature(
  globalEventId,
  result,
  convergence,
  finalStatus,
  reconciliationStatusOverride
) {
  const entry = await loadUfecIdempotencyEntry(globalEventId);
  const recon =
    reconciliationStatusOverride !== undefined
      ? reconciliationStatusOverride
      : await getUfecReconciliationStatusForGlobalEvent(globalEventId);
  const ledgerConvergenceState =
    finalStatus === IDEMPOTENCY_STATUS.RECONCILE_REQUIRED
      ? convergence?.state ?? null
      : (convergence?.state ?? CONVERGENCE_STATE.MATCH);
  const predictedEntry = entry
    ? {
        ...entry,
        status: finalStatus,
        ledgerConvergence:
          finalStatus === IDEMPOTENCY_STATUS.RECONCILE_REQUIRED && convergence
            ? {
                state: convergence.state,
                driftType: convergence.driftType,
                severity: convergence.severity,
                divergenceReason: convergence.divergenceReason,
              }
            : undefined,
      }
    : null;
  const fsm = resolveFinancialEventState({
    globalEventId,
    idempotencyEntry: predictedEntry,
    ledgerConvergenceState,
    reconciliationStatus: recon,
    lastExecutionOutcome: null,
    lastFailureClass: null,
  });
  return createDeviceEventSignature({
    globalEventId,
    deviceId: getUfecDeviceId(),
    executionAttempt: entry?.eventAttempt ?? 0,
    ledgerHash: ufecFingerprintExecutionResult(result),
    fsmState: fsm.state,
    convergenceState: ledgerConvergenceState ?? "",
    timestamp: Date.now(),
    sequenceKey: entry?.eventSequenceKey ?? "",
    idempotencyStatus: finalStatus,
    deviceTrustWeight: DEVICE_TRUST_WEIGHT.PRIMARY_POS,
  });
}

/**
 * @param {string} globalEventId
 * @param {object} event — FinancialEvent
 * @param {unknown} result — API body
 * @param {{ expected: object, actual: unknown, comparison: object }|undefined} ledgerBundle
 */
export async function applyLedgerConvergenceAfterExecution(globalEventId, event, result, ledgerBundle) {
  if (!ledgerBundle) {
    const deviceSignature = await buildDaftaExecutionSignature(
      globalEventId,
      result,
      { state: CONVERGENCE_STATE.MATCH },
      IDEMPOTENCY_STATUS.COMPLETED
    );
    await completeUfecExecution(globalEventId, result, { deviceSignature });
    const ctx = await loadFinancialEventStateContextFromStores(globalEventId);
    const resolved = resolveFinancialEventState(ctx);
    logUfecFsm(resolved);
    emitLedgerFsmObservationFireAndForget(globalEventId, undefined, { state: CONVERGENCE_STATE.MATCH }, resolved);
    const cons = validateSystemConsistency(ctx);
    logUfecConsistency(cons);
    if (!cons.isConsistent) await repairFinancialEventConsistency(globalEventId);
    return;
  }

  const convergence = evaluateLedgerConvergence(event, ledgerBundle);
  logLedgerConvergenceShadow(event, ledgerBundle, convergence);

  if (convergence.state === CONVERGENCE_STATE.MATCH) {
    const deviceSignature = await buildDaftaExecutionSignature(
      globalEventId,
      result,
      convergence,
      IDEMPOTENCY_STATUS.COMPLETED
    );
    await completeUfecExecution(globalEventId, result, { deviceSignature });
    const ctx = await loadFinancialEventStateContextFromStores(globalEventId);
    const resolved = resolveFinancialEventState(ctx);
    logUfecFsm(resolved);
    emitLedgerFsmObservationFireAndForget(globalEventId, ledgerBundle, convergence, resolved);
    const cons = validateSystemConsistency(ctx);
    logUfecConsistency(cons);
    if (!cons.isConsistent) await repairFinancialEventConsistency(globalEventId);
    return;
  }

  if (convergenceRequiresReconciliationQueue(convergence)) {
    const deviceSignature = await buildDaftaExecutionSignature(
      globalEventId,
      result,
      convergence,
      IDEMPOTENCY_STATUS.RECONCILE_REQUIRED,
      "queued"
    );
    await markLedgerReconcileRequired(globalEventId, {
      eventType: event.type,
      ledgerConvergence: {
        state: convergence.state,
        driftType: convergence.driftType,
        severity: convergence.severity,
        divergenceReason: convergence.divergenceReason,
      },
      deviceSignature,
    });
    await persistUfecReconciliationArtifacts({
      globalEventId,
      eventType: event.type,
      convergence,
      ledgerBundle,
      rawResult: result,
    });
    const ctx = await loadFinancialEventStateContextFromStores(globalEventId);
    const resolved = resolveFinancialEventState(ctx);
    logUfecFsm(resolved);
    emitLedgerFsmObservationFireAndForget(globalEventId, ledgerBundle, convergence, resolved);
    const cons = validateSystemConsistency(ctx);
    logUfecConsistency(cons);
    if (!cons.isConsistent) await repairFinancialEventConsistency(globalEventId);
  }
}
