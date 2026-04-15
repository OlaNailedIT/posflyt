import { useMemo } from "react";
import { usePendingCheckoutStore } from "../../stores/pendingCheckoutStore";

/**
 * In-memory checkout observability: online processing vs offline-queued vs failed.
 * Subscribes only to `pendingCheckoutStore.entries` (not offlineStore queue counts).
 */
export default function TransactionStatePanel() {
  const entries = usePendingCheckoutStore((s) => s.entries);
  const { pending, queued, failed } = useMemo(() => {
    let p = 0;
    let q = 0;
    let f = 0;
    for (const e of entries) {
      if (e.status === "pending") p += 1;
      else if (e.status === "queued") q += 1;
      else if (e.status === "failed") f += 1;
    }
    return { pending: p, queued: q, failed: f };
  }, [entries]);

  return (
    <div
      className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-left text-sm dark:border-stone-600 dark:bg-stone-900/70"
      role="status"
      aria-live="polite"
    >
      <p className="font-semibold text-stone-800 dark:text-stone-100">Transaction status</p>
      {import.meta.env.DEV ? (
        <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
          Tests: (1) DevTools → Network → <span className="font-medium">Offline</span> (2) airplane mode (3) keep
          Wi‑Fi on but stop the API server — checkout should still save locally and show counts here.
        </p>
      ) : null}
      <ul className="mt-2 space-y-2 text-stone-700 dark:text-stone-300">
        <li className="flex flex-wrap items-baseline gap-x-2">
          <span className="min-w-[10rem] font-medium">Processing (online)</span>
          <span className="tabular-nums">{pending}</span>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {pending > 0 ? "Awaiting server response" : "None in flight"}
          </span>
        </li>
        <li className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="min-w-[10rem] font-medium">Saved offline</span>
            <span className="tabular-nums">{queued}</span>
          </div>
          {queued > 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              Sale saved offline — will sync automatically when you&apos;re back online.
            </p>
          ) : (
            <p className="text-xs text-stone-500 dark:text-stone-500">None waiting in local queue</p>
          )}
        </li>
        <li className="flex flex-wrap items-baseline gap-x-2">
          <span className="min-w-[10rem] font-medium">Failed</span>
          <span className="tabular-nums">{failed}</span>
          {failed > 0 ? (
            <span className="text-xs font-medium text-red-700 dark:text-red-300">Needs attention</span>
          ) : (
            <span className="text-xs text-stone-500 dark:text-stone-500">None</span>
          )}
        </li>
      </ul>
    </div>
  );
}
