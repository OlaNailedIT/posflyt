import { useQuery } from "@tanstack/react-query";
import { getAdminUfecHealth } from "../services/api";

function modeBadgeClass(mode) {
  const u = String(mode || "").toUpperCase();
  if (u === "CRITICAL") return "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-100";
  if (u === "DEGRADED") return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
  if (u === "ELEVATED") return "bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100";
  return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100";
}

function pressureClass(p) {
  const u = String(p || "").toUpperCase();
  if (u === "HIGH") return "text-red-700 dark:text-red-300 font-semibold";
  if (u === "MODERATE" || u === "LOW") return "text-amber-700 dark:text-amber-300";
  return "text-stone-600 dark:text-stone-400";
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <h3 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</h3>
      {children}
    </div>
  );
}

/**
 * Phase 7 — Control tower: server-side UFEC/operations health (admin-only).
 * Complements offline/client IFETS; use Monitoring + Financial ops for deep dives.
 */
export default function AdminSystemPage() {
  const q = useQuery({
    queryKey: ["admin", "ufec-health"],
    queryFn: getAdminUfecHealth,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const payload = q.data;
  const backlog = payload?.reconciliationBacklog;
  const snapshot = payload?.resilienceSnapshot;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">System control tower</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Read-only snapshot: operational mode, sync pressure, integrity anomalies, and reconciliation backlog.
          Refreshes every ~20s.
        </p>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : q.isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">Could not load system health.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="Operational mode">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-lg px-3 py-1 text-sm font-semibold uppercase tracking-wide ${modeBadgeClass(payload?.operationalMode)}`}
                >
                  {payload?.operationalMode ?? "—"}
                </span>
                <span className="text-xs text-stone-500">
                  Sync pressure:{" "}
                  <span className={pressureClass(payload?.syncPressure)}>{payload?.syncPressure ?? "—"}</span>
                </span>
              </div>
              <p className="mt-3 text-xs text-stone-500">
                Derived from health score, pending/failed sync rows, and anomaly count.{" "}
                <span className="italic">{snapshot?.note}</span>
              </p>
            </Card>

            <Card title="Reconciliation backlog">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-stone-500">Pending transactions</dt>
                <dd className="font-mono text-right">{backlog?.pendingTransactions ?? 0}</dd>
                <dt className="text-stone-500">Failed sync</dt>
                <dd className="font-mono text-right text-red-700 dark:text-red-300">
                  {backlog?.failedTransactions ?? 0}
                </dd>
                <dt className="text-stone-500">Stale snapshot scopes</dt>
                <dd className="font-mono text-right">{backlog?.staleSnapshotScopes ?? 0}</dd>
              </dl>
            </Card>
          </div>

          <Card title="Resilience snapshot (server)">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-stone-500">Health score</span>
                <p className="font-mono text-lg">{snapshot?.healthScore ?? "—"}</p>
              </div>
              <div>
                <span className="text-stone-500">Distinct scopes / Tx 24h</span>
                <p className="font-mono">
                  {snapshot?.factors?.distinctTransactionScopes ?? "—"} /{" "}
                  {snapshot?.factors?.transactionsLast24h ?? "—"}
                </p>
              </div>
            </div>
          </Card>

          <Card title={`IFETS-style anomalies (${payload?.anomaliesMeta?.count ?? 0} shown, max 50)`}>
            {!payload?.anomalies?.length ? (
              <p className="text-sm text-stone-500">No anomalies in the current window.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-auto text-sm">
                {payload.anomalies.map((a, i) => (
                  <li
                    key={`${a.type}-${a.clientTransactionId ?? i}-${i}`}
                    className="rounded border border-stone-100 bg-stone-50 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-950/80"
                  >
                    <span className="font-mono text-xs text-teal-800 dark:text-teal-200">{a.type}</span>
                    {a.severity ? (
                      <span className="ml-2 text-xs text-stone-500">({a.severity})</span>
                    ) : null}
                    <p className="mt-0.5 text-stone-700 dark:text-stone-300">{a.description}</p>
                    {a.clientTransactionId ? (
                      <p className="mt-1 font-mono text-xs text-stone-500">{a.clientTransactionId}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="text-xs text-stone-400">
            API <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">GET /api/admin/ufec-health</code> ·{" "}
            {payload?.generatedAt}
          </p>
        </>
      )}
    </div>
  );
}
