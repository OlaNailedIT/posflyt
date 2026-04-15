/**
 * Phase 4 Step 1 — Lockless concurrency: execution lease, optimistic versioning, write-priority matrix.
 * Commits use IndexedDB single-store transactions (see ufecIdempotencyCommit in db.js).
 */

import { ufecIdempotencyCommit } from "../services/db.js";

/** @typedef {'RECONCILIATION_ENGINE'|'LEDGER_CONVERGENCE'|'FSM_RESOLVER'|'EXECUTION'|'SYNC_REPLAY'} UfecWriteSource */

export const UFEC_WRITE_SOURCE = {
  RECONCILIATION_ENGINE: "RECONCILIATION_ENGINE",
  LEDGER_CONVERGENCE: "LEDGER_CONVERGENCE",
  FSM_RESOLVER: "FSM_RESOLVER",
  EXECUTION: "EXECUTION",
  SYNC_REPLAY: "SYNC_REPLAY",
};

/** Higher number wins on conflict (overwrite). */
export const UFEC_WRITE_PRIORITY = {
  [UFEC_WRITE_SOURCE.RECONCILIATION_ENGINE]: 100,
  [UFEC_WRITE_SOURCE.LEDGER_CONVERGENCE]: 80,
  [UFEC_WRITE_SOURCE.FSM_RESOLVER]: 60,
  [UFEC_WRITE_SOURCE.EXECUTION]: 40,
  [UFEC_WRITE_SOURCE.SYNC_REPLAY]: 20,
};

export const LEASE_TTL_MS = 90_000;

const LEASE_OWNER_KEY = "ufec_execution_lease_owner";

/**
 * Stable per-tab owner for cross-tab lease discrimination.
 * @returns {string}
 */
export function getUfecLeaseOwnerId() {
  if (typeof sessionStorage === "undefined") {
    return `ephemeral_${crypto.randomUUID()}`;
  }
  try {
    let id = sessionStorage.getItem(LEASE_OWNER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(LEASE_OWNER_KEY, id);
    }
    return id;
  } catch {
    return `fallback_${crypto.randomUUID()}`;
  }
}

/**
 * @param {object} row
 * @param {string} globalEventId
 * @returns {string}
 */
export function computeEventSequenceKey(globalEventId, row) {
  const v = Number(row?.eventVersion ?? 0);
  const a = Number(row?.eventAttempt ?? 0);
  return `${globalEventId}#v${v}#a${a}`;
}

/**
 * @param {object} [lease]
 * @param {string} ownerId
 */
export function isExecutionLeaseHeldByOther(lease, ownerId) {
  if (!lease || lease.leaseExpiry == null) return false;
  if (Date.now() >= Number(lease.leaseExpiry)) return false;
  return String(lease.ownerId) !== String(ownerId);
}

/**
 * @param {{
 *   globalEventId: string,
 *   patch: object | ((prev: object) => object),
 *   writeSource: UfecWriteSource,
 *   expectedVersion?: number|null,
 *   leaseOwnerId?: string|null,
 *   skipLeaseCheck?: boolean,
 * }} opts
 * @returns {Promise<{ ok: true, entry: object, newVersion: number } | { ok: false, code: string, currentVersion?: number }>}
 */
export async function commitIdempotencyAtomic(opts) {
  const {
    globalEventId,
    patch,
    writeSource,
    expectedVersion,
    leaseOwnerId,
    skipLeaseCheck = false,
  } = opts;

  const incomingP = UFEC_WRITE_PRIORITY[writeSource] ?? 0;
  const owner = leaseOwnerId ?? getUfecLeaseOwnerId();
  const gid = String(globalEventId);

  const result = await ufecIdempotencyCommit(gid, (row, v) => {
    if (expectedVersion !== undefined && expectedVersion !== null && v !== expectedVersion) {
      return { abort: true, code: "VERSION_MISMATCH", currentVersion: v };
    }
    const base = row;
    const storedP = Number(base.lastWriteSourcePriority ?? 0);
    if (writeSource !== UFEC_WRITE_SOURCE.RECONCILIATION_ENGINE && incomingP < storedP) {
      return { abort: true, code: "PRIORITY_REJECT" };
    }
    if (writeSource === UFEC_WRITE_SOURCE.SYNC_REPLAY && base.reconciliationLocked === true) {
      return { abort: true, code: "RECONCILIATION_LOCKED" };
    }
    const skLease = skipLeaseCheck || writeSource === UFEC_WRITE_SOURCE.RECONCILIATION_ENGINE;
    if (!skLease && isExecutionLeaseHeldByOther(base.executionLease, owner)) {
      return { abort: true, code: "LEASE_HELD" };
    }
    const merged =
      typeof patch === "function"
        ? patch(base)
        : {
            ...base,
            ...patch,
          };
    const next = {
      ...merged,
      global_event_id: gid,
      eventVersion: v + 1,
      lastWriteSource: writeSource,
      lastWriteSourcePriority: Math.max(incomingP, storedP),
    };
    return { entry: next };
  });

  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    entry: result.entry,
    newVersion: Number(result.entry.eventVersion ?? 0),
  };
}
