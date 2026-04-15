/**
 * Offline sync: **replay engine only** for financial rows — reconstructs FinancialEvent and calls
 * syncReplay → executeFinancialEvent. No parallel financial business rules here.
 *
 * @see docs/UFEC_PHASE2_DOMINANCE.md
 */
import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  postProduct,
  postCustomer,
  putProduct,
  postSettleTransactionCredit,
  postSettleCustomerCredit,
  postExpense,
  postInventoryCountFinalize,
  postAuditEventsBulk,
} from "../services/api";
import {
  getQueuedOutbox,
  getQueuedTransactions,
  getUfecReconciliationQueuePending,
  bumpTransactionRetryNow,
  markOutboxFailed,
  markOutboxSyncing,
  markQueuedTransactionFailed,
  markQueuedTransactionPending,
  markQueuedTransactionSyncing,
  markQueuedTransactionSynced,
  removeOutbox,
  setOutboxNextRetryAt,
  resolveSyncStatus,
  updateQueuedTransactionPayload,
} from "../services/db";
import { SYNC_STATUS } from "../constants/syncStatus";
import { useOfflineStore } from "../stores/offlineStore";
import { getStoredAuthTokenSync } from "../utils/authToken";
import { useOnlineStatus } from "./useOnlineStatus";
import { isRecoverableNetworkError } from "../utils/networkError";
import { nowISOString, safeToISOString } from "../utils/safeDate";
import { maybeAutoIndexedDBBackup } from "../services/indexeddbBackup";
import { usePendingCheckoutStore } from "../stores/pendingCheckoutStore";
import {
  reportUfecShadowOutbox,
  reportUfecShadowTransactionSync,
} from "../financial/ufecSyncShadow";
import { getSyncReplayIdempotencyDecision } from "../financial/ufecIdempotencyRegistry.js";
import { getUfecRetryThrottleState } from "../financial/ufecRetryCooldown.js";
import { replayOutboxReturn, replayQueuedTransactionSale } from "../financial/syncReplay";
import { resolveCanonicalEventOrder } from "../financial/ufecCanonicalOrder.js";
import {
  evaluateSyncPressure,
  getAdaptiveConcurrency,
  getDynamicBatchSize,
  getSyntheticPauseMs,
  getThrottleDelayMs,
  isUfecSyncFreezeModeEnabled,
  recordBatchOutcome,
  recordSyncFailureBurst,
  resetSessionRetryBudget,
  tryConsumeSessionAttemptBudget,
  UFEC_SYNC_MODE,
} from "../financial/ufecSyncBackpressure.js";
import { getOperationalResilienceSnapshot } from "../financial/ufecSystemHealth.js";
import { registerOfflineSyncRunner } from "../offline/syncCoordinator.js";
import { recordSaleAppliedIntegrity } from "../ledger/index.js";

/**
 * Defensive overlap guard when `navigator.locks` is unavailable.
 * Primary invocation serialization lives in `syncCoordinator.requestOfflineSync`.
 */
let isSyncRunning = false;

/** Idempotent replay: same client_transaction_id → created or duplicate; both count as synced. */
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

async function countEligibleTotal(force) {
  const now = Date.now();
  const allTx = await getQueuedTransactions();
  const tx = allTx.filter((r) => isTxEligible(r, force, now));
  const allOb = await getQueuedOutbox();
  const ob = allOb.filter((r) => isOutboxEligible(r, force, now));
  return tx.length + ob.length;
}

async function getNextMergedBatch(force, batchSize) {
  const now = Date.now();
  const allTx = await getQueuedTransactions();
  const txRows = allTx.filter((r) => isTxEligible(r, force, now));
  const allOb = await getQueuedOutbox();
  const obRows = allOb.filter((r) => isOutboxEligible(r, force, now));
  const merged = [
    ...txRows.map((row) => ({ source: "tx", row })),
    ...obRows.map((row) => ({ source: "outbox", row })),
  ];
  const { orderedEvents, detectedInversions, reordered } = resolveCanonicalEventOrder(merged);
  if (import.meta.env.DEV) {
    if (reordered) {
      console.info("[UFEC_CFEOS]", { reordered: true, batchSize: orderedEvents.length });
    }
    if (detectedInversions.some((x) => x.type === "ORDER_DRIFT_DETECTED")) {
      console.warn("[UFEC_ORDER_DRIFT_DETECTED]", detectedInversions);
    }
  }
  const cap = Math.max(1, Math.min(Number(batchSize) || 25, 500));
  return orderedEvents.slice(0, cap);
}

function countFailedQueueItems(queue, outbox) {
  const failedTx = queue.filter((item) => resolveSyncStatus(item) === SYNC_STATUS.FAILED).length;
  const failedOb = outbox.filter((item) => item.status === "failed").length;
  return failedTx + failedOb;
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

function notifyCheckoutSyncedFromPayload(payload) {
  const cid = payload?.client_transaction_id;
  if (cid) usePendingCheckoutStore.getState().markSuccess(cid);
}

function notifyCheckoutSyncFailedFromPayload(payload) {
  const cid = payload?.client_transaction_id;
  if (cid) usePendingCheckoutStore.getState().markFailed(cid);
}

async function syncOneTransaction(item, onProgress) {
  const patch = {};
  /** Legacy rows only: never rotate id on replay — idempotency key must stay stable. */
  if (!item.payload?.client_transaction_id) {
    patch.client_transaction_id = crypto.randomUUID();
  }
  if (!item.payload?.created_at) {
    patch.created_at =
      safeToISOString(Number(item.createdAt) || Date.now()) ?? nowISOString();
  }
  let payload = item.payload;
  if (Object.keys(patch).length > 0) {
    const updated = await updateQueuedTransactionPayload(item.id, patch);
    payload = updated?.payload || { ...item.payload, ...patch };
  }

  const gid = payload?.client_transaction_id || item.client_transaction_id;
  const idem = await getSyncReplayIdempotencyDecision(gid);
  /** @type {{ outcome: 'synced'|'pending'|'failed'|'unknown', response?: object, error?: Error, first?: object|null, syncCode?: string|null }} */
  let shadowDetail = { outcome: "unknown" };

  if (idem.action === "use_cached") {
    const response = idem.cachedResult;
    const first = Array.isArray(response?.results) ? response.results[0] : null;
    try {
      await markQueuedTransactionSynced(item.id);
      notifyCheckoutSyncedFromPayload(payload);
      onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
      shadowDetail = { outcome: "synced", response, first, idempotency: "CACHED" };
    } finally {
      reportUfecShadowTransactionSync(item, payload, shadowDetail);
    }
    return;
  }

  if (idem.action === "defer_backoff") {
    await markQueuedTransactionPending(item.id, "UFEC_BACKOFF", idem.until);
    onProgress?.({
      doneIncrement: 0,
      failedIncrement: 0,
      lastErrorCode: null,
    });
    shadowDetail = { outcome: "pending", idempotency: "BACKOFF", until: idem.until };
    reportUfecShadowTransactionSync(item, payload, shadowDetail);
    return;
  }

  if (idem.action === "defer_in_flight") {
    await markQueuedTransactionPending(item.id, null);
    onProgress?.({
      doneIncrement: 0,
      failedIncrement: 0,
      lastErrorCode: null,
    });
    shadowDetail = { outcome: "pending", idempotency: "IN_FLIGHT" };
    reportUfecShadowTransactionSync(item, payload, shadowDetail);
    return;
  }

  if (idem.action === "blocked_reconcile") {
    onProgress?.({
      doneIncrement: 0,
      failedIncrement: 1,
      lastErrorCode: "RECONCILE_REQUIRED",
    });
    await markQueuedTransactionFailed(
      item.id,
      "RECONCILE_REQUIRED",
      "RECONCILE_REQUIRED"
    );
    notifyCheckoutSyncFailedFromPayload(payload);
    shadowDetail = {
      outcome: "failed",
      syncCode: "RECONCILE_REQUIRED",
      idempotency: idem.detail,
    };
    reportUfecShadowTransactionSync(item, payload, shadowDetail);
    return;
  }

  if (!tryConsumeSessionAttemptBudget(item.id)) {
    onProgress?.({
      doneIncrement: 0,
      failedIncrement: 1,
      lastErrorCode: "RECONCILE_REQUIRED",
    });
    await markQueuedTransactionFailed(item.id, "RECONCILE_REQUIRED", "RECONCILE_REQUIRED");
    notifyCheckoutSyncFailedFromPayload(payload);
    shadowDetail = {
      outcome: "failed",
      syncCode: "RECONCILE_REQUIRED",
      idempotency: "SESSION_RETRY_BUDGET",
    };
    reportUfecShadowTransactionSync(item, payload, shadowDetail);
    return;
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
    const response = await replayQueuedTransactionSale(payload, item);
    const first = Array.isArray(response?.results) ? response.results[0] : null;
    if (isAppliedOrDuplicate(first)) {
      await markQueuedTransactionSynced(item.id);
      notifyCheckoutSyncedFromPayload(payload);
      onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
      shadowDetail = { outcome: "synced", response, first };
      {
        const cid = payload?.client_transaction_id || item.client_transaction_id;
        if (cid) {
          void recordSaleAppliedIntegrity({
            transactionId: String(cid),
            totalAmount: Number(payload?.total ?? 0),
            source: "sync",
            duplicate: first?.status === "duplicate",
            serverTransactionId: first?.transactionId ?? null,
          }).catch(() => {});
        }
      }
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
      shadowDetail = { outcome: "failed", response, first, syncCode: code, error: syncError };
      throw syncError;
    }

    await markQueuedTransactionSynced(item.id);
    notifyCheckoutSyncedFromPayload(payload);
    onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
    shadowDetail = { outcome: "synced", response, first };
    {
      const cid = payload?.client_transaction_id || item.client_transaction_id;
      if (cid) {
        void recordSaleAppliedIntegrity({
          transactionId: String(cid),
          totalAmount: Number(payload?.total ?? 0),
          source: "sync",
          duplicate: first?.status === "duplicate",
          serverTransactionId: first?.transactionId ?? null,
        }).catch(() => {});
      }
    }
  } catch (error) {
    const recoverable = isRecoverableNetworkError(error);
    if (recoverable) {
      await markQueuedTransactionPending(item.id, error.message || null);
      onProgress?.({
        doneIncrement: 0,
        failedIncrement: 0,
        lastErrorCode: null,
      });
      shadowDetail = { outcome: "pending", error, recoverable: true };
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
    notifyCheckoutSyncFailedFromPayload(payload);
    shadowDetail = {
      outcome: "failed",
      error,
      syncCode: error.syncCode || error.response?.data?.code || null,
    };
  } finally {
    reportUfecShadowTransactionSync(item, payload, shadowDetail);
  }
}

async function syncOneOutbox(item, onProgress) {
  /** @type {{ outcome: 'success'|'failed'|'unknown'|'pending', error?: Error, code?: string|null, idempotency?: string }} */
  let shadowDetail = { outcome: "unknown" };

  if (item.kind === "POST_RETURN") {
    const ob = item.body || {};
    const gid = ob.client_return_id || ob.client_transaction_id || item.id;
    const idem = await getSyncReplayIdempotencyDecision(gid);
    if (idem.action === "use_cached") {
      try {
        await removeOutbox(item.id);
        onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
        shadowDetail = { outcome: "success", idempotency: "CACHED" };
      } finally {
        reportUfecShadowOutbox(item, shadowDetail);
      }
      return;
    }
    if (idem.action === "defer_backoff") {
      await setOutboxNextRetryAt(item.id, idem.until);
      onProgress?.({
        doneIncrement: 0,
        failedIncrement: 0,
        lastErrorCode: null,
      });
      shadowDetail = { outcome: "pending", idempotency: "BACKOFF", until: idem.until };
      reportUfecShadowOutbox(item, shadowDetail);
      return;
    }
    if (idem.action === "defer_in_flight") {
      shadowDetail = { outcome: "pending", idempotency: "IN_FLIGHT" };
      reportUfecShadowOutbox(item, shadowDetail);
      return;
    }
    if (idem.action === "blocked_reconcile") {
      await markOutboxFailed(item.id, "RECONCILE_REQUIRED", "RECONCILE_REQUIRED");
      onProgress?.({
        doneIncrement: 0,
        failedIncrement: 1,
        lastErrorCode: "RECONCILE_REQUIRED",
      });
      shadowDetail = { outcome: "failed", code: "RECONCILE_REQUIRED", idempotency: idem.detail };
      reportUfecShadowOutbox(item, shadowDetail);
      return;
    }
  }

  /** Non-financial: do not consume UFEC session retry budget. */
  if (item.kind === "AUDIT_EVENT") {
    await markOutboxSyncing(item.id);
    try {
      const ev = item.body;
      if (!ev || typeof ev !== "object") throw new Error("Missing audit event body.");
      await postAuditEventsBulk({ events: [ev] });
      await removeOutbox(item.id);
      onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
      shadowDetail = { outcome: "success" };
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
      shadowDetail = { outcome: "failed", error, code };
    } finally {
      reportUfecShadowOutbox(item, shadowDetail);
    }
    return;
  }

  if (!tryConsumeSessionAttemptBudget(item.id)) {
    await markOutboxFailed(item.id, "RECONCILE_REQUIRED", "RECONCILE_REQUIRED");
    onProgress?.({
      doneIncrement: 0,
      failedIncrement: 1,
      lastErrorCode: "RECONCILE_REQUIRED",
    });
    shadowDetail = { outcome: "failed", code: "RECONCILE_REQUIRED", idempotency: "SESSION_RETRY_BUDGET" };
    reportUfecShadowOutbox(item, shadowDetail);
    return;
  }

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
    } else if (item.kind === "POST_RETURN") {
      await replayOutboxReturn(item.body, item.id, item);
    } else {
      throw new Error(`Unknown outbox kind: ${item.kind}`);
    }
    await removeOutbox(item.id);
    onProgress?.({ doneIncrement: 1, failedIncrement: 0 });
    shadowDetail = { outcome: "success" };
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
      shadowDetail = { outcome: "failed", error, code };
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
    shadowDetail = { outcome: "failed", error, code };
  } finally {
    reportUfecShadowOutbox(item, shadowDetail);
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
    if (backlogSize > 50 && import.meta.env.DEV) {
      console.warn("Large sync backlog", { count: backlogSize });
    }
    setQueueBreakdown({
      pendingTransactions: activeTx.length + outbox.length,
      queuePendingCount: pendingOnly,
      queueSyncingCount: syncingOnly,
      failedTransactions: failedCount,
    });
    setQueueMeta({
      queueLastAttemptAt: queueLastAttemptAt ? safeToISOString(queueLastAttemptAt) : null,
      queueNextRetryAt: queueNextRetryAt ? safeToISOString(queueNextRetryAt) : null,
    });
    setLastSyncError(failedItems[0]?.lastError || failedItems[0]?.syncError || null, failedItems[0]?.lastErrorCode || null);
  }, [setLastSyncError, setQueueBreakdown, setQueueMeta]);

  const runSync = useCallback(
    async (force = false) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (!getStoredAuthTokenSync()) return;

      const runSyncBody = async () => {
        if (isUfecSyncFreezeModeEnabled()) {
          if (import.meta.env.DEV) console.warn("[UFEC_SYNC] FREEZE_MODE — skipping execution");
          await refreshCount();
          return;
        }

        const initialTotal = await countEligibleTotal(force);
        if (initialTotal === 0) {
          setSyncProgress({ done: 0, total: 0, failed: 0 });
          clearSyncSession();
          await refreshCount();
          void maybeAutoIndexedDBBackup();
          return;
        }

        setSyncing(true);
        let done = 0;
        let failed = 0;
        setSyncProgress({ done: 0, total: initialTotal || 1, failed: 0, lastErrorCode: null });
        setSyncSession({
          startedAt: Date.now(),
          total: initialTotal,
          completed: 0,
        });
        resetSessionRetryBudget();

        try {
          if (import.meta.env.DEV) {
            console.log("SYNC_RUN_START", { time: nowISOString() });
          }
          const maxRounds = 500;
          let lastBatchMs = 0;
          for (let round = 0; round < maxRounds; round += 1) {
            if (isUfecSyncFreezeModeEnabled()) break;

            const batchT0 = Date.now();
            const queue = await getQueuedTransactions();
            const outbox = await getQueuedOutbox();
            const recon = await getUfecReconciliationQueuePending();
            const failedQueueItems = countFailedQueueItems(queue, outbox);
            const queueDepth = queue.length + outbox.length;
            const throttle = getUfecRetryThrottleState();
            const { pressure, mode } = evaluateSyncPressure({
              queueDepth,
              reconBacklog: recon.length,
              failedQueueItems,
              lastBatchDurationMs: lastBatchMs,
              idempotencyPressure: throttle.throttle === true,
            });

            const resilience = await getOperationalResilienceSnapshot({
              queueDepth,
              reconBacklog: recon.length,
              failedQueueItems,
              lastBatchDurationMs: lastBatchMs,
              idempotencyPressure: throttle.throttle === true,
            });
            if (resilience.freezeSync) {
              if (import.meta.env.DEV) {
                console.warn("[UFEC_RESILIENCE] operational FREEZE — sync paused");
              }
              break;
            }

            if (mode === UFEC_SYNC_MODE.FREEZE_MODE) break;

            let batchSize =
              mode === UFEC_SYNC_MODE.SAFE_MODE
                ? Math.max(1, Math.min(getDynamicBatchSize(pressure), 5))
                : getDynamicBatchSize(pressure);
            batchSize = Math.max(1, Math.floor(batchSize * resilience.batchSizeFactor));

            const batch = await getNextMergedBatch(force, batchSize);
            if (!batch.length) break;

            let batchFailed = 0;
            const onProgress = (ev) => {
              if (typeof ev.doneIncrement === "number") done += ev.doneIncrement;
              if (typeof ev.failedIncrement === "number") {
                const fi = ev.failedIncrement;
                if (fi > 0) {
                  failed += fi;
                  batchFailed += fi;
                  const n = Math.min(fi, 20);
                  for (let i = 0; i < n; i += 1) recordSyncFailureBurst();
                }
              }
              setSyncProgress({
                done,
                total: Math.max(initialTotal, done),
                failed,
                lastErrorCode: ev.lastErrorCode ?? null,
              });
              setSyncSessionProgress(done + failed);
            };

            const adaptive = getAdaptiveConcurrency(pressure);
            let concurrency = Math.max(
              1,
              Math.min(adaptive, Math.max(1, throttle.suggestedConcurrency))
            );
            concurrency = Math.max(1, Math.floor(concurrency * resilience.concurrencyFactor));
            await runWithLimit(
              batch.map(
                (entry) => async () => {
                  if (entry.source === "tx") await syncOneTransaction(entry.row, onProgress);
                  else await syncOneOutbox(entry.row, onProgress);
                }
              ),
              concurrency
            );

            lastBatchMs = Date.now() - batchT0;
            recordBatchOutcome({ durationMs: lastBatchMs, batchFailed });

            const delayMs = Math.max(getThrottleDelayMs(pressure), throttle.extraDelayMs || 0);
            const synthetic = getSyntheticPauseMs(batchFailed);
            const totalDelay = delayMs + synthetic;
            if (totalDelay > 0) {
              await new Promise((r) => setTimeout(r, totalDelay));
            }

            if (import.meta.env.DEV) {
              console.log("SYNC_BATCH_COMPLETE", {
                processed: batch.length,
                pressure,
                mode,
                concurrency,
                batchSize,
                lastBatchMs,
                delayMs: totalDelay,
              });
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
          setLastSyncedAt(safeToISOString(finishedAt) ?? nowISOString());
          setLastSuccessfulSyncAt(finishedAt);
          void maybeAutoIndexedDBBackup();
        } finally {
          setSyncing(false);
          clearSyncSession();
          await refreshCount();
        }
      };

      /** Cross-tab mutex: defensive; `syncCoordinator` already serializes triggers in this tab. */
      const locks = typeof navigator !== "undefined" ? navigator.locks : null;
      if (locks?.request) {
        await locks.request("posflyt-ufec-sync-v1", runSyncBody);
        return;
      }

      if (isSyncRunning) return;
      isSyncRunning = true;
      try {
        await runSyncBody();
      } finally {
        isSyncRunning = false;
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
    registerOfflineSyncRunner(runSync);
    return () => registerOfflineSyncRunner(null);
  }, [runSync]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (isOnline && getStoredAuthTokenSync()) {
      void runSync(false);
    }
  }, [isOnline, runSync]);

  return { syncQueue, refreshCount, isOnline, retryFailedTransactions, syncSingleTransaction };
}
