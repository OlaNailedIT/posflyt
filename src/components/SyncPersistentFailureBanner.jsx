import { Link } from "react-router-dom";
import { useOfflineStore } from "../stores/offlineStore";
import { useAuthStore } from "../stores/authStore";
import { can } from "../utils/permissions";

const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * When sync issues persist, show a calm, non-alarming hint after several minutes.
 */
export default function SyncPersistentFailureBanner() {
  const failedTransactions = useOfflineStore((s) => s.failedTransactions);
  const queueLastAttemptAt = useOfflineStore((s) => s.queueLastAttemptAt);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const role = useAuthStore((s) => s.user?.role);
  const canAccessSettings = can(role, "accessSettings");

  const failed = Number(failedTransactions || 0);
  const lastAttempt = queueLastAttemptAt ? Number(queueLastAttemptAt) : 0;
  const stale =
    failed > 0 &&
    lastAttempt > 0 &&
    Date.now() - lastAttempt >= FIVE_MIN_MS;

  if (!stale || !isOnline) return null;

  return (
    <div
      className="border-b border-stone-200 bg-stone-100/95 px-4 py-2.5 text-center text-sm text-stone-800 dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-200"
      role="status"
      aria-live="polite"
    >
      Still having trouble syncing? Check your internet connection
      {canAccessSettings ? (
        <>
          {" "}
          or open{" "}
          <Link to="/settings" className="font-medium text-teal-800 underline dark:text-teal-400">
            Settings → Sync
          </Link>
        </>
      ) : null}
      . If this continues, contact support from Help.
    </div>
  );
}
