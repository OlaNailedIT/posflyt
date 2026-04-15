import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLastOperationalSnapshotForObservers } from "../../financial/ufecSystemHealth";
import { getAdminUfecHealth } from "../../services/api";
import { computeLocalSystemHealth } from "../../system/systemHealthAdapter";
import { generateInsights } from "../../system/insightEngine";

function trustLabel(score) {
  if (score >= 80) return "All clear";
  if (score >= 50) return "Reduced performance";
  return "Needs attention";
}

function mapServerMode(mode) {
  const m = String(mode || "").toUpperCase();
  if (m === "NORMAL") return "Normal";
  if (m === "DEGRADED") return "Degraded";
  if (m === "SAFE" || m === "FREEZE") return "Protected mode";
  return mode || "—";
}

/**
 * Unified trust + insights: server UFEC health (admin), client sync snapshot, max 2 insights, plain language.
 */
export default function BusinessStatusCard({
  summaryForInsights,
  isAdmin,
  subscriptionBlocked,
}) {
  const [tick, setTick] = useState(0);
  const { data: serverHealth } = useQuery({
    queryKey: ["admin", "ufec-health"],
    queryFn: getAdminUfecHealth,
    enabled: Boolean(isAdmin && !subscriptionBlocked),
    staleTime: 60_000,
  });

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  void tick;
  const local = computeLocalSystemHealth();
  const ufec = getLastOperationalSnapshotForObservers();
  const clientScore =
    ufec?.healthScore != null ? Math.min(ufec.healthScore, local.score) : local.score;
  const serverScore = serverHealth?.resilienceSnapshot?.healthScore;
  const trustScore =
    serverScore != null && Number.isFinite(Number(serverScore))
      ? Math.min(Number(serverScore), clientScore)
      : clientScore;

  const statusHeadline =
    trustScore >= 80 ? "NORMAL" : trustScore >= 50 ? "DEGRADED" : "UNSTABLE";
  const insights = generateInsights(summaryForInsights).slice(0, 2);

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5 dark:border-teal-900 dark:bg-teal-950/30">
      <h2 className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
        Business status
      </h2>
      <p className="mt-1 text-xs text-teal-900/80 dark:text-teal-200/90">
        Can you trust today&apos;s figures? One place for reliability and quick reads.
      </p>
      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums text-teal-950 dark:text-teal-100">{trustScore}%</span>
        <span className="text-sm font-semibold text-teal-900 dark:text-teal-200">{trustLabel(trustScore)}</span>
        <span className="rounded-full border border-teal-300 px-2 py-0.5 text-xs font-medium text-teal-900 dark:border-teal-700 dark:text-teal-200">
          {statusHeadline}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-teal-900/90 dark:text-teal-200/90 sm:grid-cols-2">
        {isAdmin && serverHealth?.operationalMode != null ? (
          <div>
            <dt className="text-teal-700/80 dark:text-teal-400/90">Server operations</dt>
            <dd className="font-medium">{mapServerMode(serverHealth.operationalMode)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-teal-700/80 dark:text-teal-400/90">Sync reliability (this device)</dt>
          <dd className="font-medium">{clientScore}%</dd>
        </div>
      </dl>
      {insights.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-teal-200/80 pt-4 text-sm text-teal-950 dark:border-teal-800 dark:text-teal-100">
          {insights.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-teal-600 dark:text-teal-400" aria-hidden>
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
