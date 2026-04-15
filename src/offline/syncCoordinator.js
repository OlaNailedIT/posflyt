/**
 * **Authoritative concurrency gate** for all sync triggers (30s interval, `online`, burst UI, safety follow-up):
 * only one `runSync` executes at a time (`syncRunning`). Overlapping calls set `syncQueued` — never parallel runs.
 * The nested safety pass (`allowSafetyRecurse === false`) uses the same gate: if another trigger fires mid-run,
 * it only sets `syncQueued`; it cannot start a second concurrent execution. Interval overlap is harmless.
 *
 * `useOfflineSync` adds defensive layers: `navigator.locks` when available, and `isSyncRunning` when not.
 * Those prevent overlapping work inside the runner; this module prevents overlapping **invocations**.
 *
 * @type {null | ((force?: boolean) => Promise<void>)}
 */
let offlineSyncRunner = null;

/** Coalesces overlapping triggers (interval + online + UI) into one runSync at a time, with at most one follow-up. */
let syncRunning = false;
let syncQueued = false;

export function registerOfflineSyncRunner(fn) {
  offlineSyncRunner = typeof fn === "function" ? fn : null;
}

/**
 * @param {boolean} [force]
 * @param {boolean} [allowSafetyRecurse] — if true, may schedule one extra pass when eligible queue rows remain (avoids rare starvation when coalescing never queued a follow-up).
 */
export async function requestOfflineSync(force = false, allowSafetyRecurse = true) {
  if (typeof offlineSyncRunner !== "function") return;

  if (syncRunning) {
    syncQueued = true;
    return;
  }

  syncRunning = true;
  try {
    let nextForce = force;
    do {
      syncQueued = false;
      await offlineSyncRunner(nextForce);
      nextForce = false;
    } while (syncQueued);
  } finally {
    syncRunning = false;
  }

  if (!allowSafetyRecurse) return;

  const { getPendingQueuedTransactions } = await import("../services/db.js");
  const left = await getPendingQueuedTransactions();
  if (left.length > 0) {
    await requestOfflineSync(false, false);
  }
}
