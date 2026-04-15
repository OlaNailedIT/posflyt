/**
 * Phase 4 Step 6 — Operational resilience: unified health score (0–100) and operational modes.
 * “Execution is unreliable. State is reconstructible. Recovery is deterministic.”
 */

import {
  evaluateSyncPressure,
  getAverageRecentBatchDurationMs,
  isUfecSyncFreezeModeEnabled,
  UFEC_SYNC_PRESSURE,
} from "./ufecSyncBackpressure.js";
import { computeLocalSystemHealth } from "../system/systemHealthAdapter.js";

export const UFEC_OPERATIONAL_MODE = {
  NORMAL: "NORMAL",
  DEGRADED: "DEGRADED",
  SAFE: "SAFE",
  FREEZE: "FREEZE",
};

/** @type {{ score: number, mode: string, computedAt: number, signals: object|null } | null} */
let cachedSnapshot = null;
const SNAPSHOT_TTL_MS = 15_000;

/**
 * @param {object} s — raw signals (see gatherOperationalSignals)
 * @returns {number} 0–100
 */
export function computeUfecSystemHealthScore(s) {
  let score = 100;
  const q = Number(s.queueDepth) || 0;
  const recon = Number(s.reconBacklog) || 0;
  const failed = Number(s.failedQueueItems) || 0;
  const avgBatch = Number(s.avgBatchDurationMs) || 0;
  const pressure = s.pressureEvaluation;

  if (q > 4000) score -= 28;
  else if (q > 2000) score -= 18;
  else if (q > 800) score -= 12;
  else if (q > 200) score -= 6;

  if (recon > 40) score -= 22;
  else if (recon > 15) score -= 14;
  else if (recon > 5) score -= 8;

  if (failed > 60) score -= 18;
  else if (failed > 25) score -= 12;
  else if (failed > 8) score -= 6;

  if (avgBatch > 12_000) score -= 12;
  else if (avgBatch > 6000) score -= 6;

  if (pressure) {
    if (pressure.pressure === UFEC_SYNC_PRESSURE.CRITICAL) score -= 20;
    else if (pressure.pressure === UFEC_SYNC_PRESSURE.HIGH) score -= 12;
    else if (pressure.pressure === UFEC_SYNC_PRESSURE.MEDIUM) score -= 6;
  }

  const idemCollisions = Number(s.idempotencyMultiSignatureCount) || 0;
  if (idemCollisions > 10) score -= 10;
  else if (idemCollisions > 3) score -= 5;

  const reconcileStuck = Number(s.reconcileRequiredStuckCount) || 0;
  if (reconcileStuck > 8) score -= 12;
  else if (reconcileStuck > 3) score -= 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * @param {number} score
 */
export function mapHealthScoreToOperationalMode(score) {
  if (score >= 80) return UFEC_OPERATIONAL_MODE.NORMAL;
  if (score >= 60) return UFEC_OPERATIONAL_MODE.DEGRADED;
  if (score >= 30) return UFEC_OPERATIONAL_MODE.SAFE;
  return UFEC_OPERATIONAL_MODE.FREEZE;
}

/**
 * DEGRADED: read-only DAFTA merge telemetry writes (spec).
 */
export function shouldDisableDaftaMergeWrites(mode) {
  return mode === UFEC_OPERATIONAL_MODE.DEGRADED;
}

/**
 * Incident: SAFE/ FREEZE from health — prioritize observation; optional recon processing lock for future workers.
 */
export function isIncidentOperationalMode(mode) {
  return mode === UFEC_OPERATIONAL_MODE.SAFE || mode === UFEC_OPERATIONAL_MODE.FREEZE;
}

/**
 * Sync must not drain queues (same as manual freeze).
 */
export function shouldFreezeSyncExecution(operationalMode) {
  if (isUfecSyncFreezeModeEnabled()) return true;
  return operationalMode === UFEC_OPERATIONAL_MODE.FREEZE;
}

/**
 * Factors applied on top of backpressure batch/concurrency.
 * @param {string} operationalMode
 */
export function getOperationalModeSyncFactors(operationalMode) {
  switch (operationalMode) {
    case UFEC_OPERATIONAL_MODE.NORMAL:
      return { batchSizeFactor: 1, concurrencyFactor: 1 };
    case UFEC_OPERATIONAL_MODE.DEGRADED:
      return { batchSizeFactor: 0.75, concurrencyFactor: 0.66 };
    case UFEC_OPERATIONAL_MODE.SAFE:
      return { batchSizeFactor: 0.45, concurrencyFactor: 0.5 };
    case UFEC_OPERATIONAL_MODE.FREEZE:
      return { batchSizeFactor: 0, concurrencyFactor: 0 };
    default:
      return { batchSizeFactor: 1, concurrencyFactor: 1 };
  }
}

/**
 * @param {{
 *   queueDepth: number,
 *   reconBacklog: number,
 *   failedQueueItems: number,
 *   lastBatchDurationMs?: number,
 *   idempotencyPressure?: boolean,
 *   idempotencyEntriesSample?: object[],
 *   idbStatus?: string,
 *   idbNote?: string,
 * }} input
 */
export function gatherOperationalSignals(input) {
  const {
    queueDepth,
    reconBacklog,
    failedQueueItems,
    lastBatchDurationMs = 0,
    idempotencyPressure = false,
    idempotencyEntriesSample = [],
    idbStatus,
    idbNote,
  } = input;

  const pressureEvaluation = evaluateSyncPressure({
    queueDepth,
    reconBacklog,
    failedQueueItems,
    lastBatchDurationMs,
    idempotencyPressure,
  });

  let multiSig = 0;
  let reconcileStuck = 0;
  for (const e of idempotencyEntriesSample) {
    if (Array.isArray(e?.deviceEventSignatures) && e.deviceEventSignatures.length > 1) multiSig += 1;
    if (e?.status === "RECONCILE_REQUIRED" && e?.reconciliationQueuedAt) {
      const age = Date.now() - Number(e.reconciliationQueuedAt);
      if (age > 20 * 60 * 1000) reconcileStuck += 1;
    }
  }

  return {
    queueDepth,
    reconBacklog,
    failedQueueItems,
    avgBatchDurationMs: getAverageRecentBatchDurationMs() || lastBatchDurationMs,
    pressureEvaluation,
    idempotencyMultiSignatureCount: multiSig,
    reconcileRequiredStuckCount: reconcileStuck,
    ...(idbStatus ? { idbStatus } : {}),
    ...(idbNote ? { idbNote } : {}),
  };
}

/**
 * Safe snapshot when IndexedDB reads fail — keeps UI + sync loop from crashing.
 * @param {unknown} errorLike
 */
export async function buildOfflineStorageDegradedSnapshot(errorLike) {
  const idbNote = "Offline storage unavailable, continuing without it";
  return getOperationalResilienceSnapshot({
    force: true,
    includeIdempotencySample: false,
    idempotencyEntriesSample: [],
    queueDepth: 0,
    reconBacklog: 0,
    failedQueueItems: 0,
    lastBatchDurationMs: 0,
    idempotencyPressure: false,
    idbStatus: "DEGRADED",
    idbNote,
    idbError: String(errorLike?.message || errorLike || "unknown"),
  });
}

/**
 * Cached snapshot for sync loop + IFETS (avoids heavy IDB per batch).
 * @param {object} partial — queue/recon/failed + optional `includeIdempotencySample`, `idempotencyEntriesSample`, `force`
 */
export async function getOperationalResilienceSnapshot(partial = {}) {
  const now = Date.now();
  if (cachedSnapshot && now - cachedSnapshot.computedAt < SNAPSHOT_TTL_MS && partial.force !== true) {
    return buildSnapshotFromCache(cachedSnapshot);
  }

  let sample = partial.idempotencyEntriesSample;
  if (partial.includeIdempotencySample && !sample) {
    try {
      const { getAllUfecIdempotencyRecords } = await import("../services/db.js");
      const all = await getAllUfecIdempotencyRecords();
      sample = all.slice(0, 400);
    } catch {
      sample = [];
    }
  }

  const localHealth = computeLocalSystemHealth();
  const signals = {
    ...gatherOperationalSignals({
      queueDepth: partial.queueDepth ?? 0,
      reconBacklog: partial.reconBacklog ?? 0,
      failedQueueItems: partial.failedQueueItems ?? 0,
      lastBatchDurationMs: partial.lastBatchDurationMs,
      idempotencyPressure: partial.idempotencyPressure,
      idempotencyEntriesSample: sample || [],
      idbStatus: partial.idbStatus,
      idbNote: partial.idbNote,
    }),
    schemaDriftCount: localHealth.driftCount,
    localSystemHealthStatus: localHealth.status,
  };
  let score = computeUfecSystemHealthScore(signals);
  score = Math.min(score, localHealth.score);
  let mode = mapHealthScoreToOperationalMode(score);
  if (partial.idbStatus === "DEGRADED") {
    mode = UFEC_OPERATIONAL_MODE.SAFE;
    score = Math.min(score, 25);
  }
  if (isUfecSyncFreezeModeEnabled()) mode = UFEC_OPERATIONAL_MODE.FREEZE;

  cachedSnapshot = {
    score,
    mode,
    computedAt: now,
    signals,
  };
  return buildSnapshotFromCache(cachedSnapshot);
}

function buildSnapshotFromCache(c) {
  const mode = c.mode;
  const factors = getOperationalModeSyncFactors(mode);
  const freezeSync = shouldFreezeSyncExecution(mode);
  const snap = {
    healthScore: c.score,
    operationalMode: mode,
    freezeSync,
    batchSizeFactor: factors.batchSizeFactor,
    concurrencyFactor: factors.concurrencyFactor,
    disableDaftaMergeWrites: shouldDisableDaftaMergeWrites(mode),
    incidentMode: isIncidentOperationalMode(mode),
    signals: c.signals,
    computedAt: c.computedAt,
  };
  publishOperationalSnapshotForObservers(snap);
  return snap;
}

/** Synchronous read for passive observers (IFETS / DAFTA) — updated whenever snapshot recomputes. */
let lastPublishedSnapshot = null;

export function publishOperationalSnapshotForObservers(snap) {
  lastPublishedSnapshot = snap ? { ...snap, publishedAt: Date.now() } : null;
}

export function getLastOperationalSnapshotForObservers() {
  return lastPublishedSnapshot;
}

/** For tests / cold start full recompute. */
export function invalidateOperationalResilienceCache() {
  cachedSnapshot = null;
}
