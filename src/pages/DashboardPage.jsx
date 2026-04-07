import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useOfflineStore } from "../stores/offlineStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatMoney } from "../utils/currency";
import { useAuthStore } from "../stores/authStore";
import { useAdminSalesFeed } from "../hooks/useAdminSalesFeed";
import { useEffect } from "react";
import { useNotificationStore } from "../stores/notificationStore";
import { useOnboardingStatus } from "../hooks/useOnboarding";
import ExpandableSection from "../components/ui/ExpandableSection";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { useAdminDailyClose, useReliabilitySummary } from "../hooks/useSystem";
import { useToastStore } from "../stores/toastStore";

function getSyncRecovery(errorCode, errorMessage) {
  const code = errorCode || "";
  const message = String(errorMessage || "").toLowerCase();
  if (code === "INSUFFICIENT_STOCK" || code === "INVENTORY_CONFLICT" || message.includes("stock")) {
    return {
      title: "Inventory conflict",
      guidance: "Stock changed before sync completed. Review inventory, then retry sync.",
      cta: "Review inventory",
      to: "/inventory",
    };
  }
  if (code === "VALIDATION_FAILED") {
    return {
      title: "Sale data needs correction",
      guidance: "One queued sale is invalid. Open POS and re-submit the sale.",
      cta: "Open POS",
      to: "/pos",
    };
  }
  return {
    title: "Temporary sync delay",
    guidance: "Connection or server delay detected. Retry now and keep the app open.",
    cta: "Open sync controls",
    to: "/settings",
  };
}

function getConfidence(summary) {
  if (!summary) return "Attention needed";
  if (summary.openSyncFailures > 0 || summary.stockMismatchCriticalCount > 0) return "Attention needed";
  if (summary.stockMismatchWarningCount > 0 || (summary.syncSuccessRate || 0) < 0.98) return "Medium";
  return "High";
}

export default function DashboardPage() {
  const { data: stats, isLoading, isError } = useDashboardStats();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingTransactions = useOfflineStore((s) => s.pendingTransactions);
  const failedTransactions = useOfflineStore((s) => s.failedTransactions);
  const lastSyncError = useOfflineStore((s) => s.lastSyncError);
  const lastSyncCode = useOfflineStore((s) => s.lastSyncCode);
  const lastSyncedAt = useOfflineStore((s) => s.lastSyncedAt);
  const queueLastAttemptAt = useOfflineStore((s) => s.queueLastAttemptAt);
  const queueNextRetryAt = useOfflineStore((s) => s.queueNextRetryAt);
  const queueReplayOrder = useOfflineStore((s) => s.queueReplayOrder);
  const settings = useSettingsStore((s) => s.settings);
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ADMIN";
  const { data: salesFeed = [] } = useAdminSalesFeed();
  const { data: reliability } = useReliabilitySummary(isAdmin);
  const { data: dailyClose, confirmDailyClose } = useAdminDailyClose(isAdmin);
  const { syncQueue } = useOfflineSync();
  const showToast = useToastStore((s) => s.showToast);
  const { data: onboarding } = useOnboardingStatus();
  const upsertLowStockNotifications = useNotificationStore((s) => s.upsertLowStockNotifications);
  const notifications = useNotificationStore((s) => s.notifications);

  useEffect(() => {
    upsertLowStockNotifications(stats?.lowStockProducts || []);
  }, [stats?.lowStockProducts, upsertLowStockNotifications]);

  const cards = useMemo(
    () => [
      ["Revenue (today)", formatMoney(stats?.revenue || 0, settings.currencySymbol)],
      ["Transactions (today)", stats?.transactions ?? 0],
      ["Low stock products", stats?.lowStock ?? 0],
      ["Active customers", stats?.customers ?? 0],
      ["Returning customers", stats?.returningCustomers ?? 0],
    ],
    [settings.currencySymbol, stats?.customers, stats?.lowStock, stats?.returningCustomers, stats?.revenue, stats?.transactions]
  );
  const salesBlockFreshness = pendingTransactions > 0 ? "includes local pending" : "synced-only";
  const stockBlockFreshness = pendingTransactions > 0 ? "includes local pending" : "synced-only";
  const activityBlockFreshness = "synced-only";
  const syncRecovery = getSyncRecovery(lastSyncCode, lastSyncError);
  const confidence = getConfidence(reliability);
  const confidenceTone =
    confidence === "High"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
      : confidence === "Medium"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
        : "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300";
  const staffSummary = salesFeed.reduce((acc, sale) => {
    const key = sale.sellerName || "Unknown";
    if (!acc[key]) acc[key] = { sellerName: key, total: 0, count: 0 };
    acc[key].total += Number(sale.totalAmount || 0);
    acc[key].count += 1;
    return acc;
  }, {});
  const staffLeaderboard = Object.values(staffSummary)
    .map((row) => ({
      ...row,
      average: row.count > 0 ? row.total / row.count : 0,
    }))
    .sort((a, b) => b.total - a.total);
  const trustSummaryText = `POSflyt Sync Update: Pending ${pendingTransactions}, Failed ${failedTransactions}, Duplicates prevented ${reliability?.failureCohorts?.byCode?.DUPLICATE_ID || 0}, Last synced ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "Not yet"}, Reconciliation: ${confidence}.`;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Dashboard</h1>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Not synced yet"} · Data
          mode: {pendingTransactions > 0 ? "includes pending local sales" : "synced-only"}
        </p>
      </header>

      {failedTransactions > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          {lastSyncError?.toLowerCase().includes("stock unavailable")
            ? "Some sales did not sync because stock changed. Review inventory, then retry sync."
            : "Some sales are not synced yet. Open Settings and tap Sync Now."}
          <div className="mt-2 flex gap-2">
            <Link to="/settings" className="rounded bg-amber-600 px-2.5 py-1 text-white">
              Open Sync Controls
            </Link>
            <Link to="/inventory" className="rounded border border-amber-600 px-2.5 py-1">
              Review Inventory
            </Link>
          </div>
        </div>
      )}
      {!isOnline && (
        <p className="text-sm text-amber-800 dark:text-amber-400">
          Offline mode: showing cached stats when available.
        </p>
      )}
      {isError && (
        <p className="text-sm text-amber-800 dark:text-amber-400">
          Failed to fetch latest dashboard data. Cached data is shown when available.
        </p>
      )}
      {!!onboarding?.reminders?.length && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          {onboarding.reminders[0]}
        </div>
      )}
      {(pendingTransactions > 0 || failedTransactions > 0 || Number(stats?.lowStock || 0) > 0) && (
        <div className="grid gap-2 rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900">
          {!stats?.transactions && (
            <div className="rounded border border-teal-300 bg-teal-50 px-2 py-1.5 text-teal-900 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
              No sales yet today. Start with one checkout in POS.
              <Link to="/pos" className="ml-2 underline">
                Make sale
              </Link>
            </div>
          )}
          {pendingTransactions > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              You have unsynced transactions.
              <Link to="/settings" className="ml-2 underline">
                Fix my sync
              </Link>
            </div>
          )}
          {Number(stats?.lowStock || 0) > 0 && (
            <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
              Critical low stock detected.
              <Link to="/inventory" className="ml-2 underline">
                Review inventory
              </Link>
            </div>
          )}
        </div>
      )}
      {isLoading && <p className="text-sm text-stone-500 dark:text-stone-400">Loading dashboard...</p>}
      {!isLoading && !isError && (stats?.transactions ?? 0) === 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-900/20 dark:text-teal-300">
          <p className="font-medium">No sales today</p>
          <p className="mt-1 text-xs opacity-90">Add a product, then complete a sale in POS.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link to="/inventory" className="rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white">
              Add first product
            </Link>
            <Link
              to="/pos"
              className="rounded border border-teal-600 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300"
            >
              Go to POS
            </Link>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Quick actions
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/inventory"
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
          >
            Add product
          </Link>
          <Link to="/pos" className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600">
            Make sale
          </Link>
          <Link to="/help" className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600">
            Send feedback
          </Link>
        </div>
      </section>

      <div>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Today&apos;s metrics</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">Sales cards: {salesBlockFreshness}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map(([k, v]) => (
            <article
              key={k}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <p className="text-sm text-stone-600 dark:text-stone-400">{k}</p>
              <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">{v}</p>
            </article>
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Low stock alerts</h2>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Freshness: {stockBlockFreshness}</p>
        <div className="mt-3 space-y-2">
          {(stats?.lowStockProducts || []).length ? (
            stats.lowStockProducts.map((product) => (
              <div
                key={product.id}
                className={`rounded-lg border px-3 py-2 text-sm ${product.isCritical ? "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300" : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"}`}
              >
                {product.name}: {product.stock} left (threshold {product.lowStockThreshold})
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-500 dark:text-stone-400">No low stock alerts.</p>
          )}
        </div>
      </section>

      <ExpandableSection title="Notifications" className="shadow-sm">
        <div className="space-y-2">
          {notifications.length ? (
            notifications.map((note) => (
              <div key={note.id} className="rounded border border-stone-200 px-3 py-2 text-sm dark:border-stone-700">
                {note.message}
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-500 dark:text-stone-400">No notifications.</p>
          )}
        </div>
      </ExpandableSection>

      <ExpandableSection title="Trust Center (sync & reliability)" defaultOpen={false} className={`shadow-sm ${confidenceTone}`}>
        <div className="space-y-3 text-stone-900 dark:text-stone-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Confidence</span>
            <span className="rounded border border-current px-2 py-0.5 text-xs">{confidence}</span>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              Synced (24h):{" "}
              {Math.max(Number(reliability?.window === "24h" ? Math.round((reliability?.syncSuccessRate || 0) * 100) : 0), 0)}%
            </div>
            <div>Pending: {pendingTransactions}</div>
            <div>Failed: {failedTransactions}</div>
            <div>Duplicates prevented: {reliability?.failureCohorts?.byCode?.DUPLICATE_ID || 0}</div>
            <div>Last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Not synced yet"}</div>
            <div>Reconciliation: {reliability?.lastReconciliationStatus || "Unknown"}</div>
          </div>
          <p className="text-xs">
            {queueReplayOrder}{" "}
            {queueLastAttemptAt ? `Last retry: ${new Date(queueLastAttemptAt).toLocaleString()}.` : ""}
            {queueNextRetryAt ? ` Next retry: ${new Date(queueNextRetryAt).toLocaleString()}.` : ""}
          </p>
          {(failedTransactions > 0 || lastSyncError) && (
            <div className="rounded-lg border border-current/40 bg-white/70 px-3 py-2 text-xs dark:bg-stone-950/20">
              <p className="font-semibold">Fix my sync — {syncRecovery.title}</p>
              <p className="mt-1">{syncRecovery.guidance}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={async () => {
                try {
                  await syncQueue(true);
                  showToast("Sync started. Status updated in Trust Center.", "success");
                } catch {
                  showToast("Could not start sync now.", "error");
                }
              }}
              className="rounded bg-teal-700 px-2.5 py-1 text-white dark:bg-teal-500 dark:text-stone-950"
            >
              Fix my sync
            </button>
            <Link to="/inventory" className="rounded border border-current px-2.5 py-1">
              Review inventory
            </Link>
            <Link to="/settings" className="rounded border border-current px-2.5 py-1">
              View reliability details
            </Link>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(trustSummaryText);
                showToast("Reliability summary copied.", "success");
              }}
              className="rounded border border-current px-2.5 py-1"
            >
              Copy summary
            </button>
          </div>
        </div>
      </ExpandableSection>

      {isAdmin && (
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Live sales activity</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Feed freshness: {activityBlockFreshness}</p>
          <div className="mt-3 space-y-2">
            {salesFeed.length ? (
              salesFeed.map((sale) => (
                <div
                  key={sale.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
                >
                  <span className="font-medium">{sale.sellerName}</span>
                  <span>{formatMoney(sale.totalAmount, settings.currencySymbol)}</span>
                  <span>{new Date(sale.createdAt).toLocaleTimeString()}</span>
                  <span className="rounded bg-stone-200 px-2 py-0.5 text-xs dark:bg-stone-800">
                    {sale.paymentMethod}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">No recent sales activity.</p>
            )}
          </div>
        </section>
      )}
      {isAdmin && (
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Staff accountability</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Today&apos;s sales by staff with simple accountability metrics.
          </p>
          <div className="mt-3 space-y-2">
            {staffLeaderboard.length ? (
              staffLeaderboard.map((staff) => (
                <div
                  key={staff.sellerName}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
                >
                  <p className="font-medium">{staff.sellerName}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Sales: {formatMoney(staff.total, settings.currencySymbol)} · Transactions: {staff.count} · Average:{" "}
                    {formatMoney(staff.average, settings.currencySymbol)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">No staff sales recorded today.</p>
            )}
          </div>
        </section>
      )}
      {isAdmin && (
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Daily close checklist</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Confirm today&apos;s totals and close the day with variance flags.
          </p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>Total revenue: {formatMoney(Number(dailyClose?.totalRevenue || 0), settings.currencySymbol)}</div>
            <div>Transaction count: {dailyClose?.transactionCount || 0}</div>
            <div>Status: {dailyClose?.isClosed ? "Closed" : "Open"}</div>
            <div>
              Closed at: {dailyClose?.closedAt ? new Date(dailyClose.closedAt).toLocaleString() : "Not closed yet"}
            </div>
          </div>
          {!!dailyClose?.varianceFlags?.length && (
            <ul className="mt-3 space-y-1 text-xs text-amber-800 dark:text-amber-300">
              {dailyClose.varianceFlags.map((flag) => (
                <li key={flag}>- {flag}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={dailyClose?.isClosed || confirmDailyClose.isPending}
              onClick={async () => {
                try {
                  await confirmDailyClose.mutateAsync();
                  showToast("Day closed successfully.", "success");
                } catch {
                  showToast("Could not close day.", "error");
                }
              }}
              className="rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950"
            >
              {dailyClose?.isClosed ? "Day closed" : "Confirm daily close"}
            </button>
            <Link to="/staff" className="rounded border border-stone-300 px-3 py-1.5 text-xs dark:border-stone-600">
              Review staff
            </Link>
          </div>
        </section>
      )}
    </section>
  );
}
