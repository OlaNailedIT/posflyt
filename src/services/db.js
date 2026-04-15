import { openDB } from "idb";
import { emitOfflineTelemetry } from "../utils/offlineTelemetry.js";
import { logSchemaDrift } from "../utils/schemaDriftLog.js";
import { nowISOString } from "../utils/safeDate.js";

function isIndexedDbMissingStoreError(e) {
  return e?.name === "NotFoundError" || e?.name === "InvalidStateError";
}

/**
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} fn
 * @param {T} empty
 */
async function safeIndexedDbRead(label, fn, empty) {
  try {
    return await fn();
  } catch (e) {
    if (isIndexedDbMissingStoreError(e)) {
      logSchemaDrift({
        layer: "indexeddb",
        kind: "read_fallback",
        label,
        error: e?.name,
      });
      return empty;
    }
    throw e;
  }
}
import { SYNC_STATUS } from "../constants/syncStatus.js";
import {
  buildCanonicalOrderFields,
  flattenUfecOrderFieldsToRow,
  UFEC_PRIORITY_WEIGHT,
} from "../financial/ufecCanonicalOrder.js";
import { FINANCIAL_EVENT_TYPE } from "../financial/ufecSyncShadow.js";

function outboxUfecEventType(kind) {
  if (kind === "POST_RETURN") return FINANCIAL_EVENT_TYPE.RETURN_EVENT;
  if (kind === "SETTLE_PAYMENT" || kind === "SETTLE_CUSTOMER_CREDIT") {
    return FINANCIAL_EVENT_TYPE.ADJUSTMENT_EVENT;
  }
  return FINANCIAL_EVENT_TYPE.OTHER_SYNC;
}

/** Legacy outbox rows: fill UFEC-aligned fields without migrating the store. */
function normalizeOutboxRow(row) {
  if (!row) return row;
  const ts = row.timestamp ?? row.createdAt ?? Date.now();
  const eventType = row.eventType ?? row.ufecEventType ?? outboxUfecEventType(row.kind);
  const clientEventId =
    row.clientEventId ??
    (row.kind === "POST_RETURN"
      ? row.body?.client_return_id || row.body?.client_transaction_id || row.id
      : row.id);
  return {
    ...row,
    timestamp: ts,
    eventType,
    ufecEventType: row.ufecEventType ?? eventType,
    clientEventId,
  };
}

export const OFFLINE_DB_NAME = "posflyt-offline-db";
/** Bump when adding stores or when a repair pass must run for all clients (see `ensureOfflineObjectStores`). */
export const OFFLINE_DB_VERSION = 17;

const DB_NAME = OFFLINE_DB_NAME;
const DB_VERSION = OFFLINE_DB_VERSION;

/** Stop retrying after this many failed sync attempts (per queued row). */
export const MAX_SYNC_RETRIES = 5;

const STUCK_SYNC_THRESHOLD_MS = 60_000;

const STORES = {
  products: "products",
  dashboard: "dashboard",
  transactionsQueue: "transactions_queue",
  customersCache: "customers_cache",
  outbox: "outbox",
  inventoryCountSession: "inventory_count_session",
  /** Phase 3: UFEC idempotency registry (global_event_id keyed) */
  ufecIdempotency: "ufec_idempotency",
  /** Phase 3 Step 3: financial repair queue (not sync retry / not execution queue) */
  ufecReconciliationQueue: "ufec_reconciliation_queue",
  /** Phase 4 Step 5: IFETS append-only observability stream */
  ufecAuditStream: "ufec_audit_stream",
  /** Phase 3 (Vessa): client integrity shadow — append-only events + ledger projection; server remains canonical */
  integrityEvents: "integrity_events",
  integrityLedgerEntries: "integrity_ledger_entries",
  /** Encrypted staff PIN bundle (device key); key = normalized phone digits */
  offlineStaffAuth: "offline_staff_auth",
  /** Short-lived unlock session metadata (no PIN stored) */
  offlineSession: "offline_session",
};

/** @typedef {'POST_PRODUCT'|'PUT_PRODUCT'|'POST_CUSTOMER'|'SETTLE_PAYMENT'|'SETTLE_CUSTOMER_CREDIT'|'CREATE_EXPENSE'|'INVENTORY_COUNT_FINALIZE'|'POST_RETURN'} OutboxKind */

let dbPromise;

/**
 * Creates any missing object stores (repairs DBs where the version advanced without a full schema).
 * Safe to call on every upgrade; skips stores that already exist.
 */
function ensureOfflineObjectStores(db) {
  if (!db.objectStoreNames.contains(STORES.products)) {
    db.createObjectStore(STORES.products, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.dashboard)) {
    db.createObjectStore(STORES.dashboard, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.transactionsQueue)) {
    db.createObjectStore(STORES.transactionsQueue, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.customersCache)) {
    db.createObjectStore(STORES.customersCache, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.outbox)) {
    db.createObjectStore(STORES.outbox, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.inventoryCountSession)) {
    db.createObjectStore(STORES.inventoryCountSession, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.ufecIdempotency)) {
    db.createObjectStore(STORES.ufecIdempotency, { keyPath: "global_event_id" });
  }
  if (!db.objectStoreNames.contains(STORES.ufecReconciliationQueue)) {
    db.createObjectStore(STORES.ufecReconciliationQueue, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORES.ufecAuditStream)) {
    const st = db.createObjectStore(STORES.ufecAuditStream, { keyPath: "observationId" });
    st.createIndex("byGlobalEventId", "globalEventId", { unique: false });
    st.createIndex("byGlobalOrderKey", "globalOrderKey", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.integrityEvents)) {
    const st = db.createObjectStore(STORES.integrityEvents, { keyPath: "eventId" });
    st.createIndex("byTransactionId", "transactionId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.integrityLedgerEntries)) {
    const st = db.createObjectStore(STORES.integrityLedgerEntries, { keyPath: "ledgerId" });
    st.createIndex("byTransactionId", "transactionId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.offlineStaffAuth)) {
    db.createObjectStore(STORES.offlineStaffAuth, { keyPath: "phone" });
  }
  if (!db.objectStoreNames.contains(STORES.offlineSession)) {
    db.createObjectStore(STORES.offlineSession, { keyPath: "id" });
  }
}

/** Opens IndexedDB at {@link OFFLINE_DB_VERSION} (runs upgrade + `ensureOfflineObjectStores` as needed). */
export async function openOfflineDatabase() {
  return getDb();
}

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
        // v4: outbox kind SETTLE_PAYMENT for credit settlement replay.
        // v5: outbox kind CREATE_EXPENSE for offline expense capture (Phase 7.10.2).
        // v6: transaction queue payloads may include `payments` split tender (Phase 7.10.4); same object store.
        // v7: cached products may include unitType / pricePerUnit (Phase 7.11.1 weighted products).
        // v8: settings cache may include quickSalesProductIds (Phase 7.11.2).
        // v9: draft inventory count session (Phase 7.11.4).
        if (oldVersion < 9) {
          if (!db.objectStoreNames.contains(STORES.inventoryCountSession)) {
            db.createObjectStore(STORES.inventoryCountSession, { keyPath: "id" });
          }
        }
        // v10: Phase 3 UFEC idempotency registry (GIB).
        if (oldVersion < 10) {
          if (!db.objectStoreNames.contains(STORES.ufecIdempotency)) {
            db.createObjectStore(STORES.ufecIdempotency, { keyPath: "global_event_id" });
          }
        }
        // v11: Phase 3 Step 3 ledger reconciliation queue.
        if (oldVersion < 11) {
          if (!db.objectStoreNames.contains(STORES.ufecReconciliationQueue)) {
            db.createObjectStore(STORES.ufecReconciliationQueue, { keyPath: "id" });
          }
        }
        // v12: Phase 4 Step 5 IFETS (immutable observation stream; append-only).
        if (oldVersion < 12) {
          if (!db.objectStoreNames.contains(STORES.ufecAuditStream)) {
            const st = db.createObjectStore(STORES.ufecAuditStream, { keyPath: "observationId" });
            st.createIndex("byGlobalEventId", "globalEventId", { unique: false });
            st.createIndex("byGlobalOrderKey", "globalOrderKey", { unique: false });
          }
        }
        // v13: Phase 3 ledger integrity shadow (client audit / deterministic rebuild).
        if (oldVersion < 13) {
          if (!db.objectStoreNames.contains(STORES.integrityEvents)) {
            const st = db.createObjectStore(STORES.integrityEvents, { keyPath: "eventId" });
            st.createIndex("byTransactionId", "transactionId", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.integrityLedgerEntries)) {
            const st = db.createObjectStore(STORES.integrityLedgerEntries, { keyPath: "ledgerId" });
            st.createIndex("byTransactionId", "transactionId", { unique: false });
          }
        }
        // v14: repair missing stores when DB version advanced without matching object stores (interrupted upgrades, dev reloads).
        if (oldVersion < 14) {
          ensureOfflineObjectStores(db);
        }
        // v16: bump so v15 clients re-enter upgrade; `ensureOfflineObjectStores` below repairs missing UFEC stores (e.g. reconciliation queue).
        // v17: offline staff auth bundle + session (PIN verify without network).
        if (oldVersion < 17) {
          if (!db.objectStoreNames.contains(STORES.offlineStaffAuth)) {
            db.createObjectStore(STORES.offlineStaffAuth, { keyPath: "phone" });
          }
          if (!db.objectStoreNames.contains(STORES.offlineSession)) {
            db.createObjectStore(STORES.offlineSession, { keyPath: "id" });
          }
        }
        // Always reconcile object stores at end of upgrade (repairs interrupted migrations).
        ensureOfflineObjectStores(db);
      },
    });
  }
  return dbPromise;
}

/**
 * Append-only IFETS row. Never update/delete via API — keeps audit integrity.
 * @param {object} record — must include observationId (UUID)
 */
export async function appendUfecAuditObservation(record) {
  const db = await getDb();
  await db.add(STORES.ufecAuditStream, record);
}

/**
 * @param {string} globalEventId
 * @returns {Promise<object[]>}
 */
export async function getUfecAuditStreamByGlobalEventId(globalEventId) {
  const db = await getDb();
  return db.getAllFromIndex(STORES.ufecAuditStream, "byGlobalEventId", globalEventId);
}

/**
 * @param {string} globalEventId
 * @returns {Promise<object|undefined>}
 */
export async function getUfecIdempotencyRecord(globalEventId) {
  const db = await getDb();
  return db.get(STORES.ufecIdempotency, globalEventId);
}

/** Full scan — use sparingly (recovery / health sampling only). */
export async function getAllUfecIdempotencyRecords() {
  return safeIndexedDbRead("ufec_idempotency_getAll", async () => {
    const db = await getDb();
    return db.getAll(STORES.ufecIdempotency);
  }, []);
}

/**
 * @param {object} entry — { global_event_id, status, ... }
 */
export async function putUfecIdempotencyRecord(entry) {
  const db = await getDb();
  await db.put(STORES.ufecIdempotency, entry);
}

/**
 * Phase 4 — Single read-modify-write in one IndexedDB transaction (CAS for eventVersion).
 * @param {string} globalEventId
 * @param {(row: object, version: number) => { entry: object } | { abort: true, code: string, currentVersion?: number }} builder
 * @returns {Promise<{ ok: true, entry: object } | { ok: false, code: string, currentVersion?: number }>}
 */
export async function ufecIdempotencyCommit(globalEventId, builder) {
  const db = await getDb();
  const tx = db.transaction(STORES.ufecIdempotency, "readwrite");
  const store = tx.objectStore(STORES.ufecIdempotency);
  const current = await store.get(globalEventId);
  const row = current ? { ...current } : { global_event_id: globalEventId };
  const v = Number(row.eventVersion ?? 0);
  const out = builder(row, v);
  if (out && out.abort) {
    await tx.done;
    return { ok: false, code: out.code, currentVersion: out.currentVersion };
  }
  if (!out || !out.entry) {
    await tx.done;
    return { ok: false, code: "INVALID_BUILDER" };
  }
  await store.put(out.entry);
  await tx.done;
  return { ok: true, entry: out.entry };
}

/**
 * @param {object} row — { id?: string, globalEventId: string, status?: string, ... }
 */
export async function enqueueUfecReconciliationQueueRow(row) {
  const db = await getDb();
  const id = row.id || crypto.randomUUID();
  const rec = {
    ...row,
    id,
    createdAt: row.createdAt ?? Date.now(),
    status: row.status ?? "pending",
  };
  await db.put(STORES.ufecReconciliationQueue, rec);
  return rec;
}

/**
 * @returns {Promise<object[]>}
 */
export async function getUfecReconciliationQueuePending() {
  return safeIndexedDbRead("ufec_reconciliation_queue_pending", async () => {
    const db = await getDb();
    const all = await db.getAll(STORES.ufecReconciliationQueue);
    return all
      .filter((r) => r.status === "pending")
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }, []);
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateUfecReconciliationQueueRow(id, patch) {
  const db = await getDb();
  const prev = await db.get(STORES.ufecReconciliationQueue, id);
  if (!prev) return null;
  const next = { ...prev, ...patch, id };
  await db.put(STORES.ufecReconciliationQueue, next);
  return next;
}

/**
 * @param {string} globalEventId
 * @returns {Promise<'none'|'queued'|'resolved'|'mixed'>}
 */
export async function getUfecReconciliationStatusForGlobalEvent(globalEventId) {
  const db = await getDb();
  const all = await db.getAll(STORES.ufecReconciliationQueue);
  const rows = all.filter((r) => r.globalEventId === globalEventId);
  if (rows.length === 0) return "none";
  const pending = rows.filter((r) => r.status === "pending");
  const resolved = rows.filter((r) => r.status === "resolved");
  if (pending.length > 0 && resolved.length > 0) return "mixed";
  if (pending.length > 0) return "queued";
  if (resolved.length === rows.length) return "resolved";
  return "mixed";
}

/**
 * Marks all pending reconciliation rows for this event resolved (repair applied).
 * @param {string} globalEventId
 * @returns {Promise<number>} count updated
 */
export async function markUfecReconciliationResolvedForGlobalEvent(globalEventId) {
  const db = await getDb();
  const all = await db.getAll(STORES.ufecReconciliationQueue);
  const rows = all.filter((r) => r.globalEventId === globalEventId && r.status === "pending");
  const now = Date.now();
  let n = 0;
  for (const r of rows) {
    await db.put(STORES.ufecReconciliationQueue, {
      ...r,
      status: "resolved",
      resolvedAt: now,
    });
    n += 1;
  }
  return n;
}


const INVENTORY_COUNT_DRAFT_ID = "draft";

/**
 * Persist in-progress barcode count session (offline-safe).
 * @param {{ sessionId: string, sessionStatus: string, lines: unknown[], savedAt?: number }} state
 */
export async function saveInventoryCountDraft(state) {
  const db = await getDb();
  await db.put(STORES.inventoryCountSession, {
    id: INVENTORY_COUNT_DRAFT_ID,
    ...state,
    savedAt: Date.now(),
  });
}

export async function getInventoryCountDraft() {
  const db = await getDb();
  return db.get(STORES.inventoryCountSession, INVENTORY_COUNT_DRAFT_ID);
}

export async function clearInventoryCountDraft() {
  const db = await getDb();
  try {
    await db.delete(STORES.inventoryCountSession, INVENTORY_COUNT_DRAFT_ID);
  } catch {
    /* ignore */
  }
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
  const timestamp = row.timestamp ?? row.createdAt ?? Date.now();
  const eventType =
    row.eventType ?? row.ufecEventType ?? FINANCIAL_EVENT_TYPE.SALE_EVENT;
  return {
    ...row,
    syncStatus,
    client_transaction_id,
    timestamp,
    eventType,
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

/**
 * Canonical persist for sale queue rows (`transactions_queue`). Prefer `enqueueTx` from `src/offline/queueStore.js` at call sites.
 * @param {object} transactionPayload
 */
export async function enqueueTransactionInternal(transactionPayload) {
  const db = await getDb();
  const ts = Date.now();
  const id =
    transactionPayload?.client_transaction_id ||
    `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const client_transaction_id = transactionPayload?.client_transaction_id || id;
  const payload = {
    ...transactionPayload,
    event_id: transactionPayload?.event_id || crypto.randomUUID(),
  };
  const orderMeta = buildCanonicalOrderFields({
    priorityWeight: UFEC_PRIORITY_WEIGHT.SALE_EVENT,
    eventCreationEpoch: ts,
    sequenceKey: client_transaction_id,
  });
  const entry = {
    id,
    client_transaction_id,
    /** UFEC shadow: canonical id matches client_transaction_id (no duplicate idempotency key). */
    clientEventId: client_transaction_id,
    eventType: FINANCIAL_EVENT_TYPE.SALE_EVENT,
    ufecEventType: FINANCIAL_EVENT_TYPE.SALE_EVENT,
    type: "CREATE_TRANSACTION",
    payload,
    timestamp: ts,
    createdAt: ts,
    status: "pending",
    syncStatus: SYNC_STATUS.PENDING,
    retryCount: 0,
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: null,
    lastSyncAttemptAt: null,
    syncError: null,
    nextRetryAt: ts,
    ...flattenUfecOrderFieldsToRow(orderMeta),
  };
  await db.put(STORES.transactionsQueue, entry);
  return entry;
}

/** Sampled telemetry: first N always, then every Mth occurrence (reduces log volume if legacy path is hot). */
let deprecatedEnqueueOccurrence = 0;
const DEPRECATED_ENQUEUE_EMIT_FIRST = 5;
const DEPRECATED_ENQUEUE_EMIT_EVERY = 25;

function maybeEmitDeprecatedEnqueueTelemetry(transactionPayload) {
  deprecatedEnqueueOccurrence += 1;
  const n = deprecatedEnqueueOccurrence;
  if (n > DEPRECATED_ENQUEUE_EMIT_FIRST && n % DEPRECATED_ENQUEUE_EMIT_EVERY !== 0) return;
  emitOfflineTelemetry("DEPRECATED_ENQUEUE_TRANSACTION_USED", {
    hasClientId: Boolean(transactionPayload?.client_transaction_id),
    occurrenceIndex: n,
  });
}

/**
 * @deprecated Prefer `enqueueTx` from `src/offline/queueStore.js` (Phase 2 facade). Retained for legacy callers/tests.
 * @param {object} transactionPayload
 */
export async function enqueueTransaction(transactionPayload) {
  maybeEmitDeprecatedEnqueueTelemetry(transactionPayload);
  if (import.meta.env.DEV) {
    const g = /** @type {Record<string, unknown>} */ (globalThis);
    if (!g.__posflytEnqueueTransactionDeprecatedWarned) {
      g.__posflytEnqueueTransactionDeprecatedWarned = true;
      console.warn(
        "[posflyt] Prefer enqueueTx from src/offline/queueStore.js for new code; enqueueTransaction remains for legacy use."
      );
    }
  }
  return enqueueTransactionInternal(transactionPayload);
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
  const ts = Date.now();
  const kind = opts.kind;
  const eventType = outboxUfecEventType(kind);
  const clientEventId =
    kind === "POST_RETURN"
      ? opts.body?.client_return_id || opts.body?.client_transaction_id || id
      : id;
  const pw =
    kind === "POST_RETURN"
      ? UFEC_PRIORITY_WEIGHT.RETURN_EVENT
      : kind === "SETTLE_PAYMENT" || kind === "SETTLE_CUSTOMER_CREDIT"
        ? UFEC_PRIORITY_WEIGHT.ADJUSTMENT_EVENT
        : UFEC_PRIORITY_WEIGHT.OTHER_SYNC;
  const orderMeta = buildCanonicalOrderFields({
    priorityWeight: pw,
    eventCreationEpoch: ts,
    sequenceKey: clientEventId,
  });
  const entry = {
    id,
    kind,
    body: opts.body,
    meta: opts.meta || {},
    clientEventId,
    eventType,
    ufecEventType: eventType,
    timestamp: ts,
    createdAt: ts,
    status: "pending",
    retryCount: 0,
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: null,
    nextRetryAt: ts,
    ...flattenUfecOrderFieldsToRow(orderMeta),
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
  return safeIndexedDbRead("transactions_queue_getAll", async () => {
    const db = await getDb();
    const rows = await db.getAll(STORES.transactionsQueue);
    const normalized = rows.map(normalizeQueuedTransaction);
    return normalized.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }, []);
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
  return safeIndexedDbRead("outbox_getAll", async () => {
    const db = await getDb();
    const rows = await db.getAll(STORES.outbox);
    return rows
      .map(normalizeOutboxRow)
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }, []);
}

/**
 * Merge fields into a queued transaction row (payload merges deeply). Internal / facade use.
 * @param {string} id
 * @param {Record<string, unknown>} partial
 */
export async function patchQueuedTransactionRow(id, partial) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const base = normalizeQueuedTransaction(row);
  const p = partial && typeof partial === "object" ? partial : {};
  const { payload: payloadPatch, ...rest } = /** @type {Record<string, unknown>} */ (p);
  const next = { ...base, ...rest };
  if (payloadPatch && typeof payloadPatch === "object") {
    next.payload = {
      ...(base.payload || {}),
      .../** @type {Record<string, unknown>} */ (payloadPatch),
    };
  }
  await db.put(STORES.transactionsQueue, next);
  return normalizeQueuedTransaction(next);
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

/**
 * Keep queued while offline or flaky network: revert to pending (not failed).
 * @param {string} id
 * @param {string|null} [message]
 * @param {number|null} [nextRetryAtMs] — align with UFEC backoff (`until`); omit for immediate eligibility.
 */
export async function markQueuedTransactionPending(id, message = null, nextRetryAtMs = null) {
  const db = await getDb();
  const row = await db.get(STORES.transactionsQueue, id);
  if (!row) return null;
  const nr =
    typeof nextRetryAtMs === "number" && Number.isFinite(nextRetryAtMs)
      ? Math.max(nextRetryAtMs, Date.now())
      : Date.now();
  const next = {
    ...normalizeQueuedTransaction(row),
    status: "pending",
    syncStatus: SYNC_STATUS.PENDING,
    syncError: message || null,
    nextRetryAt: nr,
  };
  await db.put(STORES.transactionsQueue, next);
  return next;
}

/**
 * Defer outbox replay until `nextRetryAtMs` without incrementing sync retryCount (UFEC backoff alignment).
 * @param {string} id
 * @param {number} nextRetryAtMs
 */
export async function setOutboxNextRetryAt(id, nextRetryAtMs) {
  const db = await getDb();
  const row = await db.get(STORES.outbox, id);
  if (!row) return null;
  const until = Number(nextRetryAtMs);
  const next = {
    ...normalizeOutboxRow(row),
    status: row.status === "syncing" ? "pending" : row.status,
    nextRetryAt: Number.isFinite(until) ? Math.max(until, Date.now()) : Date.now(),
  };
  await db.put(STORES.outbox, next);
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

/**
 * Full export of all offline object stores (Phase 7.13.3 cloud backup).
 * @returns {Promise<{ dbName: string, dbVersion: number, exportedAt: string, stores: Record<string, unknown[]> }>}
 */
export async function exportIndexedDBFullSnapshot() {
  const db = await getDb();
  const stores = {};
  for (const name of Object.values(STORES)) {
    if (!db.objectStoreNames.contains(name)) {
      stores[name] = [];
      continue;
    }
    stores[name] = await db.getAll(name);
  }
  return {
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    exportedAt: nowISOString(),
    stores,
  };
}

/**
 * Replace all offline stores with a snapshot from `exportIndexedDBFullSnapshot`.
 * Overwrites existing local data; caller should confirm with the user first.
 */
export async function importIndexedDBFullSnapshot(snapshot) {
  if (!snapshot?.stores || typeof snapshot.stores !== "object" || Array.isArray(snapshot.stores)) {
    throw new Error("INVALID_SNAPSHOT");
  }
  const db = await getDb();
  const names = Object.values(STORES);
  const tx = db.transaction(names, "readwrite");
  for (const storeName of names) {
    const rows = Array.isArray(snapshot.stores[storeName]) ? snapshot.stores[storeName] : [];
    const store = tx.objectStore(storeName);
    await store.clear();
    for (const row of rows) {
      await store.put(row);
    }
  }
  await tx.done;
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

/** @param {object} row — client integrity event (see `src/ledger/`) */
export async function integrityEventPut(row) {
  const db = await getDb();
  await db.put(STORES.integrityEvents, row);
}

export async function integrityEventGet(eventId) {
  const db = await getDb();
  return db.get(STORES.integrityEvents, eventId);
}

export async function integrityEventsByTransactionId(transactionId) {
  const db = await getDb();
  return db.getAllFromIndex(STORES.integrityEvents, "byTransactionId", transactionId);
}

/** @param {object} row — client ledger projection (see `src/ledger/`) */
export async function integrityLedgerPut(row) {
  const db = await getDb();
  await db.put(STORES.integrityLedgerEntries, row);
}

export async function integrityLedgerGet(ledgerId) {
  const db = await getDb();
  return db.get(STORES.integrityLedgerEntries, ledgerId);
}

export async function integrityLedgerByTransactionId(transactionId) {
  const db = await getDb();
  return db.getAllFromIndex(STORES.integrityLedgerEntries, "byTransactionId", transactionId);
}
