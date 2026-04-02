import { openDB } from "idb";

const DB_NAME = "posflyt-offline-db";
const DB_VERSION = 1;

const STORES = {
  products: "products",
  dashboard: "dashboard",
  transactionsQueue: "transactions_queue",
};

let dbPromise;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.products)) {
          db.createObjectStore(STORES.products, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.dashboard)) {
          db.createObjectStore(STORES.dashboard, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.transactionsQueue)) {
          db.createObjectStore(STORES.transactionsQueue, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
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

export async function saveDashboardCache(stats) {
  const db = await getDb();
  return db.put(STORES.dashboard, { id: "latest", ...stats, cachedAt: Date.now() });
}

export async function getDashboardCache() {
  const db = await getDb();
  return db.get(STORES.dashboard, "latest");
}

export async function enqueueTransaction(transactionPayload) {
  const db = await getDb();
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    payload: transactionPayload,
    createdAt: Date.now(),
    status: "pending",
    retryCount: 0,
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: null,
    nextRetryAt: Date.now(),
  };
  await db.put(STORES.transactionsQueue, entry);
  return entry;
}

export async function getQueuedTransactions() {
  const db = await getDb();
  const rows = await db.getAll(STORES.transactionsQueue);
  return rows.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

export async function removeQueuedTransaction(id) {
  const db = await getDb();
  return db.delete(STORES.transactionsQueue, id);
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
  const next = {
    ...row,
    status: "syncing",
    lastAttemptAt: Date.now(),
    lastError: null,
    lastErrorCode: null,
    nextRetryAt: Date.now(),
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}

export async function markQueuedTransactionFailed(id, errorMessage, errorCode = null) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const retryCount = Number(row.retryCount || 0) + 1;
  const jitter = Math.floor(Math.random() * 1500);
  const delayMs = Math.min(60_000, 2000 * Math.pow(2, Math.min(retryCount - 1, 5))) + jitter;
  const next = {
    ...row,
    status: "failed",
    retryCount,
    lastAttemptAt: Date.now(),
    lastError: errorMessage || "Sync failed",
    lastErrorCode: errorCode,
    nextRetryAt: Date.now() + delayMs,
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}
