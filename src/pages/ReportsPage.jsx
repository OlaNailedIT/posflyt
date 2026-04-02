import { useState } from "react";
import { useSalesReport } from "../hooks/useSalesReport";
import { formatMoney } from "../utils/currency";
import { useSettingsStore } from "../stores/settingsStore";
import { exportCsv } from "../services/api";
import { useAuthStore } from "../stores/authStore";

export default function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  const settings = useSettingsStore((s) => s.settings);
  const { data, isLoading } = useSalesReport(
    {
      ...(from ? { from: new Date(`${from}T00:00:00.000Z`).toISOString() } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59.999Z`).toISOString() } : {}),
    },
    plan !== "FREE"
  );

  const onExport = async (type) => {
    const blob = await exportCsv(type);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (plan === "FREE") {
    return (
      <section>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Reports</h1>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-400">
          Upgrade to Basic or Premium to access reports and advanced analytics.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Reports</h1>
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <label className="text-sm">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-2 rounded border border-stone-300 bg-stone-50 p-1.5 dark:border-stone-600 dark:bg-stone-950"
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ml-2 rounded border border-stone-300 bg-stone-50 p-1.5 dark:border-stone-600 dark:bg-stone-950"
          />
        </label>
        <button
          type="button"
          onClick={() => onExport("transactions")}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
        >
          Export Transactions CSV
        </button>
        <button
          type="button"
          onClick={() => onExport("products")}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
        >
          Export Products CSV
        </button>
        <button
          type="button"
          onClick={() => onExport("customers")}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
        >
          Export Customers CSV
        </button>
      </div>
      {isLoading ? (
        <p className="mt-3 text-sm text-stone-500">Loading report...</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-sm text-stone-500">Total Sales</p>
            <p className="text-2xl font-bold">
              {formatMoney(data?.totalSales || 0, settings.currencySymbol)}
            </p>
          </article>
          <article className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-sm text-stone-500">Transactions</p>
            <p className="text-2xl font-bold">{data?.transactionsCount || 0}</p>
          </article>
        </div>
      )}
      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold">Trend</h2>
        <div className="mt-2 space-y-2">
          {(data?.trend || []).map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1 rounded border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{new Date(entry.createdAt).toLocaleString()}</span>
              <span>{formatMoney(entry.total, settings.currencySymbol)}</span>
            </div>
          ))}
          {!data?.trend?.length && <p className="text-sm text-stone-500">No data for selected range.</p>}
        </div>
      </div>
    </section>
  );
}
