import { useEffect, useRef, useState } from "react";
import { useOfflineStore } from "../stores/offlineStore";

/**
 * App-wide sync feedback: active sync run + short “all clear” after a successful run.
 */
export default function SyncGlobalBanner() {
  const syncing = useOfflineStore((s) => s.syncing);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const syncProgress = useOfflineStore((s) => s.syncProgress);
  const prevSyncingRef = useRef(false);
  const hideAllSyncedRef = useRef(null);
  const [showAllSynced, setShowAllSynced] = useState(false);

  const total = Number(syncProgress?.total || 0);
  const done = Number(syncProgress?.done || 0);
  const progressFailed = Number(syncProgress?.failed || 0);

  useEffect(() => {
    if (prevSyncingRef.current && !syncing) {
      const t = window.setTimeout(() => {
        const { pendingTransactions, failedTransactions } = useOfflineStore.getState();
        if (pendingTransactions === 0 && failedTransactions === 0) {
          setShowAllSynced(true);
          hideAllSyncedRef.current = window.setTimeout(() => setShowAllSynced(false), 6000);
        }
      }, 300);
      prevSyncingRef.current = syncing;
      return () => {
        window.clearTimeout(t);
        if (hideAllSyncedRef.current) window.clearTimeout(hideAllSyncedRef.current);
      };
    }
    prevSyncingRef.current = syncing;
    return undefined;
  }, [syncing]);

  const showSyncing = Boolean(syncing && isOnline);

  if (!showSyncing && !showAllSynced) return null;

  if (showSyncing) {
    return (
      <div
        className="border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-center text-sm font-medium text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-100"
        role="status"
        aria-live="polite"
      >
        Syncing transactions…
        {total > 0 ? (
          <span className="ml-1 tabular-nums text-blue-800 dark:text-blue-200">
            {done}/{total}
            {progressFailed > 0 ? ` · ${progressFailed} issue(s)` : ""}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-medium text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100"
      role="status"
      aria-live="polite"
    >
      All transactions synced
    </div>
  );
}
