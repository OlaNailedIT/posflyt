import { formatMoney } from "../../utils/currency";

/**
 * Single executive view: revenue, net profit, expenses, transactions, top item.
 * Prefers `getOwnerDailySummary` payload; falls back to dashboard stats only when owner summary is unavailable.
 */
export default function ExecutiveSnapshot({ ownerSummary, statsFallback, loading, currencySymbol = "$" }) {
  const revenue = Number(
    ownerSummary?.totalSales ?? statsFallback?.revenue ?? 0
  );
  const netProfit = Number(
    ownerSummary?.netProfit ??
      statsFallback?.netProfit ??
      statsFallback?.dailyProfit ??
      statsFallback?.profit ??
      0
  );
  const expenses = Number(
    ownerSummary?.totalExpenses ?? statsFallback?.totalExpenses ?? 0
  );
  const transactions = Number(
    ownerSummary?.transactions ?? statsFallback?.transactions ?? 0
  );
  const topItem =
    ownerSummary?.topItemName ||
    statsFallback?.topSellingToday?.[0]?.name ||
    "—";
  const dateHint = ownerSummary?.dateKey
    ? `Business day ${ownerSummary.dateKey}`
    : statsFallback?.date
      ? String(statsFallback.date)
      : null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="h-5 w-48 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />
          ))}
        </div>
      </div>
    );
  }

  const netPositive = netProfit >= 0;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Executive snapshot
          </h2>
          <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-100">Today</p>
        </div>
        {dateHint ? (
          <p className="text-xs text-stone-500 dark:text-stone-400">{dateHint}</p>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950">
          <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">Revenue</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100">
            {formatMoney(revenue, currencySymbol)}
          </dd>
        </div>
        <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950">
          <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">Net profit</dt>
          <dd
            className={`mt-1 text-2xl font-bold tabular-nums ${
              netPositive ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {formatMoney(netProfit, currencySymbol)}
          </dd>
        </div>
        <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950">
          <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">Expenses</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100">
            {formatMoney(expenses, currencySymbol)}
          </dd>
        </div>
        <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950">
          <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">Transactions</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100">
            {transactions}
          </dd>
        </div>
        <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950">
          <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">Top item</dt>
          <dd className="mt-1 line-clamp-2 text-lg font-semibold text-stone-900 dark:text-stone-100">
            {topItem}
          </dd>
        </div>
      </dl>
    </div>
  );
}
