import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getBillingLifecycleMetrics } from "../services/api";
import { useAdminBillingOverview } from "../hooks/useAdminBillingOverview";
import { useAuthStore } from "../stores/authStore";

/**
 * Phase 8: growth KPI snapshot for admins (MRR proxy + lifecycle; extend with warehouse/BI for CAC/LTV).
 */
export default function GrowthKpiPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const { data: overview, isLoading: ovLoading } = useAdminBillingOverview();
  const { data: lifecycle, isLoading: lcLoading } = useQuery({
    queryKey: ["billing-lifecycle-metrics"],
    queryFn: getBillingLifecycleMetrics,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  if (!isAdmin) {
    return (
      <div className="p-6 text-stone-600 dark:text-stone-400">Admin access required.</div>
    );
  }

  const rev = overview?.revenue;
  const chartData = rev
    ? [
        { name: "Day", value: rev.day },
        { name: "7d", value: rev.week },
        { name: "Month", value: rev.month },
      ]
    : [];

  return (
    <section className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Growth &amp; monetization KPIs</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Recorded payment revenue from your tenant (not global MRR). Connect a warehouse or export to GA4 for full-funnel CAC/LTV.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Today (paid)" value={ovLoading ? "…" : fmtMoney(rev?.day)} />
        <KpiCard label="Last 7 days" value={ovLoading ? "…" : fmtMoney(rev?.week)} />
        <KpiCard label="Month to date" value={ovLoading ? "…" : fmtMoney(rev?.month)} />
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Revenue bars (USD)</h2>
        <div className="mt-4 h-64">
          {!ovLoading && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-stone-200 dark:stroke-stone-700" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, "Revenue"]} />
                <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-stone-500">Loading chart…</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Lifecycle (subscription events)</h2>
        {lcLoading ? (
          <p className="mt-2 text-sm text-stone-500">Loading…</p>
        ) : (
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-stone-100 p-3 text-xs text-stone-800 dark:bg-stone-950 dark:text-stone-200">
            {JSON.stringify(lifecycle ?? {}, null, 2)}
          </pre>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-600 dark:border-stone-600 dark:text-stone-400">
        <p className="font-medium text-stone-800 dark:text-stone-200">Cohort analysis &amp; activation</p>
        <p className="mt-1">
          Export payments and join with product analytics (GA4 BigQuery, warehouse) to compute CAC, LTV, and activation rate by
          cohort. This page is the operational anchor; BI tooling lives in your data stack.
        </p>
      </div>
    </section>
  );
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toFixed(2)}`;
}

function KpiCard({ label, value }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/80">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">{value}</p>
    </div>
  );
}
