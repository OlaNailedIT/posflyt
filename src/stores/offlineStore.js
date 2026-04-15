import { create } from "zustand";
import { normalizeNullableIso } from "../utils/safeDate.js";

export const useOfflineStore = create((set) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  lastConnectivityChangeAt: Date.now(),
  networkStability: "stable",
  /** Active transaction queue rows (excludes locally marked SYNCED) + outbox count. */
  pendingTransactions: 0,
  /** Subset of transaction queue: syncStatus === pending */
  queuePendingCount: 0,
  /** Subset of transaction queue: syncStatus === syncing */
  queueSyncingCount: 0,
  failedTransactions: 0,
  queueLastAttemptAt: null,
  queueNextRetryAt: null,
  queueReplayOrder: "Queued sales and other changes sync in creation order (FIFO).",
  syncing: false,
  syncProgress: { done: 0, total: 0, failed: 0 },
  /** In-flight sync session (crash-safe queue state is in IndexedDB). */
  syncSession: { startedAt: null, total: 0, completed: 0 },
  /** Last successful sync completion time (ms since epoch). */
  lastSuccessfulSyncAt: null,
  lastSyncedAt: null,
  lastSyncError: null,
  lastSyncCode: null,
  setOnline: (isOnline) => set({ isOnline, lastConnectivityChangeAt: Date.now() }),
  setNetworkStability: (networkStability) => set({ networkStability }),
  setQueueCount: (pendingTransactions) => set({ pendingTransactions }),
  setQueueBreakdown: ({ pendingTransactions, queuePendingCount, queueSyncingCount, failedTransactions }) =>
    set({
      ...(pendingTransactions !== undefined ? { pendingTransactions } : {}),
      ...(queuePendingCount !== undefined ? { queuePendingCount } : {}),
      ...(queueSyncingCount !== undefined ? { queueSyncingCount } : {}),
      ...(failedTransactions !== undefined ? { failedTransactions } : {}),
    }),
  setFailedCount: (failedTransactions) => set({ failedTransactions }),
  setQueueMeta: ({ queueLastAttemptAt, queueNextRetryAt }) =>
    set({
      queueLastAttemptAt: normalizeNullableIso(queueLastAttemptAt),
      queueNextRetryAt: normalizeNullableIso(queueNextRetryAt),
    }),
  setSyncing: (syncing) => set({ syncing }),
  setSyncProgress: (syncProgress) => set({ syncProgress }),
  setSyncSession: (syncSession) => set({ syncSession }),
  setSyncSessionProgress: (completed) =>
    set((s) => ({
      syncSession: {
        ...s.syncSession,
        completed: Math.max(0, Number(completed) || 0),
      },
    })),
  clearSyncSession: () =>
    set({ syncSession: { startedAt: null, total: 0, completed: 0 } }),
  setLastSuccessfulSyncAt: (lastSuccessfulSyncAt) =>
    set({
      lastSuccessfulSyncAt:
        typeof lastSuccessfulSyncAt === "number" && Number.isFinite(lastSuccessfulSyncAt)
          ? lastSuccessfulSyncAt
          : null,
    }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt: normalizeNullableIso(lastSyncedAt) }),
  setLastSyncError: (lastSyncError, lastSyncCode = null) => set({ lastSyncError, lastSyncCode }),
}));
