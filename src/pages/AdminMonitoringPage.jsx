import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAdminEvent,
  getAdminTransaction,
  postAdminAlertTest,
} from "../services/api";
import {
  useAdminEvents,
  useAdminMonitoringAlertsQuery,
  useAdminOperationalErrors,
  useAdminPayments,
  useAdminSyncSummary,
  useAdminTransactions,
  useAdminWebhookEvents,
} from "../hooks/useAdminMonitoring";
import { downloadCsv, downloadJson } from "../utils/csvExport";
import { useToastStore } from "../stores/toastStore";

const TABS = [
  { id: "tx", label: "Transactions" },
  { id: "events", label: "Sync & conflicts" },
  { id: "payments", label: "Payments" },
  { id: "webhooks", label: "Webhook ledger" },
  { id: "errors", label: "Errors" },
  { id: "alerts", label: "Smart alerts" },
];

function statusClass(syncStatus) {
  if (syncStatus === "FAILED") return "text-red-600 dark:text-red-400 font-medium";
  if (syncStatus === "PENDING") return "text-amber-700 dark:text-amber-400";
  if (syncStatus === "SYNCED") return "text-emerald-700 dark:text-emerald-400";
  return "";
}

function DetailModal({ open, title, body, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-detail-title"
    >
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="admin-detail-title" className="text-lg font-semibold">
            {title}
          </h2>
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

export default function AdminMonitoringPage() {
  const showToast = useToastStore((s) => s.showToast);
  const [tab, setTab] = useState("tx");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [detail, setDetail] = useState(null);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: 25,
      q: q.trim() || undefined,
      userId: userId.trim() || undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
      sortBy,
      order,
    }),
    [page, q, userId, from, to, sortBy, order]
  );

  const { data: summary, isLoading: sumLoading } = useAdminSyncSummary(true);
  const txQ = useAdminTransactions(listParams, tab === "tx");
  const evQ = useAdminEvents(listParams, tab === "events");
  const payQ = useAdminPayments(listParams, tab === "payments");
  const whQ = useAdminWebhookEvents(listParams, tab === "webhooks");
  const errQ = useAdminOperationalErrors(listParams, tab === "errors");
  const alertQ = useAdminMonitoringAlertsQuery(tab === "alerts");

  const txDetail = useQuery({
    queryKey: ["admin-transaction-detail", detail?.txId],
    queryFn: () => getAdminTransaction(detail.txId),
    enabled: detail?.kind === "tx" && !!detail?.txId,
  });
  const evDetail = useQuery({
    queryKey: ["admin-event-detail", detail?.evId],
    queryFn: () => getAdminEvent(detail.evId),
    enabled: detail?.kind === "event" && !!detail?.evId,
  });

  const activeRows = useMemo(() => {
    if (tab === "tx") return txQ.data?.rows ?? [];
    if (tab === "events") return evQ.data?.rows ?? [];
    if (tab === "payments") return payQ.data?.rows ?? [];
    if (tab === "webhooks") return whQ.data?.rows ?? [];
    if (tab === "errors") return errQ.data?.rows ?? [];
    return [];
  }, [tab, txQ.data, evQ.data, payQ.data, whQ.data, errQ.data]);

  const activeTotal = useMemo(() => {
    if (tab === "tx") return txQ.data?.total ?? 0;
    if (tab === "events") return evQ.data?.total ?? 0;
    if (tab === "payments") return payQ.data?.total ?? 0;
    if (tab === "webhooks") return whQ.data?.total ?? 0;
    if (tab === "errors") return errQ.data?.total ?? 0;
    return 0;
  }, [tab, txQ.data, evQ.data, payQ.data, whQ.data, errQ.data]);

  const loading =
    tab === "tx"
      ? txQ.isLoading
      : tab === "events"
        ? evQ.isLoading
        : tab === "payments"
          ? payQ.isLoading
          : tab === "webhooks"
            ? whQ.isLoading
            : tab === "errors"
              ? errQ.isLoading
              : alertQ.isLoading;

  const exportRows = () => {
    if (!activeRows.length) {
      showToast("Nothing to export on this page.", "error");
      return;
    }
    downloadCsv(`admin-${tab}-${page}.csv`, activeRows);
    showToast("CSV downloaded.", "success");
  };

  const exportJson = () => {
    if (!activeRows.length) {
      showToast("Nothing to export on this page.", "error");
      return;
    }
    downloadJson(`admin-${tab}-${page}.json`, activeRows);
    showToast("JSON downloaded.", "success");
  };

  const testSlack = async () => {
    try {
      await postAdminAlertTest({ message: "Admin dashboard test ping" });
      showToast("Alert test sent (if Slack URL is configured).", "success");
    } catch (e) {
      showToast(e?.response?.data?.message || "Alert test failed.", "error");
    }
  };

  const detailPayload =
    detail?.kind === "tx" ? txDetail.data : detail?.kind === "event" ? evDetail.data : null;
  const detailLoading =
    detail?.kind === "tx" ? txDetail.isLoading : detail?.kind === "event" ? evDetail.isLoading : false;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Operations monitoring</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Read-only admin APIs under <code className="text-xs">/api/admin</code>. Data refreshes every ~12s.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
            onClick={testSlack}
          >
            Test alert hook
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sumLoading && <p className="text-sm text-stone-500">Loading sync summary…</p>}
        {summary && (
          <>
            <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <p className="text-xs text-stone-500">Pending sync</p>
              <p className="text-2xl font-semibold text-amber-700 dark:text-amber-400">
                {summary.transactionsBySyncStatus?.PENDING ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <p className="text-xs text-stone-500">Synced</p>
              <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
                {summary.transactionsBySyncStatus?.SYNCED ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <p className="text-xs text-stone-500">Failed (total)</p>
              <p
                className="text-2xl font-semibold text-red-600 dark:text-red-400"
                title="Transactions stuck in FAILED sync state"
              >
                {summary.transactionsBySyncStatus?.FAILED ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <p className="text-xs text-stone-500">Retry failed (24h)</p>
              <p
                className="text-2xl font-semibold text-red-600 dark:text-red-400"
                title="SYNC_RETRY_FAILED audit events in the last 24 hours"
              >
                {summary.last24h?.syncRetryFailed ?? 0}
              </p>
            </div>
          </>
        )}
      </div>

      {summary && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="font-medium text-stone-800 dark:text-stone-100">Last 24h — conflicts & recovery</p>
          <div className="mt-2 flex flex-wrap gap-4 text-stone-600 dark:text-stone-400">
            <span title="SYNC_DUPLICATE_TRANSACTION">
              Duplicates: <strong className="text-stone-900 dark:text-stone-100">{summary.last24h?.duplicateConflicts ?? 0}</strong>
            </span>
            <span title="SYNC_INVENTORY_CONFLICT">
              Inventory: <strong className="text-stone-900 dark:text-stone-100">{summary.last24h?.inventoryConflicts ?? 0}</strong>
            </span>
            <span title="SYNC_RETRY_RESOLVED">
              Resolved: <strong className="text-emerald-700 dark:text-emerald-400">{summary.last24h?.syncRetryResolved ?? 0}</strong>
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-2 dark:border-stone-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-t px-3 py-1.5 text-sm ${
              tab === t.id
                ? "bg-teal-100 font-medium text-teal-900 dark:bg-teal-900/40 dark:text-teal-100"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
            onClick={() => {
              setTab(t.id);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "alerts" && (
        <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 md:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs">
            <span className="text-stone-500">Search (id, action, refs)</span>
            <input
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="block text-xs">
            <span className="text-stone-500">User ID (UUID)</span>
            <input
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="block text-xs">
            <span className="text-stone-500">From (ISO date)</span>
            <input
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              placeholder="2026-01-01"
            />
          </label>
          <label className="block text-xs">
            <span className="text-stone-500">To (ISO date)</span>
            <input
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      )}

      {tab === "tx" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-stone-500">Sort:</span>
          <select
            className="rounded border border-stone-300 px-2 py-1 dark:border-stone-600 dark:bg-stone-950"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="createdAt">Date</option>
            <option value="total">Amount</option>
            <option value="syncStatus">Sync status</option>
          </select>
          <select
            className="rounded border border-stone-300 px-2 py-1 dark:border-stone-600 dark:bg-stone-950"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="desc">Newest / high first</option>
            <option value="asc">Oldest / low first</option>
          </select>
        </div>
      )}

      {tab !== "alerts" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
            onClick={exportRows}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
            onClick={exportJson}
          >
            Export JSON
          </button>
        </div>
      )}

      {tab === "alerts" && (
        <div className="space-y-2">
          {alertQ.isLoading && <p className="text-sm text-stone-500">Loading alerts…</p>}
          {(alertQ.data?.rows ?? []).map((a) => (
            <div
              key={a.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                a.type === "SALES_DROP"
                  ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"
                  : "border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900"
              }`}
              title={a.type}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{a.type}</span>
                <span className="text-stone-500">{new Date(a.alertDate).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-stone-700 dark:text-stone-300">{a.message}</p>
            </div>
          ))}
          {!alertQ.isLoading && !(alertQ.data?.rows ?? []).length && (
            <p className="text-sm text-stone-500">No smart alerts.</p>
          )}
        </div>
      )}

      {tab !== "alerts" && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
          {loading && <p className="p-4 text-sm text-stone-500">Loading…</p>}
          {!loading && tab === "tx" && (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-100 dark:bg-stone-800">
                <tr>
                  <th className="px-3 py-2">Transaction</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Sync</th>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">User</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-stone-200 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800/80"
                    onClick={() => setDetail({ kind: "tx", txId: r.id })}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                    <td className="px-3 py-2">{r.totalAmount}</td>
                    <td className={`px-3 py-2 ${statusClass(r.syncStatus)}`} title={r.syncStatus}>
                      {r.syncStatus}
                    </td>
                    <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs">{r.user?.name || r.userId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && tab === "events" && (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-100 dark:bg-stone-800">
                <tr>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">User</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-stone-200 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800/80"
                    onClick={() => setDetail({ kind: "event", evId: r.id })}
                  >
                    <td
                      className={`px-3 py-2 ${
                        /FAILED|CONFLICT|DUPLICATE/i.test(r.action)
                          ? "text-red-600 dark:text-red-400"
                          : /RESOLVED/i.test(r.action)
                            ? "text-emerald-700 dark:text-emerald-400"
                            : ""
                      }`}
                      title={r.action}
                    >
                      {r.action}
                    </td>
                    <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs">{r.user?.name || r.userId || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && tab === "payments" && (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-100 dark:bg-stone-800">
                <tr>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Retries</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => (
                  <tr key={r.id} className="border-t border-stone-200 dark:border-stone-700">
                    <td className="px-3 py-2 font-mono text-xs">{r.providerRef}</td>
                    <td
                      className={`px-3 py-2 ${r.status === "FAILED" ? "text-red-600 dark:text-red-400 font-medium" : ""}`}
                      title={r.status}
                    >
                      {r.status}
                    </td>
                    <td className="px-3 py-2">{r.retryCount}</td>
                    <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && tab === "webhooks" && (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-100 dark:bg-stone-800">
                <tr>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">Dedupe</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => (
                  <tr key={r.id} className="border-t border-stone-200 dark:border-stone-700">
                    <td className="px-3 py-2">{r.provider}</td>
                    <td
                      className={`px-3 py-2 ${r.outcome === "ERROR" ? "text-red-600 dark:text-red-400 font-medium" : ""}`}
                      title={r.outcome}
                    >
                      {r.outcome}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.dedupeKey}</td>
                    <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && tab === "errors" && (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-100 dark:bg-stone-800">
                <tr>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Summary</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="border-t border-stone-200 dark:border-stone-700">
                    <td className="px-3 py-2">{r.kind}</td>
                    <td className="px-3 py-2 text-red-600 dark:text-red-400" title={r.status}>
                      {r.status}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.summary}</td>
                    <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !activeRows.length && (
            <p className="p-4 text-sm text-stone-500">No rows for this filter.</p>
          )}
        </div>
      )}

      {tab !== "alerts" && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-1 disabled:opacity-50 dark:border-stone-600"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-stone-600 dark:text-stone-400">
            Page {page} — {activeTotal} rows (this view)
          </span>
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-1 disabled:opacity-50 dark:border-stone-600"
            disabled={page * 25 >= activeTotal}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      <DetailModal
        open={!!detail}
        title={detail?.kind === "tx" ? "Transaction detail" : "Audit event detail"}
        body={detailLoading ? "Loading…" : detailPayload ?? {}}
        onClose={() => setDetail(null)}
      />
    </section>
  );
}
