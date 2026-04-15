/**
 * Phase 3 Step 1 — Global Idempotency Boundary (GIB).
 * global_event_id === clientEventId; execution state in memory + IndexedDB.
 */

import { getUfecIdempotencyRecord } from "../services/db.js";
import {
  commitIdempotencyAtomic,
  computeEventSequenceKey,
  getUfecLeaseOwnerId,
  isExecutionLeaseHeldByOther,
  LEASE_TTL_MS,
  UFEC_WRITE_SOURCE,
} from "./ufecConcurrency.js";
import { mergeDeviceSignatureList } from "./ufecDafta.js";
import { MAX_UFEC_RETRIES } from "./ufecRetryPolicy.js";

export const IDEMPOTENCY_STATUS = {
  INITIATED: "INITIATED",
  IN_FLIGHT: "IN_FLIGHT",
  COMPLETED: "COMPLETED",
  FAILED_RETRYABLE: "FAILED_RETRYABLE",
  FAILED_FINAL: "FAILED_FINAL",
  RECONCILE_REQUIRED: "RECONCILE_REQUIRED",
};

const inflightPromises = new Map();
const memoryByGid = new Map();

export const IN_FLIGHT_STALE_MS = 120_000;
/** @deprecated use MAX_UFEC_RETRIES from ufecRetryPolicy */
export const MAX_UFEC_FAILURE_RETRIES = MAX_UFEC_RETRIES;

function shouldLogIdempotency() {
  if (import.meta.env.VITE_UFEC_IDEMPOTENCY_DEBUG === "1") return true;
  if (import.meta.env.VITE_UFEC_IDEMPOTENCY_DEBUG === "0") return false;
  return import.meta.env.DEV;
}

/**
 * @param {object} event
 * @returns {string}
 */
export function getGlobalEventId(event) {
  const g = event?.global_event_id ?? event?.clientEventId;
  if (g == null || String(g).trim() === "") {
    throw new Error("FinancialEvent requires global_event_id / clientEventId");
  }
  return String(g);
}

function fingerprintResult(result) {
  try {
    const s = JSON.stringify(result);
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return String(h);
  } catch {
    return `t:${Date.now()}`;
  }
}

/** Exposed for DAFTA signatures / diagnostics (same hash as stored `executionFingerprint`). */
export function ufecFingerprintExecutionResult(result) {
  return fingerprintResult(result);
}

export async function loadUfecIdempotencyEntry(globalEventId) {
  return loadEntry(globalEventId);
}

/**
 * @param {object} entry
 * @param {{ writeSource?: import("./ufecConcurrency.js").UfecWriteSource, expectedVersion?: number|null, skipLeaseCheck?: boolean }} [options]
 */
export async function persistUfecIdempotencyEntry(entry, options = {}) {
  const gid = entry.global_event_id;
  const writeSource = options.writeSource ?? UFEC_WRITE_SOURCE.EXECUTION;
  const skipLeaseCheck = options.skipLeaseCheck !== false;
  return commitWithMemoryCache({
    globalEventId: gid,
    patch: (prev) => ({ ...prev, ...entry, global_event_id: gid }),
    writeSource,
    expectedVersion: options.expectedVersion,
    skipLeaseCheck,
  });
}

async function loadEntry(globalEventId) {
  const mem = memoryByGid.get(globalEventId);
  if (mem) return mem;
  try {
    const row = await getUfecIdempotencyRecord(globalEventId);
    if (row) {
      memoryByGid.set(globalEventId, row);
      return row;
    }
  } catch {
    /* no IDB */
  }
  return null;
}

function isStaleInFlight(entry) {
  if (!entry || entry.status !== IDEMPOTENCY_STATUS.IN_FLIGHT) return false;
  const t = Number(entry.lastExecutionTimestamp || 0);
  return Date.now() - t > IN_FLIGHT_STALE_MS;
}

export class UfecIdempotencyError extends Error {
  /**
   * @param {string} message
   * @param {{ code: string, globalEventId?: string, retryAfterMs?: number }} meta
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "UfecIdempotencyError";
    this.code = meta.code || "IDEMPOTENCY";
    this.globalEventId = meta.globalEventId;
    this.retryAfterMs = meta.retryAfterMs;
    this.isUfecIdempotency = true;
  }
}

/**
 * @param {string} globalEventId
 * @param {Parameters<typeof commitIdempotencyAtomic>[0]} opts
 */
async function commitWithMemoryCache(opts) {
  const gid = String(opts.globalEventId);
  memoryByGid.delete(gid);
  const r = await commitIdempotencyAtomic(opts);
  if (r.ok) {
    memoryByGid.set(gid, r.entry);
  }
  return r;
}

/**
 * @param {string} globalEventId
 * @returns {Promise<unknown|null>}
 */
export async function getCompletedCachedResult(globalEventId) {
  const e = await loadEntry(globalEventId);
  if (e?.status === IDEMPOTENCY_STATUS.COMPLETED && e.cachedResult !== undefined) {
    if (shouldLogIdempotency()) {
      console.info("[UFEC_IDEMPOTENCY]", {
        SKIP_REASON: "IDEMPOTENCY_MATCH",
        global_event_id: globalEventId,
        detail: "COMPLETED",
      });
    }
    return e.cachedResult;
  }
  return null;
}

/**
 * Cross-tab / crash recovery gates (before preflight).
 * @param {string} globalEventId
 * @param {{ bypassBackoff?: boolean }} [options]
 */
export async function gatesBeforeExecution(globalEventId, options = {}) {
  memoryByGid.delete(globalEventId);
  let entry = await getUfecIdempotencyRecord(globalEventId);
  if (entry) memoryByGid.set(globalEventId, entry);

  const ownerId = getUfecLeaseOwnerId();
  if (entry && isExecutionLeaseHeldByOther(entry.executionLease, ownerId)) {
    throw new UfecIdempotencyError("Active execution lease held by another session", {
      code: "LEASE_HELD",
      globalEventId,
    });
  }

  if (
    entry?.status === IDEMPOTENCY_STATUS.FAILED_RETRYABLE &&
    entry.nextRetryAtMs &&
    Date.now() < entry.nextRetryAtMs
  ) {
    if (!options.bypassBackoff) {
      throw new UfecIdempotencyError("Retry backoff active", {
        code: "BACKOFF",
        globalEventId,
        retryAfterMs: entry.nextRetryAtMs - Date.now(),
      });
    }
  }

  if (entry?.status === IDEMPOTENCY_STATUS.RECONCILE_REQUIRED) {
    throw new UfecIdempotencyError("Event requires reconciliation (prior RECONCILE_REQUIRED state)", {
      code: "RECONCILE_REQUIRED",
      globalEventId,
    });
  }

  if (entry?.status === IDEMPOTENCY_STATUS.FAILED_FINAL) {
    throw new UfecIdempotencyError("Event previously failed with no retry path", {
      code: "FAILED_FINAL",
      globalEventId,
    });
  }

  if (Number(entry?.retryCount || 0) >= MAX_UFEC_RETRIES) {
    const r = await commitWithMemoryCache({
      globalEventId,
      writeSource: UFEC_WRITE_SOURCE.FSM_RESOLVER,
      skipLeaseCheck: true,
      patch: (prev) => ({
        ...prev,
        global_event_id: globalEventId,
        status: IDEMPOTENCY_STATUS.RECONCILE_REQUIRED,
        lastExecutionTimestamp: Date.now(),
      }),
    });
    if (!r.ok && import.meta.env.DEV) {
      console.warn("[UFEC_IDEMPOTENCY] retry exhausted CAS failed", r.code);
    }
    throw new UfecIdempotencyError("Retry limit exceeded for this financial event", {
      code: "RETRY_EXHAUSTED",
      globalEventId,
    });
  }

  if (entry?.status === IDEMPOTENCY_STATUS.IN_FLIGHT && !isStaleInFlight(entry)) {
    throw new UfecIdempotencyError("Event execution already in flight (another tab or process)", {
      code: "IN_FLIGHT",
      globalEventId,
    });
  }

  if (entry?.status === IDEMPOTENCY_STATUS.IN_FLIGHT && isStaleInFlight(entry)) {
    if (shouldLogIdempotency()) {
      console.info("[UFEC_IDEMPOTENCY]", { global_event_id: globalEventId, detail: "STALE_IN_FLIGHT_RELEASE" });
    }
  }
}

/**
 * @param {string} globalEventId
 * @param {string} eventType
 */
export async function markExecutionInFlight(globalEventId, eventType) {
  const ownerId = getUfecLeaseOwnerId();
  const r = await commitWithMemoryCache({
    globalEventId,
    writeSource: UFEC_WRITE_SOURCE.EXECUTION,
    leaseOwnerId: ownerId,
    patch: (prev) => {
      const nextAttempt = Number(prev?.eventAttempt ?? 0) + 1;
      const now = Date.now();
      return {
        ...prev,
        global_event_id: globalEventId,
        eventType,
        status: IDEMPOTENCY_STATUS.IN_FLIGHT,
        lastExecutionTimestamp: now,
        eventAttempt: nextAttempt,
        eventSequenceKey: computeEventSequenceKey(globalEventId, {
          eventVersion: Number(prev?.eventVersion ?? 0),
          eventAttempt: nextAttempt,
        }),
        retryCount: prev?.retryCount ?? 0,
        executionFingerprint: prev?.executionFingerprint ?? null,
        cachedResult: undefined,
        nextRetryAtMs: undefined,
        executionLease: {
          ownerId,
          leaseTimestamp: now,
          leaseExpiry: now + LEASE_TTL_MS,
        },
      };
    },
  });
  if (!r.ok) {
    if (r.code === "LEASE_HELD") {
      throw new UfecIdempotencyError("Execution lease held by another session or tab", {
        code: "LEASE_HELD",
        globalEventId,
      });
    }
    if (r.code === "VERSION_MISMATCH") {
      throw new UfecIdempotencyError("Concurrent idempotency update — retry later", {
        code: "CONCURRENT_UPDATE",
        globalEventId,
      });
    }
    if (r.code === "PRIORITY_REJECT") {
      throw new UfecIdempotencyError("Write rejected by priority matrix", {
        code: "PRIORITY_REJECT",
        globalEventId,
      });
    }
    throw new UfecIdempotencyError(`Idempotency commit failed: ${r.code}`, {
      code: r.code || "COMMIT_FAILED",
      globalEventId,
    });
  }
}

/**
 * @param {string} globalEventId
 * @param {unknown} result
 * @param {{ deviceSignature?: object }} [options]
 */
export async function completeUfecExecution(globalEventId, result, options = {}) {
  const extraSig = options.deviceSignature;
  const r = await commitWithMemoryCache({
    globalEventId,
    writeSource: UFEC_WRITE_SOURCE.LEDGER_CONVERGENCE,
    skipLeaseCheck: true,
    patch: (prev) => {
      const base = {
        ...prev,
        global_event_id: globalEventId,
        eventType: prev?.eventType,
        status: IDEMPOTENCY_STATUS.COMPLETED,
        lastExecutionTimestamp: Date.now(),
        retryCount: 0,
        executionFingerprint: fingerprintResult(result),
        cachedResult: result,
        nextRetryAtMs: undefined,
        lastFailureSignature: undefined,
        consecutiveSameSignature: undefined,
        failureClass: undefined,
        failureReason: undefined,
        ledgerConvergence: undefined,
        reconciliationQueuedAt: undefined,
        executionLease: undefined,
      };
      if (extraSig) {
        base.deviceEventSignatures = mergeDeviceSignatureList(prev?.deviceEventSignatures, extraSig);
      }
      return base;
    },
  });
  if (!r.ok) {
    if (import.meta.env.DEV) {
      console.warn("[UFEC_IDEMPOTENCY] completeUfecExecution CAS failed (non-throwing)", r.code, globalEventId);
    }
  }
}

/**
 * Phase 3 Step 3 — Ledger did not converge to UFEC intent; do not cache success for sync replay.
 * @param {string} globalEventId
 * @param {{ eventType?: string, ledgerConvergence?: object, writeSource?: import("./ufecConcurrency.js").UfecWriteSource, deviceSignature?: object }} [meta]
 */
export async function markLedgerReconcileRequired(globalEventId, meta = {}) {
  const ws = meta.writeSource ?? UFEC_WRITE_SOURCE.LEDGER_CONVERGENCE;
  const extraSig = meta.deviceSignature;
  const r = await commitWithMemoryCache({
    globalEventId,
    writeSource: ws,
    skipLeaseCheck: true,
    patch: (prev) => {
      const base = {
        ...prev,
        global_event_id: globalEventId,
        eventType: meta.eventType ?? prev?.eventType,
        status: IDEMPOTENCY_STATUS.RECONCILE_REQUIRED,
        lastExecutionTimestamp: Date.now(),
        retryCount: prev?.retryCount ?? 0,
        executionFingerprint: prev?.executionFingerprint ?? null,
        cachedResult: undefined,
        nextRetryAtMs: undefined,
        ledgerConvergence: meta.ledgerConvergence ?? null,
        reconciliationQueuedAt: Date.now(),
        executionLease: undefined,
      };
      if (extraSig) {
        base.deviceEventSignatures = mergeDeviceSignatureList(prev?.deviceEventSignatures, extraSig);
      }
      return base;
    },
  });
  if (!r.ok && import.meta.env.DEV) {
    console.warn("[UFEC_IDEMPOTENCY] markLedgerReconcileRequired failed", r.code, globalEventId);
  }
}

/**
 * @param {string} globalEventId
 * @returns {Promise<{ action: 'proceed'|'use_cached'|'defer_in_flight'|'defer_backoff'|'blocked_reconcile', cachedResult?: unknown, detail?: string, until?: number }>}
 */
export async function getSyncReplayIdempotencyDecision(globalEventId) {
  const gid = String(globalEventId || "");
  if (!gid) return { action: "proceed" };

  const entry = await loadEntry(gid);
  if (!entry) return { action: "proceed" };

  if (
    entry.status === IDEMPOTENCY_STATUS.FAILED_RETRYABLE &&
    entry.nextRetryAtMs &&
    Date.now() < entry.nextRetryAtMs
  ) {
    if (shouldLogIdempotency()) {
      console.info("[UFEC_IDEMPOTENCY]", {
        SKIP_REASON: "IDEMPOTENCY_MATCH",
        global_event_id: gid,
        detail: "BACKOFF",
        until: entry.nextRetryAtMs,
      });
    }
    return { action: "defer_backoff", until: entry.nextRetryAtMs, detail: "BACKOFF" };
  }

  if (
    entry.status === IDEMPOTENCY_STATUS.RECONCILE_REQUIRED ||
    entry.status === IDEMPOTENCY_STATUS.FAILED_FINAL
  ) {
    return { action: "blocked_reconcile", detail: entry.status };
  }

  if (entry.status === IDEMPOTENCY_STATUS.COMPLETED && entry.cachedResult !== undefined) {
    if (shouldLogIdempotency()) {
      console.info("[UFEC_IDEMPOTENCY]", {
        SKIP_REASON: "IDEMPOTENCY_MATCH",
        global_event_id: gid,
        detail: "COMPLETED",
      });
    }
    return { action: "use_cached", cachedResult: entry.cachedResult };
  }

  if (entry.status === IDEMPOTENCY_STATUS.IN_FLIGHT && !isStaleInFlight(entry)) {
    if (shouldLogIdempotency()) {
      console.info("[UFEC_IDEMPOTENCY]", {
        SKIP_REASON: "IDEMPOTENCY_MATCH",
        global_event_id: gid,
        detail: "IN_FLIGHT",
      });
    }
    return { action: "defer_in_flight", detail: "IN_FLIGHT" };
  }

  if (entry.retryCount >= MAX_UFEC_RETRIES) {
    return { action: "blocked_reconcile", detail: "RETRY_EXHAUSTED" };
  }

  return { action: "proceed" };
}

/**
 * @param {string} globalEventId
 * @param {() => Promise<unknown>} fn
 */
export function coalesceInflightExecution(globalEventId, fn) {
  const existing = inflightPromises.get(globalEventId);
  if (existing) {
    if (shouldLogIdempotency()) {
      console.info("[UFEC_IDEMPOTENCY_HIT]", { global_event_id: globalEventId, reason: "IN_FLIGHT_COALESCE" });
    }
    return existing;
  }
  const p = (async () => {
    try {
      return await fn();
    } finally {
      inflightPromises.delete(globalEventId);
    }
  })();
  inflightPromises.set(globalEventId, p);
  return p;
}

export function clearInflightPromiseForTests(globalEventId) {
  inflightPromises.delete(globalEventId);
}
