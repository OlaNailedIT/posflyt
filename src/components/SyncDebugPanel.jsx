import { useCallback, useEffect, useState } from "react";
import { getQueuedOutbox, getQueuedTransactions } from "../services/db";

export default function SyncDebugPanel() {
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const transactions = await getQueuedTransactions();
    const outbox = await getQueuedOutbox();
    setData({ transactions, outbox });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!import.meta.env.DEV) return null;

  return (
    <div
      className="fixed bottom-2 right-2 z-[9999] max-h-[min(320px,50vh)] max-w-[min(420px,92vw)] overflow-auto rounded-lg border border-emerald-900/40 bg-stone-950 p-3 font-mono text-[11px] leading-snug text-emerald-400 shadow-xl"
      aria-label="Sync debug (local queue)"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-emerald-300">Sync debug</span>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-emerald-700 px-2 py-0.5 text-emerald-300 hover:bg-emerald-950"
        >
          Refresh
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
