import { useOfflineStore } from "../stores/offlineStore";

/**
 * Priority: syncing → failed → pending → all synced.
 * Counts reflect transaction queue + outbox activity (see useOfflineSync refreshCount).
 */
export default function SyncStatusIndicator() {
  const queueSyncingCount = useOfflineStore((s) => s.queueSyncingCount);
  const pendingTransactions = useOfflineStore((s) => s.pendingTransactions);
  const failedTransactions = useOfflineStore((s) => s.failedTransactions);
  const syncing = useOfflineStore((s) => s.syncing);

  const syncingActive = syncing || queueSyncingCount > 0;

  let label = "All synced";
  let className =
    "rounded-lg border border-stone-300 bg-stone-100 px-2 py-1 text-xs text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300";

  if (syncingActive) {
    label = "Syncing...";
    className =
      "rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200";
  } else if (failedTransactions > 0) {
    label = "Sync issues";
    className =
      "rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200";
  } else if (pendingTransactions > 0) {
    label = "Pending sync";
    className =
      "rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
  }

  return <span className={className}>{label}</span>;
}
