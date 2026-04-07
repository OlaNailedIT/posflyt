import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { postProduct, postTransaction, postCustomer, putProduct } from "../services/api";
import {
  getQueuedOutbox,
  getQueuedTransactions,
  markOutboxFailed,
  markOutboxSyncing,
  markQueuedTransactionFailed,
  markQueuedTransactionSyncing,
  removeOutbox,
  removeQueuedTransaction,
  updateQueuedTransactionPayload,
} from "../services/db";
import { useOfflineStore } from "../stores/offlineStore";
import { getStoredAuthTokenSync } from "../utils/authToken";
import { useOnlineStatus } from "./useOnlineStatus";

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
    const response = await postTransaction(payload);
    const first = Array.isArray(response?.results) ? response.results[0] : null;
    if (first?.status === "duplicate") {
      await removeQueuedTransaction(item.id);
      onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
      return;
    }
    if (Number(response?.failed || 0) > 0 || first?.status === "failed") {
      const code = first?.code || "TRANSIENT_SYNC_FAILURE";
      const messageByCode = {
        DUPLICATE_ID: "Transaction already synced.",
        INVENTORY_CONFLICT: "Sale not synced: stock unavailable. Review inventory and retry.",
        VALIDATION_FAILED: "Sale data is invalid. Please retry from POS.",
        TRANSIENT_SYNC_FAILURE: "Temporary sync failure. Retrying automatically.",
      };
      const syncError = new Error(messageByCode[code] || first?.message || "Sync failed");
      syncError.syncCode = code;
      throw syncError;
    }

    await removeQueuedTransaction(item.id);
    onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
  } catch (error) {
    onProgress?.({
      doneIncrement: 0,
      failedIncrement: 1,
      lastErrorCode: error.syncCode || null,
    });
    await markQueuedTransactionFailed(
      item.id,
      error.response?.data?.message || error.message,
      error.syncCode || null
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
    } else {
      throw new Error(`Unknown outbox kind: ${item.kind}`);
    }
    await removeOutbox(item.id);
    onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
  } catch (error) {
    const code = error.response?.data?.code || null;
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

async function syncMergedQueue(merged, setSyncProgress) {
  let done = 0;
  let failed = 0;
  const total = merged.length;

  const onProgress = (ev) => {
    if (typeof ev.doneIncrement === "number") done += ev.doneIncrement;
    if (typeof ev.failedIncrement === "number") failed += ev.failedIncrement;
    setSyncProgress({ done, total, failed, lastErrorCode: ev.lastErrorCode ?? null });
  };

  setSyncProgress({ done: 0, total, failed: 0 });

  for (const entry of merged) {
    if (entry.source === "tx") {
      await syncOneTransaction(entry.row, onProgress);
    } else {
      await syncOneOutbox(entry.row, onProgress);
    }
  }
}

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const setQueueCount = useOfflineStore((s) => s.setQueueCount);
  const setSyncing = useOfflineStore((s) => s.setSyncing);
  const setSyncProgress = useOfflineStore((s) => s.setSyncProgress);
  const setFailedCount = useOfflineStore((s) => s.setFailedCount);
  const setQueueMeta = useOfflineStore((s) => s.setQueueMeta);
  const setLastSyncedAt = useOfflineStore((s) => s.setLastSyncedAt);
  const setLastSyncError = useOfflineStore((s) => s.setLastSyncError);
  const pendingTransactions = useOfflineStore((s) => s.pendingTransactions);
  const syncing = useOfflineStore((s) => s.syncing);

  const refreshCount = useCallback(async () => {
    const queue = await getQueuedTransactions();
    const outbox = await getQueuedOutbox();
    setQueueCount(queue.length + outbox.length);
    const failedItems = [
      ...queue.filter((item) => item.status === "failed"),
      ...outbox.filter((item) => item.status === "failed"),
    ].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    setFailedCount(failedItems.length);
    const combined = [...queue, ...outbox];
    const queueLastAttemptAt = combined
      .map((item) => Number(item.lastAttemptAt || 0))
      .filter((value) => value > 0)
      .sort((a, b) => b - a)[0];
    const queueNextRetryAt = failedItems
      .map((item) => Number(item.nextRetryAt || 0))
      .filter((value) => value > 0)
      .sort((a, b) => a - b)[0];
    setQueueMeta({
      queueLastAttemptAt: queueLastAttemptAt ? new Date(queueLastAttemptAt).toISOString() : null,
      queueNextRetryAt: queueNextRetryAt ? new Date(queueNextRetryAt).toISOString() : null,
    });
    setLastSyncError(failedItems[0]?.lastError || null, failedItems[0]?.lastErrorCode || null);
  }, [setFailedCount, setLastSyncError, setQueueCount, setQueueMeta]);

  const syncQueue = useCallback(
    async (force = false) => {
      if (!isOnline) return;
      if (!getStoredAuthTokenSync()) return;
      const txQueue = await getQueuedTransactions();
      const outbox = await getQueuedOutbox();
      const now = Date.now();
      const merged = [
        ...txQueue.map((row) => ({ source: "tx", row })),
        ...outbox.map((row) => ({ source: "outbox", row })),
      ].sort((a, b) => Number(a.row.createdAt) - Number(b.row.createdAt));

      const runnable = force
        ? merged
        : merged.filter((e) => Number(e.row.nextRetryAt || 0) <= now);

      if (!merged.length) {
        setQueueCount(0);
        setFailedCount(0);
        setLastSyncError(null, null);
        setQueueMeta({ queueLastAttemptAt: null, queueNextRetryAt: null });
        setSyncProgress({ done: 0, total: 0, failed: 0 });
        return;
      }
      if (!runnable.length) return;

      setSyncing(true);
      setSyncProgress({ done: 0, total: runnable.length, failed: 0 });
      try {
        await syncMergedQueue(runnable, setSyncProgress);
        await queryClient.invalidateQueries({ queryKey: ["products"] });
        await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.invalidateQueries({ queryKey: ["customers"] });
        setLastSyncedAt(new Date().toISOString());
      } finally {
        const remainingTx = await getQueuedTransactions();
        const remainingOb = await getQueuedOutbox();
        setQueueCount(remainingTx.length + remainingOb.length);
        const failedItems = [
          ...remainingTx.filter((item) => item.status === "failed"),
          ...remainingOb.filter((item) => item.status === "failed"),
        ].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
        setFailedCount(failedItems.length);
        const combined = [...remainingTx, ...remainingOb];
        const queueLastAttemptAt = combined
          .map((item) => Number(item.lastAttemptAt || 0))
          .filter((value) => value > 0)
          .sort((a, b) => b - a)[0];
        const queueNextRetryAt = failedItems
          .map((item) => Number(item.nextRetryAt || 0))
          .filter((value) => value > 0)
          .sort((a, b) => a - b)[0];
        setQueueMeta({
          queueLastAttemptAt: queueLastAttemptAt ? new Date(queueLastAttemptAt).toISOString() : null,
          queueNextRetryAt: queueNextRetryAt ? new Date(queueNextRetryAt).toISOString() : null,
        });
        setLastSyncError(failedItems[0]?.lastError || null, failedItems[0]?.lastErrorCode || null);
        setSyncing(false);
      }
    },
    [
      isOnline,
      setFailedCount,
      setLastSyncError,
      setLastSyncedAt,
      setQueueCount,
      setQueueMeta,
      setSyncing,
      setSyncProgress,
      queryClient,
    ]
  );

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (isOnline && getStoredAuthTokenSync()) syncQueue();
  }, [isOnline, syncQueue]);

  useEffect(() => {
    if (!getStoredAuthTokenSync()) return undefined;
    if (!isOnline || syncing || pendingTransactions === 0) return undefined;
    const timer = setInterval(() => {
      syncQueue(false);
    }, 10000);
    return () => clearInterval(timer);
  }, [isOnline, pendingTransactions, syncing, syncQueue]);

  return { syncQueue, refreshCount, isOnline };
}
