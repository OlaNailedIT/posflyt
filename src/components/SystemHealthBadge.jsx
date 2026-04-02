import { useSystemHealth } from "../hooks/useSystem";
import { useOfflineStore } from "../stores/offlineStore";

export default function SystemHealthBadge() {
  const { data } = useSystemHealth();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const syncing = useOfflineStore((s) => s.syncing);

  return (
    <div className="rounded-lg border border-stone-300 bg-stone-100 px-2 py-1 text-xs text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">
      API: {data?.api === "up" ? "Up" : "Down"} · DB: {data?.database || "unknown"} · Net:{" "}
      {isOnline ? "Online" : "Offline"} {syncing ? "· Syncing" : ""}
    </div>
  );
}
