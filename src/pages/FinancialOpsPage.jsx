import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getObservabilityAnomalies,
  getObservabilityExplain,
  getObservabilityHealth,
  getObservabilitySummary,
  getStreamRecent,
  getStreamStats,
} from "../services/api";

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <h3 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</h3>
      {children}
    </div>
  );
}

/** Static reference flow — actual stages per scope come from API `pipelineFlow`. */
function PipelineLegend() {
  const steps = [
    { key: "e", label: "Event ingest" },
    { key: "l", label: "Ledger" },
    { key: "s", label: "Snapshot" },
    { key: "r", label: "Reconcile" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400">
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden className="text-stone-400">→</span> : null}
          <span className="rounded-md bg-teal-50 px-2 py-1 font-mono text-teal-900 dark:bg-teal-950/50 dark:text-teal-100">
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

function PipelineFlowChips({ stages }) {
  if (!stages?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
      {stages.map((st, i) => (
        <span key={`${st}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span className="text-stone-400">→</span> : null}
          <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
            {st}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function FinancialOpsPage() {
  const [txId, setTxId] = useState("");
  const [deep, setDeep] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("ALL");

  const summaryQ = useQuery({
    queryKey: ["obs", "summary"],
    queryFn: getObservabilitySummary,
    staleTime: 30_000,
  });
  const healthQ = useQuery({
    queryKey: ["obs", "health"],
    queryFn: getObservabilityHealth,
    staleTime: 30_000,
  });
  const anomaliesQ = useQuery({
    queryKey: ["obs", "anomalies", deep],
    queryFn: () => getObservabilityAnomalies({ limit: 40, deep }),
    staleTime: 30_000,
  });

  const streamStatsQ = useQuery({
    queryKey: ["obs", "stream", "stats"],
    queryFn: getStreamStats,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const streamRecentQ = useQuery({
    queryKey: ["obs", "stream", "recent"],
    queryFn: () => getStreamRecent({ limit: 40 }),
    staleTime: 5_000,
    refetchInterval: 8_000,
  });

  const explainQ = useQuery({
    queryKey: ["obs", "explain", txId],
    queryFn: () => getObservabilityExplain(txId.trim()),
    enabled: txId.trim().length >= 8,
  });

  const explainBody = useMemo(() => {
    if (!explainQ.data) return null;
    return explainQ.data;
  }, [explainQ.data]);

  const filteredAnomalies = useMemo(() => {
    const items = anomaliesQ.data?.items || [];
    if (severityFilter === "ALL") return items;
    return items.filter((a) => String(a.severity).toUpperCase() === severityFilter);
  }, [anomaliesQ.data?.items, severityFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Vessa control center</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Phase 6 — financial observability: integrity pipeline health, anomalies, and per-transaction explainability
          (event → ledger → snapshot → reconciliation).
        </p>
        <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-600 dark:bg-stone-950/50">
          <p className="text-xs font-medium text-stone-600 dark:text-stone-400">Reference flow</p>
          <PipelineLegend />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card title="Integrity events">
          {summaryQ.isLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : summaryQ.isError ? (
            <p className="text-sm text-red-600">Failed to load</p>
          ) : (
            <>
              <p className="text-2xl font-semibold">{summaryQ.data?.integrityEvents?.total ?? 0}</p>
              <p className="text-xs text-stone-500">Last 24h: {summaryQ.data?.integrityEvents?.last24h ?? 0}</p>
            </>
          )}
        </Card>
        <Card title="Ledger lines">
          {summaryQ.isLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : (
            <p className="text-2xl font-semibold">{summaryQ.data?.ledgerLines?.total ?? 0}</p>
          )}
        </Card>
        <Card title="Snapshots">
          {summaryQ.isLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : (
            <p className="text-2xl font-semibold">{summaryQ.data?.snapshots?.total ?? 0}</p>
          )}
        </Card>
        <Card title="Health score">
          {healthQ.isLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : (
            <>
              <p className="text-2xl font-semibold">{healthQ.data?.healthScore ?? "—"}</p>
              <p className="text-xs text-stone-500">
                Stale scopes: {healthQ.data?.factors?.snapshotStalenessScopes ?? 0} /{" "}
                {healthQ.data?.factors?.distinctTransactionScopes ?? 0}
              </p>
            </>
          )}
        </Card>
      </div>

      <Card title="Live stream (Phase 6.5)">
        <p className="mb-2 text-xs text-stone-600 dark:text-stone-400">
          In-process ring buffer (single node). Types seen since boot:{" "}
          {streamStatsQ.data?.bus?.buffered != null ? (
            <span className="font-mono">{streamStatsQ.data.bus.buffered} buffered</span>
          ) : (
            "…"
          )}
        </p>
        {streamRecentQ.isLoading ? (
          <p className="text-sm text-stone-500">Loading stream…</p>
        ) : streamRecentQ.data?.events?.length ? (
          <ul className="max-h-48 space-y-1 overflow-auto font-mono text-xs text-stone-800 dark:text-stone-200">
            {streamRecentQ.data.events.slice(0, 25).map((ev) => (
              <li key={ev.eventId} className="border-b border-stone-100 pb-1 dark:border-stone-800">
                <span className="text-teal-700 dark:text-teal-400">{ev.type}</span>{" "}
                <span className="text-stone-500">{ev.clientTransactionId ? `${ev.clientTransactionId.slice(0, 8)}…` : "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">No stream events yet for this tenant (generate sales / integrity ingest).</p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Commerce (24h)">
          {summaryQ.isLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : (
            <>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Transactions:{" "}
                <span className="font-semibold text-stone-900 dark:text-stone-100">
                  {summaryQ.data?.commerce?.transactionsLast24h ?? "—"}
                </span>
              </p>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Sales:{" "}
                <span className="font-semibold text-stone-900 dark:text-stone-100">
                  {summaryQ.data?.commerce?.salesLast24h ?? "—"}
                </span>
              </p>
            </>
          )}
        </Card>
        <Card title="Sync / snapshot posture">
          {summaryQ.isLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : (
            <p className="text-sm text-stone-700 dark:text-stone-300">
              Scopes behind snapshot:{" "}
              <span className="font-mono font-semibold">
                {summaryQ.data?.syncHealth?.snapshotBehindScopes ?? summaryQ.data?.snapshotLag?.staleScopeCount ?? 0}
              </span>
            </p>
          )}
        </Card>
        <Card title="Distinct scopes">
          {summaryQ.isLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : (
            <p className="text-2xl font-semibold">{summaryQ.data?.transactionScopes?.distinctCount ?? 0}</p>
          )}
        </Card>
      </div>

      <Card title="Snapshot lag (sample)">
        {summaryQ.data?.snapshotLag?.sampleStaleScopes?.length ? (
          <ul className="max-h-40 overflow-auto text-xs text-stone-700 dark:text-stone-300">
            {summaryQ.data.snapshotLag.sampleStaleScopes.map((r) => (
              <li key={r.clientTransactionId} className="mb-1 font-mono">
                {r.clientTransactionId} — events {r.eventCount} vs snap {r.snapshotEventCount}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">No stale scopes in sample (or no integrity data).</p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
          Deep anomaly scan (runs reconciliation on a few stale scopes)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-600 dark:text-stone-400">Anomaly severity:</span>
        {["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeverityFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              severityFilter === s
                ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950"
                : "border border-stone-300 bg-white text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Card title={`Anomaly center (${filteredAnomalies.length})`}>
        {anomaliesQ.isLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : filteredAnomalies.length ? (
          <ul className="space-y-2 text-sm">
            {filteredAnomalies.map((a) => (
              <li
                key={a.clientTransactionId}
                className="rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/40"
              >
                <span className="font-medium">{a.severity}</span> · {a.type}
                <div className="font-mono text-xs text-stone-600 dark:text-stone-400">{a.clientTransactionId}</div>
                <div className="text-xs">{a.description}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">No anomalies match this filter.</p>
        )}
        {anomaliesQ.data?.deepScan && anomaliesQ.data?.reconciliationSamples?.length ? (
          <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-700">
            <p className="mb-2 text-xs font-medium text-stone-600 dark:text-stone-400">Deep reconciliation samples</p>
            <pre className="max-h-48 overflow-auto rounded bg-stone-100 p-2 text-xs dark:bg-stone-950">
              {JSON.stringify(anomaliesQ.data.reconciliationSamples, null, 2)}
            </pre>
          </div>
        ) : null}
      </Card>

      <Card title="Transaction explorer (explainability)">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={txId}
            onChange={(e) => setTxId(e.target.value)}
            placeholder="clientTransactionId (UUID)"
            className="min-w-[240px] flex-1 rounded border border-stone-300 bg-white px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
          />
        </div>
        {explainQ.isFetching ? <p className="text-sm text-stone-500">Loading explain…</p> : null}
        {explainQ.isError ? <p className="text-sm text-red-600">Could not load this scope.</p> : null}
        {explainBody ? (
          <div className="space-y-4">
            {explainBody.canonicalTransaction ? (
              <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-stone-600 dark:bg-stone-950/50">
                <p className="font-semibold text-stone-800 dark:text-stone-100">Canonical transaction row</p>
                <p className="mt-1 font-mono text-stone-700 dark:text-stone-300">
                  {explainBody.canonicalTransaction.transactionType} · {explainBody.canonicalTransaction.paymentStatus} ·
                  total {explainBody.canonicalTransaction.totalAmount}{" "}
                  <span className="text-stone-500">
                    (sync {String(explainBody.canonicalTransaction.syncStatus)})
                  </span>
                </p>
              </div>
            ) : null}
            {explainBody.pipelineFlow?.length ? (
              <div>
                <p className="text-xs font-medium text-stone-600 dark:text-stone-400">Pipeline for this scope</p>
                <PipelineFlowChips stages={explainBody.pipelineFlow} />
              </div>
            ) : null}
            {explainBody.timelineStages?.length ? (
              <div>
                <p className="text-xs font-medium text-stone-600 dark:text-stone-400">Timeline (deduplicated stages)</p>
                <ul className="mt-1 list-inside list-disc text-sm text-stone-800 dark:text-stone-200">
                  {explainBody.timelineStages.map((t) => (
                    <li key={t} className="font-mono">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <details className="rounded border border-stone-200 dark:border-stone-700">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-stone-700 dark:text-stone-200">
                Raw explain payload (JSON)
              </summary>
              <pre className="max-h-[480px] overflow-auto rounded-b bg-stone-100 p-3 text-xs dark:bg-stone-950">
                {JSON.stringify(explainBody, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            Enter a transaction id to see timeline, pipeline, ledger lines, snapshot, and 4D reconciliation.
          </p>
        )}
      </Card>
    </div>
  );
}
