/**
 * Phase 4 Step 5 — Immutable Financial Event Telemetry Stream (IFETS).
 * Append-only observability: passive, non-blocking, never on the critical execution path.
 */

import {
  appendUfecAuditObservation,
  getUfecAuditStreamByGlobalEventId,
  getUfecReconciliationStatusForGlobalEvent,
} from "../services/db.js";
import { loadUfecIdempotencyEntry } from "./ufecIdempotencyRegistry.js";
import { resolveCanonicalDeviceState } from "./ufecDafta.js";
import { getLastOperationalSnapshotForObservers } from "./ufecSystemHealth.js";

export const UFEC_OBSERVATION_SUBSYSTEM = {
  EXECUTION: "EXECUTION",
  FSM: "FSM",
  LEDGER: "LEDGER",
  IDENTITY: "IDENTITY",
  RECONCILIATION: "RECONCILIATION",
  DAFTA: "DAFTA",
  SYSTEM: "SYSTEM",
};

export const UFEC_OBSERVATION_PHASE = {
  PRE_HTTP: "PRE_HTTP",
  POST_HTTP_SUCCESS: "POST_HTTP_SUCCESS",
  POST_HTTP_FAILURE: "POST_HTTP_FAILURE",
  CONVERGENCE_EVAL: "CONVERGENCE_EVAL",
  FSM_RESOLVE: "FSM_RESOLVE",
  IDEMPOTENCY_TRANSITION: "IDEMPOTENCY_TRANSITION",
  RECONCILE_ENQUEUE: "RECONCILE_ENQUEUE",
  DAFTA_MERGE: "DAFTA_MERGE",
};

/** @typedef {'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'} IfetsSeverity */

export const UFEC_ANOMALY_TYPE = {
  STATE_OSCILLATION: "STATE_OSCILLATION",
  LEDGER_DRIFT_RECURRENCE: "LEDGER_DRIFT_RECURRENCE",
  IDENTITY_CONFLICT: "IDENTITY_CONFLICT",
  RECONCILIATION_LOOP: "RECONCILIATION_LOOP",
};

function ifetsDisabled() {
  try {
    return import.meta.env?.VITE_UFEC_IFETS === "0";
  } catch {
    return false;
  }
}

/**
 * correlationId = globalEventId + executionAttempt (spec).
 * @param {string} globalEventId
 * @param {number} [executionAttempt]
 */
export function computeUfecCorrelationId(globalEventId, executionAttempt = 0) {
  return `${String(globalEventId)}#a${Number(executionAttempt) || 0}`;
}

/**
 * @param {object|null|undefined} entry — idempotency row
 */
export function deriveGlobalOrderKeyForObservation(entry) {
  if (!entry) return "";
  return String(entry.globalOrderKey ?? entry.eventSequenceKey ?? entry.global_event_id ?? "");
}

/**
 * Compact snapshots — avoid full API payload duplication.
 */
export function compactLedgerSnapshot(ledgerBundle) {
  if (!ledgerBundle?.comparison) return { hasBundle: false };
  return {
    hasBundle: true,
    status: ledgerBundle.comparison.status,
    enforcementLevel: ledgerBundle.comparison.enforcementLevel,
    reason: ledgerBundle.comparison.details?.reason,
  };
}

export function compactIdempotencySnapshot(entry) {
  if (!entry) return null;
  return {
    status: entry.status,
    eventAttempt: entry.eventAttempt,
    retryCount: entry.retryCount,
    eventVersion: entry.eventVersion,
  };
}

export function compactFsmSnapshot(resolved) {
  if (!resolved) return null;
  return {
    state: resolved.state,
    reason: resolved.reason,
    source: resolved.source,
  };
}

export function compactConvergenceSnapshot(convergence) {
  if (!convergence) return null;
  return {
    state: convergence.state,
    driftType: convergence.driftType,
    severity: convergence.severity,
  };
}

export function compactDeviceSignatureSummary(entry) {
  const list = entry?.deviceEventSignatures;
  if (!Array.isArray(list) || list.length === 0) {
    return { count: 0, deviceIds: [], lastLedgerHash: null };
  }
  return {
    count: list.length,
    deviceIds: [...new Set(list.map((s) => s.deviceId).filter(Boolean))],
    lastLedgerHash: list[list.length - 1]?.ledgerHash ?? null,
  };
}

/**
 * @param {object|null|undefined} before
 * @param {object|null|undefined} after
 * @returns {{ changedFields: string[], criticalChanges: string[], severity: IfetsSeverity }}
 */
export function computeStateDiff(before, after) {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changedFields = [];
  const criticalKeys = new Set(["status", "fsmState", "ledgerHash", "idempotencyStatus", "convergenceState"]);
  const criticalChanges = [];
  for (const k of keys) {
    let sj;
    try {
      sj = JSON.stringify(b[k]) !== JSON.stringify(a[k]);
    } catch {
      sj = true;
    }
    if (sj) {
      changedFields.push(k);
      if (criticalKeys.has(k)) criticalChanges.push(k);
    }
  }
  /** @type {IfetsSeverity} */
  let severity = "LOW";
  if (criticalChanges.includes("status") || criticalChanges.includes("fsmState")) severity = "HIGH";
  else if (criticalChanges.length > 0) severity = "MEDIUM";
  if (changedFields.length > 8) severity = severity === "LOW" ? "MEDIUM" : "HIGH";
  return { changedFields, criticalChanges, severity };
}

function scheduleIfetsWork(fn) {
  const run = () => {
    Promise.resolve()
      .then(fn)
      .catch((e) => {
        if (import.meta.env.DEV) console.warn("[UFEC_IFETS]", e);
      });
  };
  if (typeof queueMicrotask === "function") queueMicrotask(run);
  else setTimeout(run, 0);
}

/**
 * Execution layer — PRE / POST HTTP (loads idempotency row off-thread).
 * @param {string} globalEventId
 * @param {string} phase — UFEC_OBSERVATION_PHASE
 * @param {object} [extra]
 */
export function emitExecutionObservationPhase(globalEventId, phase, extra = {}) {
  if (ifetsDisabled()) return;
  scheduleIfetsWork(async () => {
    const entry = await loadUfecIdempotencyEntry(globalEventId);
    await appendIfetsObservation({
      globalEventId,
      correlationId: computeUfecCorrelationId(globalEventId, entry?.eventAttempt),
      globalOrderKey: deriveGlobalOrderKeyForObservation(entry),
      type: extra.type || "EXECUTION",
      subsystem: UFEC_OBSERVATION_SUBSYSTEM.EXECUTION,
      phase,
      idempotencySnapshot: compactIdempotencySnapshot(entry),
      ...extra,
    });
    await runIfetsAnomalyScanIfNeeded(globalEventId);
  });
}

export function emitReconciliationEnqueueObservation(globalEventId) {
  if (ifetsDisabled()) return;
  scheduleIfetsWork(async () => {
    const entry = await loadUfecIdempotencyEntry(globalEventId);
    await appendIfetsObservation({
      globalEventId,
      correlationId: computeUfecCorrelationId(globalEventId, entry?.eventAttempt),
      globalOrderKey: deriveGlobalOrderKeyForObservation(entry),
      type: "RECONCILE_ENQUEUE",
      subsystem: UFEC_OBSERVATION_SUBSYSTEM.RECONCILIATION,
      phase: UFEC_OBSERVATION_PHASE.RECONCILE_ENQUEUE,
      idempotencySnapshot: compactIdempotencySnapshot(entry),
    });
    await runIfetsAnomalyScanIfNeeded(globalEventId);
  });
}

/**
 * Ledger + FSM snapshot after convergence evaluation (same hook as FSM log).
 * @param {string} globalEventId
 * @param {{ expected?: object, actual?: unknown, comparison: object }|undefined} ledgerBundle
 * @param {object|null|undefined} convergence — evaluateLedgerConvergence result shape or { state }
 * @param {{ state: string, reason: string, source: string }} resolved
 */
export function emitLedgerFsmObservationFireAndForget(globalEventId, ledgerBundle, convergence, resolved) {
  if (ifetsDisabled()) return;
  scheduleIfetsWork(async () => {
    const entry = await loadUfecIdempotencyEntry(globalEventId);
    const recon = await getUfecReconciliationStatusForGlobalEvent(globalEventId);
    await appendIfetsObservation({
      globalEventId,
      correlationId: computeUfecCorrelationId(globalEventId, entry?.eventAttempt),
      globalOrderKey: deriveGlobalOrderKeyForObservation(entry),
      type: "LEDGER_FSM_TRACE",
      subsystem: UFEC_OBSERVATION_SUBSYSTEM.LEDGER,
      phase: UFEC_OBSERVATION_PHASE.CONVERGENCE_EVAL,
      ledgerSnapshot: compactLedgerSnapshot(ledgerBundle),
      convergenceSnapshot: compactConvergenceSnapshot(convergence),
      fsmSnapshot: compactFsmSnapshot(resolved),
      idempotencySnapshot: compactIdempotencySnapshot(entry),
      deviceSignatureSummary: compactDeviceSignatureSummary(entry),
    });
    if (entry?.deviceEventSignatures?.length > 1) {
      emitDaftaMergeObservationFireAndForget(globalEventId, entry, recon);
    } else {
      await runIfetsAnomalyScanIfNeeded(globalEventId);
    }
  });
}

/**
 * Append one observation (async I/O). Prefer `emitUfecObservationFireAndForget`.
 * @param {object} raw
 */
export async function appendIfetsObservation(raw) {
  const observationId = raw.observationId || crypto.randomUUID();
  const record = {
    streamEntryKind: "OBSERVATION",
    observationId,
    globalEventId: String(raw.globalEventId || "__ufec_system__"),
    correlationId: String(raw.correlationId || ""),
    globalOrderKey: String(raw.globalOrderKey || ""),
    type: String(raw.type || "UNKNOWN"),
    subsystem: String(raw.subsystem || ""),
    phase: String(raw.phase || ""),
    stateBefore: raw.stateBefore ?? null,
    stateAfter: raw.stateAfter ?? null,
    ledgerSnapshot: raw.ledgerSnapshot ?? null,
    fsmSnapshot: raw.fsmSnapshot ?? null,
    idempotencySnapshot: raw.idempotencySnapshot ?? null,
    convergenceSnapshot: raw.convergenceSnapshot ?? null,
    deviceSignatureSummary: raw.deviceSignatureSummary ?? null,
    timestamp: Number(raw.timestamp) || Date.now(),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : undefined,
  };
  await appendUfecAuditObservation(record);
  return record;
}

/**
 * Non-blocking: schedules append + optional anomaly scan.
 * @param {object} raw
 */
export function emitUfecObservationFireAndForget(raw) {
  if (ifetsDisabled()) return;
  scheduleIfetsWork(async () => {
    await appendIfetsObservation(raw);
    const gid = raw.globalEventId;
    if (gid && String(gid) !== "__ufec_system__") await runIfetsAnomalyScanIfNeeded(String(gid));
  });
}

/**
 * @param {object} payload
 */
export async function appendIfetsAnomalyEvent(payload) {
  const observationId = crypto.randomUUID();
  const record = {
    streamEntryKind: "ANOMALY",
    observationId,
    globalEventId: String(payload.globalEventId || ""),
    correlationId: String(payload.correlationId || computeUfecCorrelationId(payload.globalEventId)),
    globalOrderKey: String(payload.globalOrderKey || ""),
    anomalyType: String(payload.anomalyType || "UNKNOWN"),
    severity: String(payload.severity || "MEDIUM"),
    detail: payload.detail ?? null,
    relatedObservationIds: payload.relatedObservationIds ?? [],
    timestamp: Date.now(),
  };
  await appendUfecAuditObservation(record);
}

async function runIfetsAnomalyScanIfNeeded(globalEventId) {
  const timeline = await reconstructFinancialEventTimeline(globalEventId);
  if (timeline.length < 3) return;

  const obs = timeline.filter((r) => r.streamEntryKind !== "ANOMALY");
  const fsmStates = obs.map((r) => r.fsmSnapshot?.state).filter(Boolean);

  if (fsmStates.length >= 3) {
    for (let i = 2; i < fsmStates.length; i += 1) {
      if (fsmStates[i] === fsmStates[i - 2] && fsmStates[i] !== fsmStates[i - 1]) {
        await appendIfetsAnomalyEvent({
          globalEventId,
          correlationId: obs[i]?.correlationId ?? "",
          globalOrderKey: obs[i]?.globalOrderKey ?? "",
          anomalyType: UFEC_ANOMALY_TYPE.STATE_OSCILLATION,
          severity: "HIGH",
          detail: { pattern: [fsmStates[i - 2], fsmStates[i - 1], fsmStates[i]] },
        });
        break;
      }
    }
  }

  const reconCount = obs.filter(
    (r) =>
      r.phase === UFEC_OBSERVATION_PHASE.RECONCILE_ENQUEUE ||
      (r.convergenceSnapshot?.state && r.convergenceSnapshot.state !== "MATCH")
  ).length;
  if (reconCount >= 4) {
    const resolved = obs.some((r) => r.fsmSnapshot?.state === "CONVERGED");
    if (!resolved) {
      await appendIfetsAnomalyEvent({
        globalEventId,
        anomalyType: UFEC_ANOMALY_TYPE.RECONCILIATION_LOOP,
        severity: "CRITICAL",
        detail: { reconObservationHints: reconCount },
      });
    }
  }

  const driftHits = obs.filter((r) => r.convergenceSnapshot?.state === "DRIFT").length;
  if (driftHits >= 3) {
    await appendIfetsAnomalyEvent({
      globalEventId,
      anomalyType: UFEC_ANOMALY_TYPE.LEDGER_DRIFT_RECURRENCE,
      severity: "HIGH",
      detail: { driftObservationCount: driftHits },
    });
  }

  const last = timeline[timeline.length - 1];
  const summary = last?.deviceSignatureSummary;
  if (summary?.count > 1 && (summary.deviceIds?.length || 0) > 1) {
    await appendIfetsAnomalyEvent({
      globalEventId,
      anomalyType: UFEC_ANOMALY_TYPE.IDENTITY_CONFLICT,
      severity: "MEDIUM",
      detail: { deviceIds: summary.deviceIds },
    });
  }
}

/**
 * Chronological timeline for a single globalEventId (CFEOS globalOrderKey, then timestamp).
 * @param {string} globalEventId
 */
export async function reconstructFinancialEventTimeline(globalEventId) {
  const gid = String(globalEventId || "");
  if (!gid) return [];
  const rows = await getUfecAuditStreamByGlobalEventId(gid);
  return [...rows].sort((a, b) => {
    const ga = String(a.globalOrderKey || "");
    const gb = String(b.globalOrderKey || "");
    if (ga !== gb) return ga.localeCompare(gb);
    return Number(a.timestamp || 0) - Number(b.timestamp || 0);
  });
}

/**
 * DAFTA merge / conflict snapshot (passive).
 * @param {string} globalEventId
 * @param {object|null} idempotencyEntry
 * @param {'none'|'queued'|'resolved'|'mixed'} [reconciliationStatus]
 */
/**
 * Phase 4 Step 6 — DEGRADED mode may disable DAFTA merge telemetry writes (read-only).
 */
export function emitSystemHealthObservationFireAndForget(snapshot) {
  if (ifetsDisabled() || !snapshot) return;
  scheduleIfetsWork(async () => {
    await appendIfetsObservation({
      observationId: crypto.randomUUID(),
      globalEventId: "__ufec_system__",
      correlationId: "system",
      globalOrderKey: `health_${snapshot.computedAt || Date.now()}`,
      type: "SYSTEM_HEALTH",
      subsystem: UFEC_OBSERVATION_SUBSYSTEM.SYSTEM,
      phase: "HEALTH_TICK",
      stateAfter: {
        healthScore: snapshot.healthScore,
        operationalMode: snapshot.operationalMode,
        freezeSync: snapshot.freezeSync,
        incidentMode: snapshot.incidentMode,
      },
      meta: { signals: snapshot.signals },
    });
  });
}

export function emitDaftaMergeObservationFireAndForget(globalEventId, idempotencyEntry, reconciliationStatus = "none") {
  if (ifetsDisabled()) return;
  if (getLastOperationalSnapshotForObservers()?.disableDaftaMergeWrites) return;
  const sigs = idempotencyEntry?.deviceEventSignatures;
  if (!Array.isArray(sigs) || sigs.length === 0) return;
  scheduleIfetsWork(async () => {
    const resolved = resolveCanonicalDeviceState(globalEventId, {
      idempotencyEntry,
      reconciliationStatus,
    });
    await appendIfetsObservation({
      globalEventId,
      correlationId: computeUfecCorrelationId(
        globalEventId,
        idempotencyEntry?.eventAttempt
      ),
      globalOrderKey: deriveGlobalOrderKeyForObservation(idempotencyEntry),
      type: "DAFTA_RESOLUTION",
      subsystem: UFEC_OBSERVATION_SUBSYSTEM.DAFTA,
      phase: UFEC_OBSERVATION_PHASE.DAFTA_MERGE,
      stateBefore: null,
      stateAfter: {
        canonicalFSM: resolved.canonicalFSM,
        conflictType: resolved.conflictType,
        resolutionStrategy: resolved.resolutionStrategy,
      },
      deviceSignatureSummary: compactDeviceSignatureSummary(idempotencyEntry),
      meta: { resolutionLog: resolved.resolutionLog?.slice?.(0, 8) },
    });
    await runIfetsAnomalyScanIfNeeded(globalEventId);
  });
}
