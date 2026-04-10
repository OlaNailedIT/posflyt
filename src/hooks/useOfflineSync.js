import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  postProduct,
  postTransaction,
  postCustomer,
  putProduct,
  postSettleTransactionCredit,
  postSettleCustomerCredit,
  postExpense,
  postInventoryCountFinalize,
} from "../services/api";
import {
  getQueuedOutbox,
  getQueuedTransactions,
  bumpTransactionRetryNow,
  markOutboxFailed,
  markOutboxSyncing,
  markQueuedTransactionFailed,
  markQueuedTransactionPending,
  markQueuedTransactionSyncing,
  markQueuedTransactionSynced,
  removeOutbox,
  resolveSyncStatus,
  updateQueuedTransactionPayload,
} from "../services/db";
import { SYNC_STATUS } from "../constants/syncStatus";
import { useOfflineStore } from "../stores/offlineStore";
import { getStoredAuthTokenSync } from "../utils/authToken";
import { useOnlineStatus } from "./useOnlineStatus";
import { isRecoverableNetworkError } from "../utils/networkError";
import { maybeAutoIndexedDBBackup } from "../services/indexeddbBackup";

const BATCH_SIZE = 10;
const CONCURRENCY = 3;

/** Prevents overlapping sync runs from online/timer/manual triggers. */
let isSyncRunning = false;

function isAppliedOrDuplicate(first) {
  if (!first) return false;
  if (first.syncStatus === "applied" || first.syncStatus === "duplicate") return true;
  if (first.status === "created" || first.status === "duplicate") return true;
  return false;
}

function isTxEligible(row, force, now) {
  const s = resolveSyncStatus(row);
  if (s === SYNC_STATUS.SYNCED) return false;
  if (s === SYNC_STATUS.SYNCING) return false;
  if (s === SYNC_STATUS.FAILED) return force || Number(row.nextRetryAt || 0) <= now;
  if (s === SYNC_STATUS.PENDING) return force || Number(row.nextRetryAt || 0) <= now;
  return false;
}

function isOutboxEligible(row, force, now) {
  if (row.status === "syncing") return false;
  /** Permanent failure: do not auto-retry; user must resolve in-app while online. */
  if (row.lastErrorCode === "CONFLICT") return false;
  return force || Number(row.nextRetryAt || 0) <= now;
}

function tierFor(entry) {
  if (entry.source === "tx") {
    return resolveSyncStatus(entry.row) === SYNC_STATUS.FAILED ? 0 : 1;
  }
  return entry.row.status === "failed" ? 0 : 1;
}

/** Higher = sync first. Sales + settlements before expenses so outbox never blocks checkout. */
function syncPriority(entry) {
  if (entry.source === "tx") return 3;
  if (entry.source === "outbox") {
    const k = entry.row.kind;
    if (k === "SETTLE_PAYMENT" || k === "SETTLE_CUSTOMER_CREDIT") return 3;
    if (k === "CREATE_EXPENSE") return 1;
    return 2;
  }
  return 0;
}

async function countEligibleTotal(force) {
  const now = Date.now();
  const allTx = await getQueuedTransactions();
  const tx = allTx.filter((r) => isTxEligible(r, force, now));
  const allOb = await getQueuedOutbox();
  const ob = allOb.filter((r) => isOutboxEligible(r, force, now));
  return tx.length + ob.length;
}

async function getNextMergedBatch(force) {
  const now = Date.now();
  const allTx = await getQueuedTransactions();
  const txRows = allTx.filter((r) => isTxEligible(r, force, now));
  const allOb = await getQueuedOutbox();
  const obRows = allOb.filter((r) => isOutboxEligible(r, force, now));
  const merged = [
    ...txRows.map((row) => ({ source: "tx", row })),
    ...obRows.map((row) => ({ source: "outbox", row })),
  ].sort((a, b) => {
    const p = syncPriority(b) - syncPriority(a);
    if (p !== 0) return p;
    const d = tierFor(a) - tierFor(b);
    if (d !== 0) return d;
    return Number(a.row.createdAt) - Number(b.row.createdAt);
  });
  return merged.slice(0, BATCH_SIZE);
}

async function runWithLimit(tasks, limit) {
  const results = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const chunk = tasks.slice(i, i + limit);
    const res = await Promise.all(chunk.map((fn) => fn()));
    results.push(...res);
  }
  return results;
}

async function syncOneTransaction(item, onProgress) {
  const patch = {};
  if (!item.payload?.client_transaction_id) {
    patch.client_transaction_id = crypto.randomUUID();
  }
  if (!item.payload?.created_at) {
    patch.created_at = new Date(Number(item.createdAt) || Date.now()).toISOString();
  }
  let payload = item.payload;
  if (Object.keys(patch).length > 0) {
    const updated = await updateQueuedTransactionPayload(item.id, patch);
    payload = updated?.payload || { ...item.payload, ...patch };
  }

  await markQueuedTransactionSyncing(item.id);
  try {
    if (import.meta.env.DEV) {
      console.log("Retrying transaction", {
        id: item.payload?.client_transaction_id,
        retryCount: item.retryCount,
        nextRetryAt: item.nextRetryAt,
      });
    }
    const response = await postTransaction(payload);
    const first = Array.isArray(response?.results) ? response.results[0] : null;
    if (isAppliedOrDuplicate(first)) {
      await markQueuedTransactionSynced(item.id);
      onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
      return;
    }
    if (Number(response?.failed || 0) > 0 || first?.status === "failed") {
      const code = first?.code || "TRANSIENT_SYNC_FAILURE";
      const messageByCode = {
        DUPLICATE_ID: "Transaction already synced.",
        INSUFFICIENT_STOCK: "Sale not synced: insufficient stock. Review inventory and retry.",
        INVENTORY_CONFLICT: "Sale not synced: stock unavailable. Review inventory and retry.",
        VALIDATION_FAILED: "Sale data is invalid. Please retry from POS.",
        TRANSIENT_SYNC_FAILURE: "Temporary sync failure. Retrying automatically.",
        EXCEEDS_OUTSTANDING: "Amount exceeds outstanding balance.",
        ALREADY_SETTLED: "This transaction is already fully paid.",
        INVALID_PAYMENT_AMOUNT: "Invalid payment amount.",
        INCONSISTENT_PAYMENT_STATE: "Payment totals could not be reconciled. Please retry.",
        NO_OUTSTANDING_BALANCE: "No outstanding balance to apply this payment to.",
      };
      const syncError = new Error(messageByCode[code] || first?.message || "Sync failed");
      syncError.syncCode = code;
      throw syncError;
    }

    await markQueuedTransactionSynced(item.id);
    onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
  } catch (error) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const recoverable = isRecoverableNetworkError(error);
    if (recoverable && offline) {
      await markQueuedTransactionPending(item.id, error.message || null);
      onProgress?.({
        doneIncrement: 0,
        failedIncrement: 0,
        lastErrorCode: null,
      });
      return;
    }
    onProgress?.({
      doneIncrement: 0,
      failedIncrement: 1,
      lastErrorCode: error.syncCode || null,
    });
    await markQueuedTransactionFailed(
      item.id,
      error.response?.data?.message || error.message,
      error.syncCode || error.response?.data?.code || null
    );
  }
}

async function syncOneOutbox(item, onProgress) {
  await markOutboxSyncing(item.id);
  try {
    if (item.kind === "POST_PRODUCT") {
      await postProduct(item.body);
    } else if (item.kind === "PUT_PRODUCT") {
      const pid = item.meta?.productId;
      if (!pid) throw new Error("Missing product id for update.");
      await putProduct(pid, item.body);
    } else if (item.kind === "POST_CUSTOMER") {
      await postCustomer(item.body);
    } else if (item.kind === "SETTLE_PAYMENT") {
      const tid = item.body?.transaction_id;
      if (!tid) throw new Error("Missing transaction_id for SETTLE_PAYMENT.");
      await postSettleTransactionCredit(tid, {
        amount: item.body.amount,
        request_id: item.body.request_id,
        event_id: item.body.event_id,
      });
    } else if (item.kind === "SETTLE_CUSTOMER_CREDIT") {
      const cid = item.body?.customer_id;
      if (!cid) throw new Error("Missing customer_id for SETTLE_CUSTOMER_CREDIT.");
      await postSettleCustomerCredit(cid, {
        amount: item.body.amount,
        request_id: item.body.request_id,
      });
    } else if (item.kind === "CREATE_EXPENSE") {
      const attempt = Number(item.retryCount || 0) + 1;
      console.info("EXPENSE_SYNC_RETRY", { outboxId: item.id, attempt });
      await postExpense({
        amount: item.body.amount,
        category: item.body.category,
        note: item.body.note,
        request_id: item.body.request_id,
        event_id: item.body.event_id,
      });
    } else if (item.kind === "INVENTORY_COUNT_FINALIZE") {
      await postInventoryCountFinalize(item.body);
    } else {
      throw new Error(`Unknown outbox kind: ${item.kind}`);
    }
    await removeOutbox(item.id);
    onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
  } catch (error) {
    const code = error.response?.data?.code || null;
    if (code === "CONFLICT") {
      await markOutboxFailed(
        item.id,
        "Conflict: record changed on server. Open the app while online to resolve.",
        "CONFLICT"
      );
      onProgress?.({
        doneIncrement: 0,
        failedIncrement: 1,
        lastErrorCode: "CONFLICT",
      });
      return;
    }
    onProgress?.({
      doneIncrement: 0,
      failedIncrement: 1,
      lastErrorCode: code,
    });
    await markOutboxFailed(
      item.id,
      error.response?.data?.message || error.message,
      code
    );
  }
}

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const setQueueBreakdown = useOfflineStore((s) => s.setQueueBreakdown);
  const setSyncing = useOfflineStore((s) => s.setSyncing);
  const setSyncProgress = useOfflineStore((s) => s.setSyncProgress);
  const setQueueMeta = useOfflineStore((s) => s.setQueueMeta);
  const setLastSyncedAt = useOfflineStore((s) => s.setLastSyncedAt);
  const setLastSuccessfulSyncAt = useOfflineStore((s) => s.setLastSuccessfulSyncAt);
  const setLastSyncError = useOfflineStore((s) => s.setLastSyncError);
  const setSyncSession = useOfflineStore((s) => s.setSyncSession);
  const setSyncSessionProgress = useOfflineStore((s) => s.setSyncSessionProgress);
  const clearSyncSession = useOfflineStore((s) => s.clearSyncSession);
  const syncing = useOfflineStore((s) => s.syncing);

  const refreshCount = useCallback(async () => {
    const queue = await getQueuedTransactions();
    const outbox = await getQueuedOutbox();
    const activeTx = queue.filter((item) => resolveSyncStatus(item) !== SYNC_STATUS.SYNCED);
    const pendingOnly = activeTx.filter((item) => resolveSyncStatus(item) === SYNC_STATUS.PENDING).length;
    const syncingOnly = activeTx.filter((item) => resolveSyncStatus(item) === SYNC_STATUS.SYNCING).length;
    const failedItems = [
      ...queue.filter((item) => resolveSyncStatus(item) === SYNC_STATUS.FAILED),
      ...outbox.filter((item) => item.status === "failed"),
    ].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    const failedCount = failedItems.length;
    const combined = [...activeTx, ...outbox];
    const queueLastAttemptAt = combined
      .map((item) => Number(item.lastAttemptAt || 0))
      .filter((value) => value > 0)
      .sort((a, b) => b - a)[0];
    const queueNextRetryAt = failedItems
      .map((item) => Number(item.nextRetryAt || 0))
      .filter((value) => value > 0)
      .sort((a, b) => a - b)[0];
    const backlogSize = queue.length + outbox.length;
    if (backlogSize > 50) {
      console.warn("Large sync backlog", { count: backlogSize });
    }
    setQueueBreakdown({
      pendingTransactions: activeTx.length + outbox.length,
      queuePendingCount: pendingOnly,
      queueSyncingCount: syncingOnly,
      failedTransactions: failedCount,
    });
    setQueueMeta({
      queueLastAttemptAt: queueLastAttemptAt ? new Date(queueLastAttemptAt).toISOString() : null,
      queueNextRetryAt: queueNextRetryAt ? new Date(queueNextRetryAt).toISOString() : null,
    });
    setLastSyncError(failedItems[0]?.lastError || failedItems[0]?.syncError || null, failedItems[0]?.lastErrorCode || null);
  }, [setLastSyncError, setQueueBreakdown, setQueueMeta]);

  const runSync = useCallback(
    async (force = false) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (!getStoredAuthTokenSync()) return;
      if (isSyncRunning) return;

      const initialTotal = await countEligibleTotal(force);
      if (initialTotal === 0) {
        setSyncProgress({ done: 0, total: 0, failed: 0 });
        clearSyncSession();
        await refreshCount();
        void maybeAutoIndexedDBBackup();
        return;
      }

      isSyncRunning = true;
      setSyncing(true);
      let done = 0;
      let failed = 0;
      setSyncProgress({ done: 0, total: initialTotal || 1, failed: 0, lastErrorCode: null });
      setSyncSession({
        startedAt: Date.now(),
        total: initialTotal,
        completed: 0,
      });

      try {
        if (import.meta.env.DEV) {
          console.log("SYNC_RUN_START", { time: new Date().toISOString() });
        }
        const maxRounds = 500;
        for (let round = 0; round < maxRounds; round += 1) {
          const batch = await getNextMergedBatch(force);
          if (!batch.length) break;

          const onProgress = (ev) => {
            if (typeof ev.doneIncrement === "number") done += ev.doneIncrement;
            if (typeof ev.failedIncrement === "number") failed += ev.failedIncrement;
            setSyncProgress({
              done,
              total: Math.max(initialTotal, done),
              failed,
              lastErrorCode: ev.lastErrorCode ?? null,
            });
            setSyncSessionProgress(done + failed);
          };

          await runWithLimit(
            batch.map(
              (entry) => async () => {
                if (entry.source === "tx") await syncOneTransaction(entry.row, onProgress);
                else await syncOneOutbox(entry.row, onProgress);
              }
            ),
            CONCURRENCY
          );

          if (import.meta.env.DEV) {
            console.log("SYNC_BATCH_COMPLETE", { processed: batch.length });
          }

          await refreshCount();
        }

        if (import.meta.env.DEV) {
          console.log("SYNC_RUN_END");
        }

        await queryClient.invalidateQueries({ queryKey: ["products"] });
        await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.invalidateQueries({ queryKey: ["customers"] });
        await queryClient.invalidateQueries({ queryKey: ["expenses"] });
        await queryClient.invalidateQueries({ queryKey: ["daily-summary"] });
        const finishedAt = Date.now();
        setLastSyncedAt(new Date(finishedAt).toISOString());
        setLastSuccessfulSyncAt(finishedAt);
        void maybeAutoIndexedDBBackup();
      } finally {
        isSyncRunning = false;
        setSyncing(false);
        clearSyncSession();
        await refreshCount();
      }
    },
    [
      queryClient,
      refreshCount,
      setLastSyncedAt,
      setLastSuccessfulSyncAt,
      setLastSyncError,
      setQueueBreakdown,
      setQueueMeta,
      setSyncing,
      setSyncProgress,
      setSyncSession,
      setSyncSessionProgress,
      clearSyncSession,
    ]
  );

  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;

  const retryFailedTransactions = useCallback(async () => {
    await runSync(false);
  }, [runSync]);

  const syncSingleTransaction = useCallback(async (item) => {
    await bumpTransactionRetryNow(item.id);
    await runSyncRef.current(false);
  }, []);

  const syncQueue = useCallback(
    async (force = false) => {
      await runSync(force);
    },
    [runSync]
  );

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (isOnline && getStoredAuthTokenSync()) {
      void runSync(false);
    }
  }, [isOnline, runSync]);

  useEffect(() => {
    const onOnline = () => {
      void runSyncRef.current(false);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  /** Watchdog: periodic sync while online (queue may be empty — runSync exits fast). */
  useEffect(() => {
    if (!getStoredAuthTokenSync()) return undefined;
    if (!isOnline) return undefined;
    const timer = setInterval(() => {
      void runSyncRef.current(false);
    }, 30_000);
    return () => clearInterval(timer);
  }, [isOnline]);

  return { syncQueue, refreshCount, isOnline, retryFailedTransactions, syncSingleTransaction };
}
