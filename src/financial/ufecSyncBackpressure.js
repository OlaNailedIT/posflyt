/**
 * Phase 4 Step 3 — High-volume sync backpressure: adaptive pacing, batch sizing,
 * throttle windows, retry budget, and pressure feedback (no “sync storm” collapse).
 */

/** @typedef {'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'} UfecSyncPressure */
/** @typedef {'NORMAL'|'DEGRADED'|'SAFE_MODE'|'FREEZE_MODE'} UfecSyncMode */

export const UFEC_SYNC_PRESSURE = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

export const UFEC_SYNC_MODE = {
  NORMAL: "NORMAL",
  DEGRADED: "DEGRADED",
  SAFE_MODE: "SAFE_MODE",
  FREEZE_MODE: "FREEZE_MODE",
};

/** Max processing attempts per queue row within a single sync run (then RECONCILE_REQUIRED). */
export const UFEC_SESSION_MAX_ATTEMPTS_PER_ROW = 3;

/** Hard cap on row attempts scheduled in one run (global ceiling). */
export const UFEC_SESSION_GLOBAL_ATTEMPT_CEILING = 4000;

const FREEZE_LS_KEY = "posflyt_ufec_sync_freeze";

const failureBurstWindowMs = 45_000;
/** @type {number[]} */
let failureTimestamps = [];

/** @type {number[]} */
let recentBatchDurationsMs = [];

const MAX_DURATION_SAMPLES = 8;

/** @type {Map<string, number>} */
let sessionAttemptsByRowId = new Map();

function rollFailureBursts() {
  const cutoff = Date.now() - failureBurstWindowMs;
  failureTimestamps = failureTimestamps.filter((t) => t >= cutoff);
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

export function isUfecSyncFreezeModeEnabled() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(FREEZE_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function resetUfecSyncBackpressureForTests() {
  failureTimestamps = [];
  recentBatchDurationsMs = [];
  sessionAttemptsByRowId = new Map();
}

export function resetSessionRetryBudget() {
  sessionAttemptsByRowId = new Map();
}

/**
 * @param {string} rowId
 * @returns {boolean} false → caller must mark RECONCILE_REQUIRED and not execute
 */
export function tryConsumeSessionAttemptBudget(rowId) {
  const id = String(rowId || "");
  if (!id) return true;
  const total = [...sessionAttemptsByRowId.values()].reduce((a, b) => a + b, 0);
  if (total >= UFEC_SESSION_GLOBAL_ATTEMPT_CEILING) return false;
  const n = (sessionAttemptsByRowId.get(id) || 0) + 1;
  sessionAttemptsByRowId.set(id, n);
  return n <= UFEC_SESSION_MAX_ATTEMPTS_PER_ROW;
}

/**
 * @param {{ queueDepth: number, reconBacklog: number, failedQueueItems: number, lastBatchDurationMs?: number, idempotencyPressure?: boolean }} s
 * @returns {{ pressure: UfecSyncPressure, mode: UfecSyncMode, score: number }}
 */
export function evaluateSyncPressure(s) {
  if (isUfecSyncFreezeModeEnabled()) {
    return { pressure: UFEC_SYNC_PRESSURE.CRITICAL, mode: UFEC_SYNC_MODE.FREEZE_MODE, score: 999 };
  }

  let score = 0;
  const q = Number(s.queueDepth) || 0;
  if (q > 3000) score += 4;
  else if (q > 1000) score += 3;
  else if (q > 500) score += 2;
  else if (q > 100) score += 1;

  const recon = Number(s.reconBacklog) || 0;
  if (recon > 25) score += 3;
  else if (recon > 10) score += 2;
  else if (recon > 3) score += 1;

  const failed = Number(s.failedQueueItems) || 0;
  if (failed > 40) score += 3;
  else if (failed > 15) score += 2;
  else if (failed > 5) score += 1;

  rollFailureBursts();
  const burst = failureTimestamps.length;
  if (burst >= 8) score += 3;
  else if (burst >= 4) score += 2;
  else if (burst >= 2) score += 1;

  const d = Number(s.lastBatchDurationMs);
  if (d > 8000) score += 2;
  else if (d > 4000) score += 1;

  if (s.idempotencyPressure) score += 1;

  /** @type {UfecSyncPressure} */
  let pressure = UFEC_SYNC_PRESSURE.LOW;
  if (score >= 9) pressure = UFEC_SYNC_PRESSURE.CRITICAL;
  else if (score >= 6) pressure = UFEC_SYNC_PRESSURE.HIGH;
  else if (score >= 3) pressure = UFEC_SYNC_PRESSURE.MEDIUM;

  /** @type {UfecSyncMode} */
  let mode = UFEC_SYNC_MODE.NORMAL;
  if (pressure === UFEC_SYNC_PRESSURE.CRITICAL) mode = UFEC_SYNC_MODE.SAFE_MODE;
  else if (pressure === UFEC_SYNC_PRESSURE.HIGH) mode = UFEC_SYNC_MODE.DEGRADED;
  else if (pressure === UFEC_SYNC_PRESSURE.MEDIUM) mode = UFEC_SYNC_MODE.DEGRADED;

  return { pressure, mode, score };
}

/**
 * @param {UfecSyncPressure} pressure
 */
export function getAdaptiveConcurrency(pressure) {
  switch (pressure) {
    case UFEC_SYNC_PRESSURE.LOW:
      return 3;
    case UFEC_SYNC_PRESSURE.MEDIUM:
      return 2;
    case UFEC_SYNC_PRESSURE.HIGH:
    case UFEC_SYNC_PRESSURE.CRITICAL:
      return 1;
    default:
      return 2;
  }
}

/**
 * @param {UfecSyncPressure} pressure
 */
export function getDynamicBatchSize(pressure) {
  switch (pressure) {
    case UFEC_SYNC_PRESSURE.LOW:
      return randInt(25, 50);
    case UFEC_SYNC_PRESSURE.MEDIUM:
      return randInt(15, 25);
    case UFEC_SYNC_PRESSURE.HIGH:
      return randInt(5, 10);
    case UFEC_SYNC_PRESSURE.CRITICAL:
      return randInt(1, 5);
    default:
      return 20;
  }
}

/**
 * Base inter-batch throttle (before legacy retry throttle merge).
 * @param {UfecSyncPressure} pressure
 */
export function getThrottleDelayMs(pressure) {
  switch (pressure) {
    case UFEC_SYNC_PRESSURE.LOW:
      return Math.floor(randFloat(0, 50));
    case UFEC_SYNC_PRESSURE.MEDIUM:
      return Math.floor(randFloat(100, 250));
    case UFEC_SYNC_PRESSURE.HIGH:
      return Math.floor(randFloat(300, 800));
    case UFEC_SYNC_PRESSURE.CRITICAL:
      return Math.floor(randFloat(1000, 2000));
    default:
      return 80;
  }
}

/**
 * Records a failed item / hard failure for burst detection (retry storm protection).
 */
export function recordSyncFailureBurst() {
  rollFailureBursts();
  failureTimestamps.push(Date.now());
}

/**
 * @param {{ durationMs: number, batchFailed: number }} p
 */
export function recordBatchOutcome(p) {
  const d = Math.max(0, Number(p.durationMs) || 0);
  recentBatchDurationsMs.push(d);
  if (recentBatchDurationsMs.length > MAX_DURATION_SAMPLES) {
    recentBatchDurationsMs = recentBatchDurationsMs.slice(-MAX_DURATION_SAMPLES);
  }
}

/**
 * Synthetic pause after repeated batch failures (IndexedDB / CPU cooldown).
 * @param {number} batchFailedCount
 */
export function getSyntheticPauseMs(batchFailedCount) {
  rollFailureBursts();
  if (failureTimestamps.length >= 6) return randInt(3000, 6000);
  if (batchFailedCount >= 3) return randInt(1500, 3500);
  if (batchFailedCount >= 2) return randInt(800, 1800);
  return 0;
}

export function getAverageRecentBatchDurationMs() {
  if (!recentBatchDurationsMs.length) return 0;
  const sum = recentBatchDurationsMs.reduce((a, b) => a + b, 0);
  return sum / recentBatchDurationsMs.length;
}
