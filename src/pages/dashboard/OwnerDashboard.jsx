import { Link } from "react-router-dom";
import ExpandableSection from "../../components/ui/ExpandableSection";
import DashboardLayoutV2 from "./DashboardLayoutV2";
import { formatMoney } from "../../utils/currency";
import { can } from "../../utils/permissions";
import { VALIDATION_MODE } from "../../config/productMode";
import {
  buildOwnerDailySummaryWhatsAppChooseContact,
  buildOwnerDailySummaryWhatsAppUrl,
  formatOwnerDailySummaryMessage,
} from "../../utils/dailyOwnerSummaryWhatsApp";

/**
 * Owner / intelligence dashboard: profit, health, operations, detailed analytics.
 * @param {object} props
 * @param {object} props.o — all data and callbacks from `DashboardPage`
 */
export default function OwnerDashboard({ o }) {
  const {
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
    onboarding,
    salesBlockFreshness,
    stockBlockFreshness,
    managerSecondaryMetricCards,
  } = o;

  return (
    <>
      {!subscriptionBlocked &&
        canViewReports &&
        (dailySummaryOwnerOn || usageFeatures?.flags?.DAILY_PROFIT_SUMMARY) && (
          <>
            <DashboardLayoutV2
              executive={{
                ownerSummary: dailySummaryOwnerOn ? ownerDailySummary : null,
                statsFallback: stats,
                loading: dailySummaryOwnerOn ? ownerSummaryLoading : isLoading,
                currencySymbol: settings.currencySymbol,
              }}
              businessStatus={{
                summaryForInsights:
                  dailySummaryOwnerOn && ownerDailySummary
                    ? ownerDailySummary
                    : {
                        grossProfit: stats?.grossProfit,
                        totalExpenses: stats?.totalExpenses,
                        netProfit: stats?.netProfit ?? stats?.dailyProfit ?? stats?.profit,
                      },
                isAdmin,
                subscriptionBlocked,
              }}
              operations={{
                role,
                canViewReports,
                canEditProducts: can(role, "editProducts"),
                lowStockAlertsOn,
                stats,
                settings,
                salesFeed: isAdmin ? salesFeed : null,
                salesFeedUnavailable: isAdmin ? salesFeedUnavailable : false,
                stockBlockFreshness,
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDetailedAnalytics((v) => !v)}
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
              >
                {showDetailedAnalytics ? "Hide detailed analytics" : "View detailed analytics"}
              </button>
            </div>
          </>
        )}

      {showManagerExtra && usageFeatures?.flags?.DAILY_PROFIT_SUMMARY && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Daily financial snapshot</h2>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            Today ({stats?.calendar?.timeZone ?? "UTC"}){stats?.date ? ` · ${stats.date}` : ""}
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <dt className="text-stone-500 dark:text-stone-400">Sales (net)</dt>
              <dd className="font-semibold text-stone-900 dark:text-stone-100">
                {formatMoney(stats?.revenue ?? 0, settings.currencySymbol)}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500 dark:text-stone-400">COGS</dt>
              <dd className="font-semibold text-amber-800 dark:text-amber-200">
                {formatMoney(stats?.cogs ?? 0, settings.currencySymbol)}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500 dark:text-stone-400">Gross profit</dt>
              <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
                {formatMoney(stats?.grossProfit ?? 0, settings.currencySymbol)}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500 dark:text-stone-400">Expenses</dt>
              <dd className="font-semibold text-orange-700 dark:text-orange-300">
                {formatMoney(stats?.totalExpenses ?? 0, settings.currencySymbol)}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500 dark:text-stone-400">Net profit</dt>
              <dd
                className={`font-semibold ${
                  (stats?.netProfit ?? stats?.dailyProfit ?? stats?.profit ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatMoney(stats?.netProfit ?? stats?.dailyProfit ?? stats?.profit ?? 0, settings.currencySymbol)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            Costs are fixed at sale time. Net profit = gross profit − expenses.{" "}
            {usageFeatures?.flags?.EXPENSES ? (
              <Link to="/expenses" className="text-teal-700 underline dark:text-teal-400">
                Expenses
              </Link>
            ) : null}
          </p>
        </div>
      )}

      {showManagerExtra && dailySummaryOwnerOn && canViewReports && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Daily summary to owner</h2>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            Opens WhatsApp with a prefilled summary using your business time zone for “today”.
          </p>
          {ownerSummaryLoading ? (
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Loading today&apos;s figures…</p>
          ) : ownerDailySummary ? (
            <>
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                Day {ownerDailySummary.dateKey} · {ownerDailySummary.calendar?.timeZone ?? "UTC"}
                {ownerDailySummary.calendar?.timeZoneFallback
                  ? " (time zone invalid — UTC bounds used)"
                  : ""}
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-stone-100 bg-stone-50 p-3 text-sm text-stone-800 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100">
                {formatOwnerDailySummaryMessage(ownerDailySummary, settings.currencySymbol)}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!ownerPhoneOk}
                  onClick={() => {
                    const msg = formatOwnerDailySummaryMessage(ownerDailySummary, settings.currencySymbol);
                    const url = buildOwnerDailySummaryWhatsAppUrl(ownerPhoneDigits, msg);
                    if (!url) {
                      showToast("Add your business phone in Settings with country code (8–15 digits).", "error");
                      return;
                    }
                    window.open(url, "_blank", "noopener,noreferrer");
                    showToast("WhatsApp opened — tap Send to share your daily summary.", "success");
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: "#25D366" }}
                >
                  Send via WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const msg = formatOwnerDailySummaryMessage(ownerDailySummary, settings.currencySymbol);
                    window.open(buildOwnerDailySummaryWhatsAppChooseContact(msg), "_blank", "noopener,noreferrer");
                    showToast("WhatsApp opened — choose a contact, then tap Send.", "success");
                  }}
                  className="rounded-lg border border-emerald-700 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100"
                >
                  Pick contact in WhatsApp
                </button>
                <Link
                  to="/settings"
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
                >
                  Business phone and time zone
                </Link>
              </div>
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                If WhatsApp does not open, copy the text above into any chat. Configure phone and IANA time zone in
                Settings.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">Could not load today&apos;s summary.</p>
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

      {canDailyClose && (
        <section className="rounded-xl border-2 border-stone-300 bg-white p-4 shadow-sm dark:border-stone-600 dark:bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Daily close</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Record today&apos;s totals for your books ({dailyClose?.calendar?.timeZone ?? "UTC"} · business day{" "}
            {dailyClose?.businessDayKey ?? dailyClose?.date ?? "—"}). Figures run from the start of the business day
            through now.
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={dailyClose?.isClosed || confirmDailyClose.isPending}
              onClick={() => setCloseDayModalOpen(true)}
              className="rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950"
            >
              {dailyClose?.isClosed ? "Day closed" : "Close day"}
            </button>
            {isAdmin ? (
              <Link to="/staff" className="rounded border border-stone-300 px-3 py-1.5 text-xs dark:border-stone-600">
                Review staff
              </Link>
            ) : null}
          </div>
        </section>
      )}

      {showManagerExtra ? (
        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Additional metrics</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">Sales cards: {salesBlockFreshness}</p>
          </div>
          <div
            className={`grid gap-4 sm:grid-cols-2 ${lowStockAlertsOn ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
          >
            {managerSecondaryMetricCards.map(([k, v]) => (
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
      ) : null}

      {showManagerExtra && (
        <ExpandableSection title="Smart alerts" className="shadow-sm">
          <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
            Tap an action to jump to inventory or sync. Alerts also appear in the header bell.
          </p>
          <div className="space-y-2">
            {notifications.length ? (
              notifications.map((note) => (
                <div
                  key={note.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded border border-stone-200 px-3 py-2 text-sm dark:border-stone-700"
                >
                  <span className="min-w-0 flex-1">{note.message}</span>
                  {note.actionRoute ? (
                    <Link
                      to={note.actionRoute}
                      className="shrink-0 rounded bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
                    >
                      {note.actionText || "Open"}
                    </Link>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">No active alerts.</p>
            )}
          </div>
        </ExpandableSection>
      )}

      {showManagerExtra ? (
        <ExpandableSection
          key={location.hash === "#sync-trust" ? "trust-open" : "trust"}
          id="sync-trust"
          title="Trust Center (sync & reliability)"
          defaultOpen={location.hash === "#sync-trust"}
          className={`shadow-sm ${confidenceTone}`}
        >
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
      ) : null}

      {isAdmin && salesFeedUnavailable && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          Sales feed temporarily unavailable. The rest of the dashboard still works; try again shortly.
        </div>
      )}

      {isAdmin && showManagerExtra && (
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

      {closeDayModalOpen && canDailyClose && !dailyClose?.isClosed ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-day-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCloseDayModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl dark:bg-stone-900">
            <h3 id="close-day-title" className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              Close the day?
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              This records a daily close log for today with the totals below. You can only close once per business day.
            </p>
            <dl className="mt-3 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm dark:border-stone-600 dark:bg-stone-950">
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500 dark:text-stone-400">Today&apos;s sales (so far)</dt>
                <dd className="font-semibold text-stone-900 dark:text-stone-100">
                  {formatMoney(Number(dailyClose?.totalRevenue || 0), settings.currencySymbol)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500 dark:text-stone-400">Transactions</dt>
                <dd className="font-semibold text-stone-900 dark:text-stone-100">{dailyClose?.transactionCount ?? 0}</dd>
              </div>
            </dl>
            {!!dailyClose?.varianceFlags?.length && (
              <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">
                {dailyClose.varianceFlags.map((flag) => (
                  <li key={`m-${flag}`}>- {flag}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
                onClick={() => setCloseDayModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmDailyClose.isPending}
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950"
                onClick={async () => {
                  try {
                    await confirmDailyClose.mutateAsync();
                    setCloseDayModalOpen(false);
                    showToast("Day closed successfully.", "success");
                  } catch {
                    showToast("Could not close day.", "error");
                  }
                }}
              >
                {confirmDailyClose.isPending ? "Closing…" : "Confirm close"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
