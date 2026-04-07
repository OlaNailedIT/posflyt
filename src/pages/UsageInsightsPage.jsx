import { Link } from "react-router-dom";
import { useUsageSummary } from "../hooks/useUsageInsights";

function pct(used, limit) {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
}

function Bar({ label, used, limit, softLimit }) {
  const p = pct(used, limit);
  const softPct =
    softLimit != null && limit > 0 ? Math.min(100, Math.round((softLimit / limit) * 1000) / 10) : null;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium text-stone-800 dark:text-stone-100">{label}</span>
        <span className="text-stone-600 dark:text-stone-400">
          {used.toLocaleString()} / {limit.toLocaleString()} ({p}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div
          className="h-full rounded-full bg-teal-600 transition-[width] dark:bg-teal-500"
          style={{ width: `${p}%` }}
        />
      </div>
      {softLimit != null && (
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-500">
          Soft warning from {softLimit.toLocaleString()} ({softPct}% of limit)
        </p>
      )}
    </div>
  );
}

export default function UsageInsightsPage() {
  const { data, isLoading, error } = useUsageSummary();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-stone-600 dark:text-stone-400">Loading usage…</div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-red-700 dark:text-red-400">
        Could not load usage. Please try again.
      </div>
    );
  }

  const q = data.quotas;
  const loyalty = data.loyalty;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Usage & retention</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Plan: <span className="font-semibold">{data.plan}</span> · Period {data.period}
        </p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">Quotas</h2>
        <div className="mt-4 space-y-5">
          <Bar
            label="Transactions (this month)"
            used={q.transactions.used}
            limit={q.transactions.limit}
            softLimit={q.transactions.softLimit}
          />
          <Bar label="Customers" used={q.customers.used} limit={q.customers.limit} softLimit={q.customers.softLimit} />
          <Bar label="Products / inventory items" used={q.products.used} limit={q.products.limit} softLimit={q.products.softLimit} />
          <Bar
            label="API requests (metered BI routes)"
            used={q.apiRequests.used}
            limit={q.apiRequests.limit}
            softLimit={q.apiRequests.softLimit}
          />
        </div>
        <p className="mt-4 text-xs text-stone-500 dark:text-stone-500">
          Hard limits return HTTP 429 with an upgrade message. Soft thresholds trigger warnings and emails (when
          configured).
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">Engagement & loyalty signals</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-stone-700 dark:text-stone-300">
          <li>Activity streak: {loyalty.activityStreakDays} day(s) with sales (rolling)</li>
          <li>Successful payments recorded: {loyalty.paidRenewals}</li>
          <li>Last onboarding activity: {loyalty.lastActiveAt ? new Date(loyalty.lastActiveAt).toLocaleString() : "—"}</li>
          <li>
            Loyalty offer eligibility (streak ≥ 7 &amp; ≥ 2 renewals):{" "}
            <span className="font-medium">{loyalty.loyaltyOfferEligible ? "Yes" : "No"}</span>
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/billing"
          className="inline-flex rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          Upgrade plan
        </Link>
        <Link
          to="/dashboard"
          className="inline-flex rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
