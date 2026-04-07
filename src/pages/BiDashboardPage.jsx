import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getBiTransaction, getProducts, postBiSlackSummary } from "../services/api";
import { useBiSnapshot, useBiTransactionsDrilldown } from "../hooks/useBiDashboard";
import { downloadCsv, downloadJson } from "../utils/csvExport";
import { useToastStore } from "../stores/toastStore";
import FeatureGate from "../components/FeatureGate";

const PIE_COLORS = ["#0d9488", "#14b8a6", "#5eead4", "#99f6e4", "#ccfbf1", "#78716c"];

function defaultRange() {
  const to = new Date();
  const from = new Date(Date.now() - 30 * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function fmtBucket(v) {
  if (v == null) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function DetailModal({ open, title, body, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            className="rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-stone-100 p-3 text-xs dark:bg-stone-950">
          {typeof body === "string" ? body : JSON.stringify(body, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default function BiDashboardPage() {
  const showToast = useToastStore((s) => s.showToast);
  const [range, setRange] = useState(() => defaultRange());
  const [granularity, setGranularity] = useState("day");
  const [productId, setProductId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [txPage, setTxPage] = useState(1);
  const [detail, setDetail] = useState(null);

  const filters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      granularity,
      productId,
      storeId,
    }),
    [range.from, range.to, granularity, productId, storeId]
  );

  const snap = useBiSnapshot(filters, true);
  const drill = useBiTransactionsDrilldown(filters, txPage, true);
  const productsQ = useQuery({
    queryKey: ["products-bi"],
    queryFn: getProducts,
    staleTime: 60_000,
  });

  const txDetail = useQuery({
    queryKey: ["bi-tx-detail", detail?.id],
    queryFn: () => getBiTransaction(detail.id),
    enabled: Boolean(detail?.id),
  });

  const data = snap.data;
  const sym = data?.meta?.currencySymbol || "$";
  const k = data?.kpis;

  const salesChart = useMemo(
    () =>
      (data?.timeSeries?.sales || []).map((row) => ({
        label: fmtBucket(row.bucket),
        revenue: row.revenue,
        transactions: row.transactionCount,
      })),
    [data]
  );

  const syncChart = useMemo(
    () =>
      (data?.timeSeries?.syncHealth || []).map((row) => ({
        label: fmtBucket(row.bucket),
        synced: row.synced,
        pending: row.pending,
        failed: row.failed,
      })),
    [data]
  );

  const payFailChart = useMemo(
    () =>
      (data?.timeSeries?.paymentFailure || []).map((row) => ({
        label: fmtBucket(row.bucket),
        rate: Math.round((row.rate || 0) * 1000) / 10,
      })),
    [data]
  );

  const barData = useMemo(
    () =>
      (data?.breakdowns?.topProducts || []).slice(0, 8).map((p) => ({
        name: p.name?.length > 24 ? `${p.name.slice(0, 22)}…` : p.name,
        revenue: p.revenue,
      })),
    [data]
  );

  const revenuePie = useMemo(
    () =>
      (data?.breakdowns?.revenuePie || []).map((p) => ({
        name: p.name,
        value: Number(p.revenue),
      })),
    [data]
  );

  const conflictPie = useMemo(
    () =>
      (data?.breakdowns?.conflictsPie || []).map((c) => ({
        name: c.action.replace(/^SYNC_/, "").replace(/_/g, " "),
        value: c.count,
      })),
    [data]
  );

  const exportSnapshot = () => {
    if (!data) {
      showToast("Nothing to export yet.", "error");
      return;
    }
    downloadJson(`bi-snapshot-${Date.now()}.json`, data);
    showToast("JSON export started.", "success");
  };

  const exportCsvTables = () => {
    if (!salesChart.length) {
      showToast("No series data to export.", "error");
      return;
    }
    downloadCsv(`bi-sales-${Date.now()}.csv`, salesChart);
    showToast("CSV export started.", "success");
  };

  const pushSlack = async () => {
    try {
      await postBiSlackSummary({ from: range.from, to: range.to });
      showToast("Summary sent to Slack (if configured).", "success");
    } catch (e) {
      showToast(e?.response?.data?.message || "Could not send Slack summary.", "error");
    }
  };

  const applyPreset = (days) => {
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    setRange({ from: from.toISOString(), to: to.toISOString() });
    setTxPage(1);
  };

  return (
    <FeatureGate featureKey="BI_DASHBOARD" label="Business intelligence is available on Basic or Premium.">
    <div id="bi-dashboard" className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Business intelligence</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Aggregated metrics (UTC). Requires BASIC+ plan. Data caches ~45s on the server.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
            onClick={exportCsvTables}
          >
            Export sales CSV
          </button>
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
            onClick={exportSnapshot}
          >
            Export snapshot JSON
          </button>
          <button
            type="button"
            className="rounded-lg border border-teal-700 bg-teal-700 px-3 py-1.5 text-sm text-white dark:border-teal-600 dark:bg-teal-600"
            onClick={pushSlack}
          >
            Slack summary
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" className="text-xs text-teal-800 underline dark:text-teal-400" onClick={() => applyPreset(7)}>
          Last 7 days
        </button>
        <button type="button" className="text-xs text-teal-800 underline dark:text-teal-400" onClick={() => applyPreset(30)}>
          Last 30 days
        </button>
        <button type="button" className="text-xs text-teal-800 underline dark:text-teal-400" onClick={() => applyPreset(90)}>
          Last 90 days
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 md:grid-cols-2 lg:grid-cols-4 print:grid-cols-2">
        <label className="block text-xs">
          <span className="text-stone-500">From</span>
          <input
            type="datetime-local"
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
            value={range.from.slice(0, 16)}
            onChange={(e) => {
              setRange((r) => ({ ...r, from: new Date(e.target.value).toISOString() }));
              setTxPage(1);
            }}
          />
        </label>
        <label className="block text-xs">
          <span className="text-stone-500">To</span>
          <input
            type="datetime-local"
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
            value={range.to.slice(0, 16)}
            onChange={(e) => {
              setRange((r) => ({ ...r, to: new Date(e.target.value).toISOString() }));
              setTxPage(1);
            }}
          />
        </label>
        <label className="block text-xs">
          <span className="text-stone-500">Bucket</span>
          <select
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-stone-500">Product filter</span>
          <select
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setTxPage(1);
            }}
          >
            <option value="">All products</option>
            {(productsQ.data || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs md:col-span-2 lg:col-span-4">
          <span className="text-stone-500">Store ID (optional UUID)</span>
          <input
            className="mt-1 w-full max-w-md rounded border border-stone-300 px-2 py-1 font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value);
              setTxPage(1);
            }}
            placeholder="Filter transactions to one store"
          />
        </label>
      </div>

      {snap.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {snap.error?.response?.data?.message || "Could not load BI data. You may need BASIC+ or manager access."}
        </div>
      )}

      {snap.isLoading && <p className="text-sm text-stone-500">Loading metrics…</p>}

      {data?.alerts?.length > 0 && (
        <div className="space-y-2 print:hidden">
          {data.alerts.map((a) => (
            <div
              key={a.code}
              className={`rounded-lg border px-3 py-2 text-sm ${
                a.severity === "critical"
                  ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
                  : a.severity === "warning"
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                    : "border-stone-200 bg-stone-100 text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              }`}
            >
              <strong>{a.code}</strong>: {a.message}
            </div>
          ))}
        </div>
      )}

      {k && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-xs text-stone-500">Revenue</p>
            <p className="text-2xl font-semibold text-teal-800 dark:text-teal-400">
              {sym}
              {k.revenue.toFixed(2)}
            </p>
            <p className="text-xs text-stone-500">
              vs prior: {(k.revenueChangePct * 100).toFixed(1)}% · {data?.meta?.currencyCode}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-xs text-stone-500">Active customers</p>
            <p className="text-2xl font-semibold">{k.activeCustomers}</p>
            <p className="text-xs text-stone-500">New profiles: {k.newCustomers}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-xs text-stone-500">Failed sync (tx)</p>
            <p className="text-2xl font-semibold text-red-600 dark:text-red-400">{k.failedTransactionCount}</p>
            <p className="text-xs text-stone-500">Rate: {(k.failedTransactionRate * 100).toFixed(1)}%</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-xs text-stone-500">Payment failure rate</p>
            <p className="text-2xl font-semibold text-amber-700 dark:text-amber-400">
              {(k.failedPaymentRate * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-stone-500">
              Records: {k.paymentRecordsTotal} ({k.paymentFailures} failed)
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">Sales</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={salesChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-stone-200 dark:stroke-stone-700" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" name={`Revenue (${sym})`} stroke="#0d9488" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">Sync health (counts)</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={syncChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-stone-200 dark:stroke-stone-700" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="synced" stroke="#059669" dot={false} />
                <Line type="monotone" dataKey="pending" stroke="#d97706" dot={false} />
                <Line type="monotone" dataKey="failed" stroke="#dc2626" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">Billing payment failure %</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={payFailChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-stone-200 dark:stroke-stone-700" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="rate" name="Failure %" stroke="#b45309" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">Top products (revenue)</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-stone-200 dark:stroke-stone-700" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#0d9488" name={`Revenue (${sym})`} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">Revenue share (top products)</h2>
          <div className="h-64 w-full">
            {revenuePie.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={revenuePie} dataKey="value" nameKey="name" outerRadius={90} label>
                    {revenuePie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-stone-500">No revenue in range.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">Sync conflicts (audit)</h2>
          <div className="h-64 w-full">
            {conflictPie.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={conflictPie} dataKey="value" nameKey="name" outerRadius={90} label>
                    {conflictPie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-stone-500">No conflict events in range.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="mb-2 font-semibold">Inventory velocity (units / day)</h2>
        <ul className="text-sm text-stone-700 dark:text-stone-300">
          {(data?.breakdowns?.inventoryVelocity || []).map((row) => (
            <li key={row.productId} className="flex justify-between border-b border-stone-100 py-1 dark:border-stone-800">
              <span>{row.name}</span>
              <span className="font-mono text-xs">{row.unitsPerDay.toFixed(2)} / day · {row.quantitySold} sold</span>
            </li>
          ))}
          {!(data?.breakdowns?.inventoryVelocity || []).length && (
            <li className="text-stone-500">No movement in this range.</li>
          )}
        </ul>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="mb-3 font-semibold">Transaction drilldown</h2>
        <p className="mb-2 text-xs text-stone-500 print:hidden">
          PII masked. Open a row for full line items (admin API).
        </p>
        {drill.isLoading && <p className="text-sm text-stone-500">Loading…</p>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-100 dark:bg-stone-800">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Sync</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Customer</th>
              </tr>
            </thead>
            <tbody>
              {(drill.data?.rows || []).map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-stone-200 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
                  onClick={() => setDetail({ id: r.id })}
                >
                  <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-3 py-2">
                    {sym}
                    {r.total}
                  </td>
                  <td className="px-3 py-2">{r.syncStatus}</td>
                  <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">{r.customer?.name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 print:hidden">
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-stone-600"
            disabled={txPage <= 1}
            onClick={() => setTxPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-xs text-stone-500">
            Page {txPage} · {drill.data?.total ?? 0} total
          </span>
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-stone-600"
            disabled={txPage * 25 >= (drill.data?.total ?? 0)}
            onClick={() => setTxPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </section>

      <DetailModal
        open={Boolean(detail?.id)}
        title="Transaction (admin view)"
        body={txDetail.isLoading ? "Loading…" : txDetail.data || {}}
        onClose={() => setDetail(null)}
      />
    </div>
    </FeatureGate>
  );
}
