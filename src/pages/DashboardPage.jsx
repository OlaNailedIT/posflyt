import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { getOwnerDailySummary, getTransactionByClientId, getUsageFeatures } from "../services/api";
import { useOfflineStore } from "../stores/offlineStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatMoney } from "../utils/currency";
import { useAuthStore } from "../stores/authStore";
import { useAdminSalesFeed } from "../hooks/useAdminSalesFeed";
import { useNotificationStore } from "../stores/notificationStore";
import { useOnboardingStatus } from "../hooks/useOnboarding";
import DashboardModeToggle from "../components/dashboard/DashboardModeToggle";
import { USER_MODE } from "../config/userMode";
import { useUserModeStore } from "../stores/userModeStore";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { useSubscription } from "../hooks/useBilling";
import SubscriptionBanner from "../components/SubscriptionBanner";
import { useAdminDailyClose, useReliabilitySummary } from "../hooks/useSystem";
import { useToastStore } from "../stores/toastStore";
import { can } from "../utils/permissions";
import { digitsForWhatsApp } from "../utils/whatsappReceipt";
import CashierDashboard from "./dashboard/CashierDashboard";
import OwnerDashboard from "./dashboard/OwnerDashboard";

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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientTransactionLookup = searchParams.get("clientTransactionId")?.trim() || "";
  const { data: stats, isLoading, isError, error } = useDashboardStats();
  const { data: usageFeatures } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });
  const lowStockAlertsOn = usageFeatures?.flags?.LOW_STOCK_ALERTS !== false;
  const dailySummaryOwnerOn = usageFeatures?.flags?.DAILY_SUMMARY_OWNER !== false;
  const { data: subscription } = useSubscription();
  const subscriptionBlocked =
    (subscription && subscription.subscriptionActive === false) ||
    (isError && error?.response?.status === 403);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const syncing = useOfflineStore((s) => s.syncing);
  const { data: checkoutLookupTx, isLoading: checkoutLookupLoading, isError: checkoutLookupError } = useQuery({
    queryKey: ["transaction-by-client-id", clientTransactionLookup],
    queryFn: async () => {
      try {
        const body = await getTransactionByClientId(clientTransactionLookup);
        return body?.transaction ?? null;
      } catch (e) {
        if (e?.response?.status === 404) return null;
        throw e;
      }
    },
    enabled: Boolean(clientTransactionLookup.length >= 8 && isOnline),
    staleTime: 0,
  });

  const clearCheckoutLookup = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("clientTransactionId");
    setSearchParams(next, { replace: true });
  };
  const pendingTransactions = useOfflineStore((s) => s.pendingTransactions);
  const failedTransactions = useOfflineStore((s) => s.failedTransactions);
  const lastSyncError = useOfflineStore((s) => s.lastSyncError);
  const lastSyncCode = useOfflineStore((s) => s.lastSyncCode);
  const lastSyncedAt = useOfflineStore((s) => s.lastSyncedAt);
  const queueLastAttemptAt = useOfflineStore((s) => s.queueLastAttemptAt);
  const queueNextRetryAt = useOfflineStore((s) => s.queueNextRetryAt);
  const queueReplayOrder = useOfflineStore((s) => s.queueReplayOrder);
  const settings = useSettingsStore((s) => s.settings);
  const ownerPhoneDigits = digitsForWhatsApp(settings.businessPhone);
  const ownerPhoneOk = ownerPhoneDigits.length >= 8 && ownerPhoneDigits.length <= 15;
  const role = useAuthStore((s) => s.user?.role);
  const isCashier = role === "CASHIER";
  const canAccessSettings = can(role, "accessSettings");
  const canViewReports = can(role, "viewReports");
  const ownerCanToggleDashboard =
    (role === "ADMIN" || role === "MANAGER") && canViewReports;
  const dashboardMode = useUserModeStore((s) => s.dashboardMode);
  const showCashierUi = isCashier || (ownerCanToggleDashboard && dashboardMode === USER_MODE.CASHIER);
  const isAdmin = role === "ADMIN";
  const canDailyClose = role === "ADMIN" || role === "MANAGER";
  const [closeDayModalOpen, setCloseDayModalOpen] = useState(false);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);
  const showManagerExtra = !showCashierUi && showDetailedAnalytics;
  const { data: salesFeedData, isError: salesFeedError, error: salesFeedQueryError } = useAdminSalesFeed();
  const salesFeed = salesFeedData?.list ?? [];
  const salesFeedUnavailable =
    Boolean(salesFeedData?.unavailable) ||
    (salesFeedError && salesFeedQueryError?.response?.status === 500);
  const { data: reliability } = useReliabilitySummary(isAdmin);
  const { data: dailyClose, confirmDailyClose } = useAdminDailyClose(canDailyClose);
  const { syncQueue } = useOfflineSync();
  const showToast = useToastStore((s) => s.showToast);
  const { data: ownerDailySummary, isLoading: ownerSummaryLoading } = useQuery({
    queryKey: ["reports", "owner-daily-summary"],
    queryFn: getOwnerDailySummary,
    staleTime: 60_000,
    enabled: Boolean(dailySummaryOwnerOn && canViewReports && !subscriptionBlocked),
  });
  const { data: onboarding } = useOnboardingStatus();
  const upsertLowStockNotifications = useNotificationStore((s) => s.upsertLowStockNotifications);
  const notifications = useNotificationStore((s) => s.notifications);

  useEffect(() => {
    upsertLowStockNotifications(stats?.lowStockProducts || [], lowStockAlertsOn);
  }, [stats?.lowStockProducts, upsertLowStockNotifications, lowStockAlertsOn]);

  useEffect(() => {
    if (location.hash !== "#sync-trust") return;
    setShowDetailedAnalytics(true);
    const t = window.setTimeout(() => {
      document.getElementById("sync-trust")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [location.hash, location.pathname]);

  const managerSecondaryMetricCards = useMemo(
    () => [
      ...(lowStockAlertsOn ? [["Low stock products", stats?.lowStock ?? 0]] : []),
      ["Active customers", stats?.customers ?? 0],
      ["Returning customers", stats?.returningCustomers ?? 0],
    ],
    [lowStockAlertsOn, stats?.customers, stats?.lowStock, stats?.returningCustomers]
  );
  const salesBlockFreshness = pendingTransactions > 0 ? "includes local pending" : "synced-only";
  const stockBlockFreshness = pendingTransactions > 0 ? "includes local pending" : "synced-only";
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

  const ownerDashboardProps = {
    location,
    isOnline,
    dailySummaryOwnerOn,
    usageFeatures,
    ownerDailySummary,
    ownerSummaryLoading,
    stats,
    isLoading,
    isError,
    subscriptionBlocked,
    canViewReports,
    role,
    isAdmin,
    showDetailedAnalytics,
    setShowDetailedAnalytics,
    showManagerExtra,
    settings,
    syncQueue,
    showToast,
    ownerPhoneDigits,
    ownerPhoneOk,
    lowStockAlertsOn,
    salesFeedUnavailable,
    salesFeed,
    staffLeaderboard,
    closeDayModalOpen,
    setCloseDayModalOpen,
    canDailyClose,
    dailyClose,
    confirmDailyClose,
    notifications,
    trustSummaryText,
    confidenceTone,
    confidence,
    reliability,
    pendingTransactions,
    failedTransactions,
    lastSyncedAt,
    queueReplayOrder,
    queueLastAttemptAt,
    queueNextRetryAt,
    lastSyncError,
    syncRecovery,
    canAccessSettings,
    salesBlockFreshness,
    stockBlockFreshness,
    managerSecondaryMetricCards,
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
            {showCashierUi ? "Today" : "Dashboard"}
          </h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Not synced yet"} · Data
            mode: {pendingTransactions > 0 ? "includes pending local sales" : "synced-only"}
          </p>
        </div>
        {ownerCanToggleDashboard ? <DashboardModeToggle /> : null}
      </header>

      <div className="space-y-3" role="region" aria-label="Operational alerts">
        {subscription && <SubscriptionBanner subscription={subscription} />}
        {subscriptionBlocked && (
          <div
            className="rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
            role="alert"
          >
            <p className="font-bold">Subscription or trial inactive</p>
            <p className="mt-1 text-xs opacity-90">
              Choose a plan to restore full dashboard and analytics access.
            </p>
            <Link
              to="/billing"
              className="mt-2 inline-flex rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950"
            >
              View billing
            </Link>
          </div>
        )}
        {failedTransactions > 0 && (
          <div
            className="rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 text-sm font-semibold text-red-950 shadow-sm dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
            role="alert"
          >
            <p className="text-base font-bold">Sync needs attention</p>
            <p className="mt-1 text-sm font-normal">
              {lastSyncError?.toLowerCase().includes("stock unavailable")
                ? "Some sales did not sync because stock changed. Review inventory, then retry sync."
                : canAccessSettings
                  ? "Some sales are not synced yet. Open Settings and tap Sync Now."
                  : "Some sales are not synced yet. Ask a manager to open Settings and tap Sync Now."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm font-semibold">
              {canAccessSettings ? (
                <Link to="/settings" className="rounded-lg bg-red-700 px-3 py-1.5 text-white dark:bg-red-600">
                  Open sync controls
                </Link>
              ) : (
                <span className="rounded-lg bg-red-100 px-3 py-1.5 text-red-950 dark:bg-red-950/40">
                  Ask a manager to open Settings and tap Sync Now.
                </span>
              )}
              <Link to="/inventory" className="rounded-lg border-2 border-red-700 px-3 py-1.5 text-red-900 dark:border-red-600 dark:text-red-100">
                Review inventory
              </Link>
            </div>
          </div>
        )}
        {(pendingTransactions > 0 ||
          failedTransactions > 0 ||
          (lowStockAlertsOn && Number(stats?.lowStock || 0) > 0)) && (
          <div className="grid gap-2 rounded-xl border-2 border-stone-300 bg-white p-3 text-sm font-medium dark:border-stone-600 dark:bg-stone-900">
            {!stats?.transactions && (
              <div className="rounded-lg border border-teal-400 bg-teal-50 px-2 py-1.5 text-teal-950 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                No sales yet today. Start with one checkout in POS.
                <Link to="/pos" className="ml-2 font-semibold underline">
                  Make sale
                </Link>
              </div>
            )}
            {pendingTransactions > 0 && (
              <div className="rounded-lg border border-amber-400 bg-amber-50 px-2 py-1.5 text-amber-950 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                You have unsynced transactions.
                {canAccessSettings ? (
                  <Link to="/settings" className="ml-2 font-semibold underline">
                    Fix my sync
                  </Link>
                ) : (
                  <span className="ml-2">A manager can sync from Settings when online.</span>
                )}
              </div>
            )}
            {lowStockAlertsOn && Number(stats?.lowStock || 0) > 0 && (
              <div className="rounded-lg border-2 border-red-500 bg-red-50 px-2 py-1.5 font-bold text-red-950 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                Low stock: {stats?.lowStock} product(s) need attention.
                <Link to="/inventory" className="ml-2 font-bold underline">
                  Review inventory
                </Link>
              </div>
            )}
          </div>
        )}
        {!isOnline && (
          <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            Offline mode: showing cached stats when available.
          </p>
        )}
        {isError && (
          <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            Failed to fetch latest dashboard data. Cached data is shown when available.
          </p>
        )}
        {!!onboarding?.reminders?.length && (
          <div className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            {onboarding.reminders[0]}
          </div>
        )}
      </div>

      {clientTransactionLookup.length >= 8 && (
        <div
          className="rounded-xl border border-teal-200 bg-teal-50/90 p-4 text-sm dark:border-teal-800 dark:bg-teal-950/40"
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-teal-900 dark:text-teal-100">Checkout lookup</h2>
              <p className="mt-1 font-mono text-xs text-teal-800/90 dark:text-teal-200/90">
                {clientTransactionLookup}
              </p>
            </div>
            <button
              type="button"
              onClick={clearCheckoutLookup}
              className="shrink-0 rounded-lg border border-teal-300 bg-white px-2 py-1 text-xs font-medium text-teal-900 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-900 dark:text-teal-100 dark:hover:bg-teal-800"
            >
              Dismiss
            </button>
          </div>
          {!isOnline && (
            <p className="mt-2 text-teal-800 dark:text-teal-200">Connect to the internet to look up this sale.</p>
          )}
          {isOnline && checkoutLookupLoading && (
            <p className="mt-2 text-teal-800 dark:text-teal-200">Checking server…</p>
          )}
          {isOnline && checkoutLookupError && (
            <p className="mt-2 text-red-800 dark:text-red-200">
              Could not reach the server. Try again when the connection is stable.
            </p>
          )}
          {isOnline && !checkoutLookupLoading && !checkoutLookupError && checkoutLookupTx && (
            <p className="mt-2 text-teal-900 dark:text-teal-100">
              <strong>This sale is on record.</strong> Total{" "}
              {formatMoney(Number(checkoutLookupTx.totalAmount ?? checkoutLookupTx.total ?? 0), settings.currencySymbol)}
              {checkoutLookupTx.createdAt
                ? ` · ${new Date(checkoutLookupTx.createdAt).toLocaleString()}`
                : ""}
            </p>
          )}
          {isOnline && !checkoutLookupLoading && !checkoutLookupError && checkoutLookupTx === null && (
            <p className="mt-2 text-amber-900 dark:text-amber-200">
              No sale with this checkout ID yet. If you just paid, wait a moment and use &quot;Check transaction
              status&quot; on POS, or confirm in your sales history before charging again.
            </p>
          )}
        </div>
      )}

      {showCashierUi ? (
        <CashierDashboard
          stats={stats}
          settings={settings}
          isLoading={isLoading}
          lowStockAlertsOn={lowStockAlertsOn}
          usageFeatures={usageFeatures}
          pendingTransactions={pendingTransactions}
          failedTransactions={failedTransactions}
          lastSyncedAt={lastSyncedAt}
          syncing={syncing}
          isOnline={isOnline}
        />
      ) : (
        <OwnerDashboard o={ownerDashboardProps} />
      )}
    </section>
  );
}
