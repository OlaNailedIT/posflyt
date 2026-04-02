import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { postTransaction } from "../services/api";
import {
  getQueuedTransactions,
  markQueuedTransactionFailed,
  markQueuedTransactionSyncing,
  removeQueuedTransaction,
  updateQueuedTransactionPayload,
} from "../services/db";
import { useOfflineStore } from "../stores/offlineStore";
import { useOnlineStatus } from "./useOnlineStatus";

async function syncSequentially(queue, onProgress) {
  let done = 0;
  let failed = 0;
  for (const item of queue) {
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
      done += 1;
    } catch (error) {
      failed += 1;
      onProgress?.({
        done,
        total: queue.length,
        failed,
        lastErrorCode: error.syncCode || null,
      });
      await markQueuedTransactionFailed(
        item.id,
        error.response?.data?.message || error.message,
        error.syncCode || null
      );
    }
    onProgress?.({ done, total: queue.length, failed });
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
    setQueueCount(queue.length);
    const failedItems = queue.filter((item) => item.status === "failed");
    setFailedCount(failedItems.length);
    const queueLastAttemptAt = queue
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

  const syncQueue = useCallback(async (force = false) => {
    if (!isOnline) return;
    const queue = await getQueuedTransactions();
    const now = Date.now();
    const runnable = force
      ? queue
      : queue.filter((item) => Number(item.nextRetryAt || 0) <= now);
    if (!queue.length) {
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
      await syncSequentially(runnable, setSyncProgress);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setLastSyncedAt(new Date().toISOString());
    } finally {
      const remaining = await getQueuedTransactions();
      setQueueCount(remaining.length);
      const failedItems = remaining.filter((item) => item.status === "failed");
      setFailedCount(failedItems.length);
      const queueLastAttemptAt = remaining
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
  }, [isOnline, setFailedCount, setLastSyncError, setLastSyncedAt, setQueueCount, setQueueMeta, setSyncing, setSyncProgress, queryClient]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (isOnline) syncQueue();
  }, [isOnline, syncQueue]);

  useEffect(() => {
    if (!isOnline || syncing || pendingTransactions === 0) return undefined;
    const timer = setInterval(() => {
      syncQueue(false);
    }, 10000);
    return () => clearInterval(timer);
  }, [isOnline, pendingTransactions, syncing, syncQueue]);

  return { syncQueue, refreshCount, isOnline };
}
