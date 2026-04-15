/**
 * Phase 4 Step 4 — Device-Agnostic Financial Truth Arbitration (DAFTA).
 * Cross-device execution reports are merged by authority — never “last write wins” from device-local ego.
 *
 * No automatic re-execution here: classify, normalize, prefer reconciliation / convergence / idempotency.
 */

import { CONVERGENCE_STATE } from "./ufecLedgerConvergence.js";
import { FSM_STATE } from "./ufecFinancialEventFsm.js";

/** Mirrors `IDEMPOTENCY_STATUS` in ufecIdempotencyRegistry.js — avoid importing registry (cycle). */
const IDS = {
  COMPLETED: "COMPLETED",
  IN_FLIGHT: "IN_FLIGHT",
  RECONCILE_REQUIRED: "RECONCILE_REQUIRED",
};

/** Optional tie-break when merge is ambiguous (NOT authority). */
export const DEVICE_TRUST_WEIGHT = {
  PRIMARY_POS: 100,
  SECONDARY_POS: 60,
  MOBILE_OR_ADMIN: 30,
  UNKNOWN: 10,
};

/** @typedef {'LEDGER_DIVERGENCE'|'FSM_DIVERGENCE'|'IDENTITY_COLLISION'|'CONVERGENCE_SPLIT'|'PARTIAL_EXECUTION_SPLIT'|'NONE'} DaftaConflictType */

export const DAFTA_CONFLICT_TYPE = {
  LEDGER_DIVERGENCE: "LEDGER_DIVERGENCE",
  FSM_DIVERGENCE: "FSM_DIVERGENCE",
  IDENTITY_COLLISION: "IDENTITY_COLLISION",
  CONVERGENCE_SPLIT: "CONVERGENCE_SPLIT",
  PARTIAL_EXECUTION_SPLIT: "PARTIAL_EXECUTION_SPLIT",
  NONE: "NONE",
};

/** @typedef {'RECONCILIATION_FIRST'|'CONVERGENCE_OVERRIDE'|'IDEMPOTENCY_REGISTRY'|'FSM_RESOLVER'|'NO_OP'|'DEFER'} DaftaResolutionStrategy */

export const DAFTA_RESOLUTION_STRATEGY = {
  RECONCILIATION_FIRST: "RECONCILIATION_FIRST",
  CONVERGENCE_OVERRIDE: "CONVERGENCE_OVERRIDE",
  IDEMPOTENCY_REGISTRY: "IDEMPOTENCY_REGISTRY",
  FSM_RESOLVER: "FSM_RESOLVER",
  NO_OP: "NO_OP",
  DEFER: "DEFER",
};

/** Documentation-only: higher index = higher authority for merge. */
export const DAFTA_AUTHORITY_ORDER = [
  "RECONCILIATION_ENGINE",
  "LEDGER_CONVERGENCE_ENGINE",
  "IDEMPOTENCY_REGISTRY",
  "FSM_RESOLVER",
  "EXECUTION_RESULTS",
  "DEVICE_STATE_IGNORED",
];

/**
 * @param {{
 *   globalEventId: string,
 *   deviceId: string,
 *   executionAttempt: number,
 *   ledgerHash: string,
 *   fsmState: string,
 *   convergenceState: string,
 *   timestamp: number,
 *   sequenceKey: string,
 *   idempotencyStatus?: string,
 *   deviceTrustWeight?: number,
 * }} p
 */
export function createDeviceEventSignature(p) {
  return {
    globalEventId: String(p.globalEventId),
    deviceId: String(p.deviceId),
    executionAttempt: Number(p.executionAttempt) || 0,
    ledgerHash: p.ledgerHash != null ? String(p.ledgerHash) : "",
    fsmState: String(p.fsmState),
    convergenceState: p.convergenceState != null ? String(p.convergenceState) : "",
    timestamp: Number(p.timestamp) || Date.now(),
    sequenceKey: String(p.sequenceKey || ""),
    idempotencyStatus: p.idempotencyStatus != null ? String(p.idempotencyStatus) : "",
    deviceTrustWeight: Number(p.deviceTrustWeight ?? DEVICE_TRUST_WEIGHT.UNKNOWN),
  };
}

/**
 * @param {unknown[]|undefined} prev
 * @param {ReturnType<typeof createDeviceEventSignature>} sig
 * @returns {object[]}
 */
export function mergeDeviceSignatureList(prev, sig) {
  const list = Array.isArray(prev) ? [...prev] : [];
  const key = `${sig.deviceId}|${sig.sequenceKey}`;
  const idx = list.findIndex((x) => `${x.deviceId}|${x.sequenceKey}` === key);
  if (idx >= 0) list[idx] = sig;
  else list.push(sig);
  return list.slice(-25);
}

/**
 * @param {ReturnType<typeof createDeviceEventSignature>[]} eventSignatures
 * @param {{ reconciliationStatus?: 'none'|'queued'|'resolved'|'mixed' }} [meta]
 */
export function mergeDeviceEventStates(eventSignatures, meta = {}) {
  const reconciliationStatus = meta.reconciliationStatus ?? "none";
  const sigs = Array.isArray(eventSignatures) ? eventSignatures.filter(Boolean) : [];
  if (sigs.length === 0) {
    return {
      canonicalState: null,
      resolvedFSM: null,
      resolvedLedgerState: null,
      conflictType: DAFTA_CONFLICT_TYPE.NONE,
      resolutionStrategy: DAFTA_RESOLUTION_STRATEGY.NO_OP,
    };
  }

  /** Reconciliation engine — highest authority */
  if (reconciliationStatus === "resolved") {
    const pick = pickStrongestByTrust(sigs);
    return {
      canonicalState: {
        fsmState: FSM_STATE.CONVERGED,
        ledgerHash: pick?.ledgerHash ?? "",
        convergenceState: CONVERGENCE_STATE.MATCH,
        idempotencyStatus: IDS.COMPLETED,
      },
      resolvedFSM: FSM_STATE.CONVERGED,
      resolvedLedgerState: pick?.ledgerHash ?? null,
      conflictType: DAFTA_CONFLICT_TYPE.NONE,
      resolutionStrategy: DAFTA_RESOLUTION_STRATEGY.RECONCILIATION_FIRST,
    };
  }

  if (reconciliationStatus === "queued" || reconciliationStatus === "mixed") {
    return {
      canonicalState: {
        fsmState: FSM_STATE.RECONCILE_REQUIRED,
        ledgerHash: null,
        convergenceState: CONVERGENCE_STATE.DRIFT,
        idempotencyStatus: IDS.RECONCILE_REQUIRED,
      },
      resolvedFSM: FSM_STATE.RECONCILE_REQUIRED,
      resolvedLedgerState: null,
      conflictType: DAFTA_CONFLICT_TYPE.CONVERGENCE_SPLIT,
      resolutionStrategy: DAFTA_RESOLUTION_STRATEGY.RECONCILIATION_FIRST,
    };
  }

  const hashes = uniqueNonEmpty(sigs.map((s) => s.ledgerHash));
  if (hashes.length > 1) {
    const pick = pickStrongestByTrust(sigs);
    return {
      canonicalState: {
        fsmState: FSM_STATE.RECONCILE_REQUIRED,
        ledgerHash: pick?.ledgerHash ?? hashes[0],
        convergenceState: CONVERGENCE_STATE.DRIFT,
        idempotencyStatus: IDS.RECONCILE_REQUIRED,
      },
      resolvedFSM: FSM_STATE.RECONCILE_REQUIRED,
      resolvedLedgerState: pick?.ledgerHash ?? null,
      conflictType: DAFTA_CONFLICT_TYPE.LEDGER_DIVERGENCE,
      resolutionStrategy: DAFTA_RESOLUTION_STRATEGY.CONVERGENCE_OVERRIDE,
    };
  }

  if (hasIdentityCollision(sigs)) {
    const pick = pickStrongestByTrust(sigs);
    return {
      canonicalState: {
        fsmState: pick?.fsmState ?? FSM_STATE.CONVERGED,
        ledgerHash: pick?.ledgerHash ?? "",
        convergenceState: pick?.convergenceState ?? "",
        idempotencyStatus: IDS.COMPLETED,
      },
      resolvedFSM: pick?.fsmState ?? null,
      resolvedLedgerState: pick?.ledgerHash ?? null,
      conflictType: DAFTA_CONFLICT_TYPE.IDENTITY_COLLISION,
      resolutionStrategy: DAFTA_RESOLUTION_STRATEGY.IDEMPOTENCY_REGISTRY,
    };
  }

  if (hasFsmDivergence(sigs)) {
    const pick = pickStrongestByTrust(
      sigs.filter((s) => s.fsmState === FSM_STATE.SUCCEEDED || s.fsmState === FSM_STATE.CONVERGED)
    );
    const winner = pick || pickStrongestByTrust(sigs);
    return {
      canonicalState: {
        fsmState: winner?.fsmState ?? FSM_STATE.RECONCILE_REQUIRED,
        ledgerHash: winner?.ledgerHash ?? "",
        convergenceState: winner?.convergenceState ?? "",
        idempotencyStatus: winner?.idempotencyStatus ?? "",
      },
      resolvedFSM: winner?.fsmState ?? null,
      resolvedLedgerState: winner?.ledgerHash ?? null,
      conflictType: DAFTA_CONFLICT_TYPE.FSM_DIVERGENCE,
      resolutionStrategy: DAFTA_RESOLUTION_STRATEGY.FSM_RESOLVER,
    };
  }

  if (hasPartialExecutionSplit(sigs)) {
    const completed = sigs.find((s) => [FSM_STATE.SUCCEEDED, FSM_STATE.CONVERGED].includes(s.fsmState));
    const pick = completed || pickStrongestByTrust(sigs);
    return {
      canonicalState: {
        fsmState: pick?.fsmState ?? FSM_STATE.IN_FLIGHT,
        ledgerHash: pick?.ledgerHash ?? "",
        convergenceState: pick?.convergenceState ?? CONVERGENCE_STATE.UNKNOWN,
        idempotencyStatus: pick?.idempotencyStatus ?? IDS.IN_FLIGHT,
      },
      resolvedFSM: pick?.fsmState ?? null,
      resolvedLedgerState: pick?.ledgerHash ?? null,
      conflictType: DAFTA_CONFLICT_TYPE.PARTIAL_EXECUTION_SPLIT,
      resolutionStrategy: DAFTA_RESOLUTION_STRATEGY.DEFER,
    };
  }

  const pick = pickStrongestByTrust(sigs);
  return {
    canonicalState: {
      fsmState: pick?.fsmState ?? null,
      ledgerHash: pick?.ledgerHash ?? "",
      convergenceState: pick?.convergenceState ?? "",
      idempotencyStatus: pick?.idempotencyStatus ?? "",
    },
    resolvedFSM: pick?.fsmState ?? null,
    resolvedLedgerState: pick?.ledgerHash ?? null,
    conflictType: DAFTA_CONFLICT_TYPE.NONE,
    resolutionStrategy: DAFTA_RESOLUTION_STRATEGY.NO_OP,
  };
}

/**
 * @param {string} globalEventId
 * @param {{
 *   signatures?: object[]|null,
 *   idempotencyEntry?: object|null,
 *   reconciliationStatus?: 'none'|'queued'|'resolved'|'mixed',
 * }} ctx
 */
export function resolveCanonicalDeviceState(globalEventId, ctx = {}) {
  const gid = String(globalEventId || "");
  const signatures = Array.isArray(ctx.signatures)
    ? ctx.signatures
    : Array.isArray(ctx.idempotencyEntry?.deviceEventSignatures)
      ? ctx.idempotencyEntry.deviceEventSignatures
      : [];
  const reconciliationStatus = ctx.reconciliationStatus ?? "none";

  const merged = mergeDeviceEventStates(signatures, { reconciliationStatus });
  /** @type {{ layer: string, decision: string, detail?: string }[]} */
  const resolutionLog = [];

  if (merged.resolutionStrategy === DAFTA_RESOLUTION_STRATEGY.RECONCILIATION_FIRST) {
    resolutionLog.push({
      layer: "RECONCILIATION_ENGINE",
      decision: merged.resolvedFSM || "RECONCILE",
      detail: reconciliationStatus,
    });
  } else if (merged.conflictType === DAFTA_CONFLICT_TYPE.LEDGER_DIVERGENCE) {
    resolutionLog.push({
      layer: "LEDGER_CONVERGENCE_ENGINE",
      decision: "REQUIRE_RECONCILE",
      detail: "ledger_hash_mismatch",
    });
  } else if (merged.conflictType === DAFTA_CONFLICT_TYPE.IDENTITY_COLLISION) {
    resolutionLog.push({
      layer: "IDEMPOTENCY_REGISTRY",
      decision: "SINGLE_CANONICAL",
      detail: gid,
    });
  } else if (merged.conflictType === DAFTA_CONFLICT_TYPE.FSM_DIVERGENCE) {
    resolutionLog.push({ layer: "FSM_RESOLVER", decision: merged.resolvedFSM || "", detail: "prefer_converged_or_succeeded" });
  }

  const activeDeviceConflicts = signatures.length > 1 && merged.conflictType !== DAFTA_CONFLICT_TYPE.NONE;

  return {
    globalEventId: gid,
    canonicalFSM: merged.canonicalState?.fsmState ?? null,
    canonicalLedgerState: merged.resolvedLedgerState,
    canonicalConvergenceState: merged.canonicalState?.convergenceState ?? null,
    canonicalIdempotencyStatus: merged.canonicalState?.idempotencyStatus ?? null,
    activeDeviceConflicts: Boolean(activeDeviceConflicts),
    conflictType: merged.conflictType,
    resolutionStrategy: merged.resolutionStrategy,
    resolutionLog,
    merge: merged,
  };
}

/**
 * Repair hints only — **no** automatic replay (callers enqueue reconciliation / FSM repair).
 * @param {ReturnType<typeof resolveCanonicalDeviceState>} resolved
 */
export function suggestDaftaRepairActions(resolved) {
  const out = {
    enqueueLedgerReconciliation: false,
    suggestIdempotencyCorrection: false,
    suggestFsmRealignment: false,
    suppressBlindReplay: true,
  };
  if (!resolved) return out;
  if (
    resolved.conflictType === DAFTA_CONFLICT_TYPE.LEDGER_DIVERGENCE ||
    resolved.conflictType === DAFTA_CONFLICT_TYPE.CONVERGENCE_SPLIT
  ) {
    out.enqueueLedgerReconciliation = true;
  }
  if (resolved.conflictType === DAFTA_CONFLICT_TYPE.IDENTITY_COLLISION) {
    out.suggestIdempotencyCorrection = true;
  }
  if (resolved.conflictType === DAFTA_CONFLICT_TYPE.FSM_DIVERGENCE) {
    out.suggestFsmRealignment = true;
  }
  if (resolved.conflictType === DAFTA_CONFLICT_TYPE.PARTIAL_EXECUTION_SPLIT) {
    out.suppressBlindReplay = true;
  }
  return out;
}

function uniqueNonEmpty(arr) {
  return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];
}

function pickStrongestByTrust(sigs) {
  if (!sigs.length) return null;
  return [...sigs].sort((a, b) => Number(b.deviceTrustWeight || 0) - Number(a.deviceTrustWeight || 0))[0];
}

function hasFsmDivergence(sigs) {
  const states = new Set(sigs.map((s) => s.fsmState));
  const hasRetry = states.has(FSM_STATE.FAILED_RETRYABLE);
  const hasOk = [...states].some((x) => [FSM_STATE.SUCCEEDED, FSM_STATE.CONVERGED].includes(x));
  return hasRetry && hasOk;
}

function hasPartialExecutionSplit(sigs) {
  const inflight = sigs.some(
    (s) => s.fsmState === FSM_STATE.IN_FLIGHT || s.idempotencyStatus === IDS.IN_FLIGHT
  );
  const done = sigs.some((s) => [FSM_STATE.SUCCEEDED, FSM_STATE.CONVERGED].includes(s.fsmState));
  return inflight && done;
}

function hasIdentityCollision(sigs) {
  if (sigs.length < 2) return false;
  const devices = new Set(sigs.map((s) => s.deviceId));
  if (devices.size < 2) return false;
  const completed = sigs.filter((s) => s.idempotencyStatus === IDS.COMPLETED);
  if (completed.length < 2) return false;
  const hashes = uniqueNonEmpty(completed.map((s) => s.ledgerHash));
  return hashes.length > 1;
}
