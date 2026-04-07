import { openDB } from "idb";
import { SYNC_STATUS } from "../constants/syncStatus.js";

const DB_NAME = "posflyt-offline-db";
const DB_VERSION = 3;

/** Stop retrying after this many failed sync attempts (per queued row). */
export const MAX_SYNC_RETRIES = 5;

const STUCK_SYNC_THRESHOLD_MS = 60_000;

const STORES = {
  products: "products",
  dashboard: "dashboard",
  transactionsQueue: "transactions_queue",
  customersCache: "customers_cache",
  outbox: "outbox",
};

/** @typedef {'POST_PRODUCT'|'PUT_PRODUCT'|'POST_CUSTOMER'} OutboxKind */

let dbPromise;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORES.products)) {
          db.createObjectStore(STORES.products, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.dashboard)) {
          db.createObjectStore(STORES.dashboard, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.transactionsQueue)) {
          db.createObjectStore(STORES.transactionsQueue, { keyPath: "id" });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(STORES.customersCache)) {
            db.createObjectStore(STORES.customersCache, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORES.outbox)) {
            db.createObjectStore(STORES.outbox, { keyPath: "id" });
          }
        }
        // v3: transaction queue rows carry syncStatus / client_transaction_id / syncError (see normalizeQueuedTransaction).
      },
    });
  }
  return dbPromise;
}

/** Map legacy `status` to SYNC_STATUS (single source of truth is syncStatus when present). */
export function resolveSyncStatus(row) {
  if (!row) return SYNC_STATUS.PENDING;
  if (row.syncStatus) return row.syncStatus;
  const s = row.status;
  if (s === "syncing") return SYNC_STATUS.SYNCING;
  if (s === "failed") return SYNC_STATUS.FAILED;
  if (s === "synced") return SYNC_STATUS.SYNCED;
  return SYNC_STATUS.PENDING;
}

function normalizeQueuedTransaction(row) {
  if (!row) return row;
  const syncStatus = row.syncStatus || resolveSyncStatus(row);
  const client_transaction_id =
    row.client_transaction_id || row.payload?.client_transaction_id || row.id;
  return {
    ...row,
    syncStatus,
    client_transaction_id,
    lastSyncAttemptAt: row.lastSyncAttemptAt ?? row.lastAttemptAt ?? null,
    syncError: row.syncError ?? row.lastError ?? null,
  };
}

export async function saveProducts(products) {
  const db = await getDb();
  const tx = db.transaction(STORES.products, "readwrite");
  await tx.store.clear();
  await Promise.all(products.map((product) => tx.store.put(product)));
  await tx.done;
}

export async function getProductsCache() {
  const db = await getDb();
  return db.getAll(STORES.products);
}

/** Merge one product into the local products cache (offline create/edit). */
export async function upsertProductInCache(product) {
  const all = await getProductsCache();
  const next = all.filter((p) => p.id !== product.id).concat(product);
  await saveProducts(next);
}

export async function saveDashboardCache(stats) {
  const db = await getDb();
  return db.put(STORES.dashboard, { id: "latest", ...stats, cachedAt: Date.now() });
}

export async function getDashboardCache() {
  const db = await getDb();
  return db.get(STORES.dashboard, "latest");
}

export async function saveCustomersCache(customers) {
  const db = await getDb();
  const tx = db.transaction(STORES.customersCache, "readwrite");
  await tx.store.clear();
  await Promise.all(customers.map((row) => tx.store.put(row)));
  await tx.done;
}

export async function getCustomersCache() {
  const db = await getDb();
  return db.getAll(STORES.customersCache);
}

export async function upsertCustomerInCache(customer) {
  const all = await getCustomersCache();
  const next = all.filter((c) => c.id !== customer.id).concat(customer);
  await saveCustomersCache(next);
}

export async function enqueueTransaction(transactionPayload) {
  const db = await getDb();
  const id =
    transactionPayload?.client_transaction_id ||
    `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const client_transaction_id = transactionPayload?.client_transaction_id || id;
  const entry = {
    id,
    client_transaction_id,
    payload: transactionPayload,
    createdAt: Date.now(),
    status: "pending",
    syncStatus: SYNC_STATUS.PENDING,
    retryCount: 0,
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: null,
    lastSyncAttemptAt: null,
    syncError: null,
    nextRetryAt: Date.now(),
  };
  await db.put(STORES.transactionsQueue, entry);
  return entry;
}

/**
 * Queue a non-transaction API mutation for replay when online (outbox).
 * @param {object} opts
 * @param {OutboxKind} opts.kind
 * @param {object} opts.body
 * @param {{ productId?: string }} [opts.meta]
 * @param {string} [opts.id] — optional stable UUID for the queue row
 */
export async function enqueueOutbox(opts) {
  const db = await getDb();
  const id = opts.id || crypto.randomUUID();
  const entry = {
    id,
    kind: opts.kind,
    body: opts.body,
    meta: opts.meta || {},
    createdAt: Date.now(),
    status: "pending",
    retryCount: 0,
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: null,
    nextRetryAt: Date.now(),
  };
  await db.put(STORES.outbox, entry);
  return entry;
}

/**
 * Rows left in `syncing` after a tab crash/refresh are marked failed so they can retry.
 */
export async function recoverStuckSyncingTransactions() {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAll(STORES.transactionsQueue);
  for (const row of rows) {
    const s = resolveSyncStatus(row);
    if (s !== SYNC_STATUS.SYNCING) continue;
    const last = Number(row.lastSyncAttemptAt ?? row.lastAttemptAt ?? 0);
    const ageMs = last ? now - last : now - Number(row.createdAt || 0);
    if (ageMs > STUCK_SYNC_THRESHOLD_MS) {
      const normalized = normalizeQueuedTransaction(row);
      await db.put(STORES.transactionsQueue, {
        ...normalized,
        status: "failed",
        syncStatus: SYNC_STATUS.FAILED,
        syncError: "STUCK_SYNC",
        lastError: "STUCK_SYNC",
        lastErrorCode: "STUCK_SYNC",
        lastAttemptAt: now,
        lastSyncAttemptAt: now,
        nextRetryAt: now,
      });
    }
  }
}

/** Outbox rows stuck in `syncing` (crashed mid-request). */
export async function recoverStuckSyncingOutbox() {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAll(STORES.outbox);
  for (const row of rows) {
    if (row.status !== "syncing") continue;
    const last = Number(row.lastAttemptAt ?? 0);
    const ageMs = last ? now - last : now - Number(row.createdAt || 0);
    if (ageMs > STUCK_SYNC_THRESHOLD_MS) {
      await db.put(STORES.outbox, {
        ...row,
        status: "failed",
        lastError: "STUCK_SYNC",
        lastErrorCode: "STUCK_SYNC",
        lastAttemptAt: now,
        nextRetryAt: now,
      });
    }
  }
}

export async function clearAllQueues() {
  const db = await getDb();
  const tx = db.transaction([STORES.transactionsQueue, STORES.outbox], "readwrite");
  await tx.objectStore(STORES.transactionsQueue).clear();
  await tx.objectStore(STORES.outbox).clear();
  await tx.done;
}

export async function getQueuedTransactions() {
  const db = await getDb();
  const rows = await db.getAll(STORES.transactionsQueue);
  const normalized = rows.map(normalizeQueuedTransaction);
  return normalized.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

export async function getFailedQueuedTransactions() {
  const rows = await getQueuedTransactions();
  return rows.filter((r) => resolveSyncStatus(r) === SYNC_STATUS.FAILED);
}

/** Eligible transaction rows for sync (not synced, not syncing; respects nextRetryAt unless caller uses force in hook). */
export async function getPendingQueuedTransactions() {
  const rows = await getQueuedTransactions();
  const now = Date.now();
  return rows.filter((r) => {
    const s = resolveSyncStatus(r);
    if (s === SYNC_STATUS.SYNCED || s === SYNC_STATUS.SYNCING) return false;
    if (s === SYNC_STATUS.FAILED) return Number(r.nextRetryAt || 0) <= now;
    if (s === SYNC_STATUS.PENDING) return Number(r.nextRetryAt || 0) <= now;
    return false;
  });
}

/** Manual retry: make row eligible for the next sync pass. */
export async function bumpTransactionRetryNow(id) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const next = {
    ...normalizeQueuedTransaction(row),
    nextRetryAt: Date.now(),
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}

export async function getQueuedOutbox() {
  const db = await getDb();
  const rows = await db.getAll(STORES.outbox);
  return rows.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

export async function removeQueuedTransaction(id) {
  const db = await getDb();
  return db.delete(STORES.transactionsQueue, id);
}

export async function removeOutbox(id) {
  const db = await getDb();
  return db.delete(STORES.outbox, id);
}

export async function updateQueuedTransactionPayload(id, patch) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const next = {
    ...row,
    payload: {
      ...(row.payload || {}),
      ...(patch || {}),
    },
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}

export async function markQueuedTransactionSyncing(id) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const now = Date.now();
  const next = {
    ...normalizeQueuedTransaction(row),
    status: "syncing",
    syncStatus: SYNC_STATUS.SYNCING,
    lastAttemptAt: now,
    lastSyncAttemptAt: now,
    lastError: null,
    lastErrorCode: null,
    syncError: null,
    nextRetryAt: now,
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}

export async function markQueuedTransactionSynced(id) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const now = Date.now();
  const next = {
    ...normalizeQueuedTransaction(row),
    status: "synced",
    syncStatus: SYNC_STATUS.SYNCED,
    syncError: null,
    lastError: null,
    lastErrorCode: null,
    lastSyncAttemptAt: now,
    lastAttemptAt: now,
    nextRetryAt: now,
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}

/** Keep queued while offline or flaky network: revert to pending (not failed). */
export async function markQueuedTransactionPending(id, message = null) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const next = {
    ...normalizeQueuedTransaction(row),
    status: "pending",
    syncStatus: SYNC_STATUS.PENDING,
    syncError: message || null,
    nextRetryAt: Date.now(),
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}

export async function markQueuedTransactionFailed(id, errorMessage, errorCode = null) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const currentRetry = Number(row.retryCount || 0);
  if (currentRetry >= MAX_SYNC_RETRIES) {
    const now = Date.now();
    const next = {
      ...normalizeQueuedTransaction(row),
      status: "failed",
      syncStatus: SYNC_STATUS.FAILED,
      syncError: "MAX_RETRIES_EXCEEDED",
      retryCount: currentRetry,
      lastAttemptAt: now,
      lastSyncAttemptAt: now,
      lastError: "MAX_RETRIES_EXCEEDED",
      lastErrorCode: "MAX_RETRIES_EXCEEDED",
      nextRetryAt: Number.MAX_SAFE_INTEGER,
    };
    await db.put(STORES.transactionsQueue, next);
    return next;
  }
  const retryCount = currentRetry + 1;
  const delayMs = Math.min(60_000, 2000 * Math.pow(2, retryCount));
  const msg = errorMessage || "Sync failed";
  const now = Date.now();
  const next = {
    ...normalizeQueuedTransaction(row),
    status: "failed",
    syncStatus: SYNC_STATUS.FAILED,
    syncError: msg,
    retryCount,
    lastAttemptAt: now,
    lastSyncAttemptAt: now,
    lastError: msg,
    lastErrorCode: errorCode,
    nextRetryAt: now + delayMs,
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}

export async function markOutboxSyncing(id) {
  const db = await getDb();
  const row = await db.get(STORES.outbox, id);
  if (!row) return null;
  const next = {
    ...row,
    status: "syncing",
    lastAttemptAt: Date.now(),
    lastError: null,
    lastErrorCode: null,
    nextRetryAt: Date.now(),
  };
  await db.put(STORES.outbox, next);
  return next;
}

export async function markOutboxFailed(id, errorMessage, errorCode = null) {
  const db = await getDb();
  const row = await db.get(STORES.outbox, id);
  if (!row) return null;
  const currentRetry = Number(row.retryCount || 0);
  if (currentRetry >= MAX_SYNC_RETRIES) {
    const now = Date.now();
    const next = {
      ...row,
      status: "failed",
      retryCount: currentRetry,
      lastAttemptAt: now,
      lastError: "MAX_RETRIES_EXCEEDED",
      lastErrorCode: "MAX_RETRIES_EXCEEDED",
      nextRetryAt: Number.MAX_SAFE_INTEGER,
    };
    await db.put(STORES.outbox, next);
    return next;
  }
  const retryCount = currentRetry + 1;
  const delayMs = Math.min(60_000, 2000 * Math.pow(2, retryCount));
  const now = Date.now();
  const next = {
    ...row,
    status: "failed",
    retryCount,
    lastAttemptAt: now,
    lastError: errorMessage || "Sync failed",
    lastErrorCode: errorCode,
    nextRetryAt: now + delayMs,
  };
  await db.put(STORES.outbox, next);
  return next;
}
