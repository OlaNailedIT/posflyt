/**
 * Phase 2 queue API — **facade** over `services/db.js` `transactions_queue`.
 *
 * **Financial truth:** persisted rows live only in `posflyt-offline-db` / `transactions_queue` (idb).
 * Prefer `enqueueTx` from this module at app call sites; avoid importing `enqueueTransaction` from `services/db`.
 */
import { SYNC_STATUS } from "../constants/syncStatus";
import {
  enqueueTransactionInternal,
  getPendingQueuedTransactions,
  markQueuedTransactionSynced,
  patchQueuedTransactionRow,
  resolveSyncStatus,
} from "../services/db";

/**
 * @typedef {{
 *   id: string,
 *   eventId?: string,
 *   payload: Record<string, unknown>,
 *   payloadHash?: string,
 *   status?: string,
 *   retryCount?: number,
 *   createdAt?: number,
 *   lastAttemptAt?: number,
 * }} QueueItemShape
 */

/**
 * @param {QueueItemShape & { payload: Record<string, unknown> }} item
 */
export async function enqueueTx(item) {
  const id = item.id || item.payload?.client_transaction_id;
  if (!id || typeof id !== "string") {
    throw new Error("enqueueTx: stable id (client_transaction_id) required");
  }
  const payload = {
    ...item.payload,
    client_transaction_id: id,
  };
  if (item.payloadHash && !payload.payload_hash) {
    payload.payload_hash = item.payloadHash;
  }
  if (item.eventId && !payload.event_id) {
    payload.event_id = item.eventId;
  }
  return enqueueTransactionInternal(payload);
}

/** Re-export for callers that already hold a full payload (no `enqueueTx` wrapper). */
export { enqueueTransactionInternal as enqueueTransactionPayload };

/**
 * FIFO: `getPendingQueuedTransactions` uses `getQueuedTransactions` ordering (creation time).
 * @param {number} [limit]
 * @returns {Promise<QueueItemShape[]>}
 */
export async function getNextBatch(limit = 10) {
  const rows = await getPendingQueuedTransactions();
  return rows.slice(0, Math.max(1, limit)).map(mapRowToQueueItem);
}

/** @param {object} row */
function mapRowToQueueItem(row) {
  const s = resolveSyncStatus(row);
  let status = "queued";
  if (s === SYNC_STATUS.SYNCING) status = "syncing";
  if (s === SYNC_STATUS.FAILED) status = "queued";
  return {
    id: row.id,
    eventId: row.payload?.event_id,
    payload: row.payload || {},
    payloadHash: row.payload?.payload_hash,
    status,
    retryCount: row.retryCount ?? 0,
    createdAt: row.createdAt,
    lastAttemptAt: row.lastAttemptAt ?? row.lastSyncAttemptAt,
  };
}

/**
 * Shallow merge into the persisted queue row (payload merges deeply).
 * Prefer UFEC helpers from `services/db.js` for status transitions in production code.
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function updateTx(id, patch) {
  return patchQueuedTransactionRow(id, patch);
}

/** Marks server-applied / duplicate — same semantics as successful sync replay. */
export async function markSynced(id) {
  return markQueuedTransactionSynced(id);
}
