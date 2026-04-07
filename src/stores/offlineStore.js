import { create } from "zustand";

export const useOfflineStore = create((set) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  lastConnectivityChangeAt: Date.now(),
  networkStability: "stable",
  pendingTransactions: 0,
  failedTransactions: 0,
  queueLastAttemptAt: null,
  queueNextRetryAt: null,
  queueReplayOrder: "Queued sales and other changes sync in creation order (FIFO).",
  syncing: false,
  syncProgress: { done: 0, total: 0, failed: 0 },
  lastSyncedAt: null,
  lastSyncError: null,
  lastSyncCode: null,
  setOnline: (isOnline) => set({ isOnline, lastConnectivityChangeAt: Date.now() }),
  setNetworkStability: (networkStability) => set({ networkStability }),
  setQueueCount: (pendingTransactions) => set({ pendingTransactions }),
  setFailedCount: (failedTransactions) => set({ failedTransactions }),
  setQueueMeta: ({ queueLastAttemptAt, queueNextRetryAt }) =>
    set({ queueLastAttemptAt, queueNextRetryAt }),
  setSyncing: (syncing) => set({ syncing }),
  setSyncProgress: (syncProgress) => set({ syncProgress }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setLastSyncError: (lastSyncError, lastSyncCode = null) => set({ lastSyncError, lastSyncCode }),
}));
