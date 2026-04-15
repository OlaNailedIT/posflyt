import { Link } from "react-router-dom";
import { formatMoney } from "../../utils/currency";

/**
 * Execution-focused dashboard: sell fast, minimal numbers, no profit/COGS/health scores.
 */
export default function CashierDashboard({
  stats,
  settings,
  isLoading,
  lowStockAlertsOn,
  usageFeatures,
  pendingTransactions,
  failedTransactions,
  lastSyncedAt,
  syncing,
  isOnline,
}) {
  const sym = settings?.currencySymbol ?? "$";
  const lowN = Number(stats?.lowStock ?? 0);

  const alerts = [];
  if (failedTransactions > 0) {
    alerts.push("Sync needs attention — ask a manager or open Settings.");
  } else if (pendingTransactions > 0) {
    alerts.push(`Offline queue: ${pendingTransactions} sale(s) waiting to sync.`);
  }
  if (lowStockAlertsOn && lowN > 0) {
    alerts.push(`${lowN} product(s) low on stock.`);
  }
  const alertLines = alerts.slice(0, 2);

  let syncLabel = "All synced";
  if (failedTransactions > 0) syncLabel = "Sync failed";
  else if (syncing) syncLabel = "Syncing…";
  else if (pendingTransactions > 0) syncLabel = `Queued: ${pendingTransactions}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/pos"
          className="flex min-h-[132px] flex-col items-center justify-center rounded-2xl bg-teal-600 px-6 py-10 text-center text-xl font-black tracking-tight text-white shadow-lg ring-2 ring-teal-700/30 transition hover:bg-teal-700 active:scale-[0.99] dark:bg-teal-500 dark:text-stone-950 dark:ring-teal-400/40 dark:hover:bg-teal-400 sm:col-span-2 lg:col-span-1"
        >
          <span className="text-2xl leading-none sm:text-3xl">Make sale</span>
          <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-white/90 dark:text-stone-900/80">
            Full POS
          </span>
        </Link>
        {usageFeatures?.flags?.QUICK_SALES_MODE !== false ? (
          <Link
            to="/pos/quick"
            className="flex min-h-[120px] flex-col items-center justify-center rounded-2xl border-2 border-teal-600 bg-white px-6 py-8 text-center text-lg font-bold text-teal-800 transition active:scale-[0.99] dark:border-teal-500 dark:bg-stone-900 dark:text-teal-200"
          >
            Quick sale
          </Link>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-600">
            Quick sale not enabled for this workspace.
          </div>
        )}
        <Link
          to="/inventory"
          className="flex min-h-[120px] flex-col items-center justify-center rounded-2xl border border-stone-300 bg-stone-50 px-6 py-8 text-center text-lg font-semibold text-stone-800 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
        >
          Scan / inventory
        </Link>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Today (sales only)
        </h2>
        {isLoading ? (
          <p className="mt-2 text-sm text-stone-500">Loading…</p>
        ) : (
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-stone-600 dark:text-stone-400">Revenue</dt>
              <dd className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100">
                {formatMoney(stats?.revenue ?? 0, sym)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-stone-600 dark:text-stone-400">Transactions</dt>
              <dd className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100">
                {stats?.transactions ?? 0}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="font-medium text-stone-800 dark:text-stone-200">Status</p>
        <ul className="mt-2 space-y-1 text-stone-600 dark:text-stone-400">
          <li>Network: {isOnline ? "Online" : "Offline"}</li>
          <li>Sync: {syncLabel}</li>
          <li>
            Stock alerts: {lowStockAlertsOn && lowN > 0 ? `${lowN} item(s)` : "OK"}
          </li>
          <li className="text-xs text-stone-500">
            Last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "—"}
          </li>
        </ul>
      </div>

      {alertLines.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          {alertLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
