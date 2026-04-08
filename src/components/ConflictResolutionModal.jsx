export default function ConflictResolutionModal({
  isOpen,
  onClose,
  conflictData,
  onUseServer,
  onOverwrite,
  busy = false,
}) {
  if (!isOpen || !conflictData) return null;

  const { recordId, serverUpdatedAt, clientUpdatedAt } = conflictData;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-700 dark:bg-stone-900">
        <h2 id="conflict-modal-title" className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          Conflict detected
        </h2>

        <p className="text-sm text-stone-600 dark:text-stone-400">
          This item was updated elsewhere. Choose how to continue.
        </p>

        <div className="space-y-1 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-400">
          <p>
            <strong className="text-stone-800 dark:text-stone-200">Record:</strong>{" "}
            <span className="font-mono">{recordId}</span>
          </p>
          <p>
            <strong className="text-stone-800 dark:text-stone-200">Your edit (baseline):</strong>{" "}
            {clientUpdatedAt ? new Date(clientUpdatedAt).toLocaleString() : "—"}
          </p>
          <p>
            <strong className="text-stone-800 dark:text-stone-200">Server version:</strong>{" "}
            {serverUpdatedAt ? new Date(serverUpdatedAt).toLocaleString() : "—"}
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <button
            type="button"
            onClick={onUseServer}
            disabled={busy}
            className="flex-1 rounded-lg border border-stone-300 bg-stone-100 py-2.5 text-sm font-medium text-stone-800 hover:bg-stone-200 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            Use server version
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            disabled={busy}
            className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
          >
            Overwrite server
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="w-full text-center text-xs text-stone-500 underline hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
