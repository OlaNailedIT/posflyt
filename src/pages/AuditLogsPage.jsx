import { useAuditLogs } from "../hooks/useSystem";
import { formatDateTimeLocale } from "../utils/safeDate";

export default function AuditLogsPage() {
  const { data = [], isLoading } = useAuditLogs(true);

  return (
    <section>
      <h1 className="text-2xl font-bold">Audit Logs</h1>
      {isLoading && <p className="mt-2 text-sm text-stone-500">Loading logs...</p>}
      <div className="mt-4 space-y-2">
        {data.map((log) => (
          <div key={log.id} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">{log.action}</span>
              <span className="text-stone-500">{formatDateTimeLocale(log.createdAt)}</span>
            </div>
            <p className="text-xs text-stone-500">{log.user?.name || "System"}</p>
          </div>
        ))}
        {!isLoading && !data.length && <p className="text-sm text-stone-500">No logs available.</p>}
      </div>
    </section>
  );
}
