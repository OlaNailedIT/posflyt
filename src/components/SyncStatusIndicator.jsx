import { useOfflineStore } from "../stores/offlineStore";

/**
 * Priority: sync in progress (with counts) → failed → pending → all synced.
 */
export default function SyncStatusIndicator() {
  const queueSyncingCount = useOfflineStore((s) => s.queueSyncingCount);
  const pendingTransactions = useOfflineStore((s) => s.pendingTransactions);
  const failedTransactions = useOfflineStore((s) => s.failedTransactions);
  const syncing = useOfflineStore((s) => s.syncing);
  const syncProgress = useOfflineStore((s) => s.syncProgress);
  const lastSuccessfulSyncAt = useOfflineStore((s) => s.lastSuccessfulSyncAt);

  const syncingActive = syncing || queueSyncingCount > 0;
  const total = Number(syncProgress?.total || 0);
  const done = Number(syncProgress?.done || 0);
  const progressFailed = Number(syncProgress?.failed || 0);

  let label = "All synced";
  let className =
    "rounded-lg border border-stone-300 bg-stone-100 px-2 py-1 text-xs text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300";

  if (syncingActive && total > 0) {
    label =
      progressFailed > 0
        ? `Retrying failed items… ${done}/${total}`
        : `Syncing ${done}/${total} items…`;
    className =
      "rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200";
  } else if (syncingActive) {
    label = "Syncing…";
    className =
      "rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200";
  } else if (failedTransactions > 0) {
    label = "⚠️ Sync issues detected";
    className =
      "rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200";
  } else if (pendingTransactions > 0) {
    label = "Pending sync";
    className =
      "rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
  }

  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span className={className}>{label}</span>
      {lastSuccessfulSyncAt != null && (
        <span className="text-[10px] text-stone-500 dark:text-stone-400">
          Last synced: {new Date(lastSuccessfulSyncAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
