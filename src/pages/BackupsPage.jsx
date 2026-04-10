import {
  useBackups,
  usePostIndexedDBBackup,
  useRecoveryInfo,
  useTriggerBackup,
} from "../hooks/useSystem";
import { downloadBackupPayload } from "../services/api";
import { exportIndexedDBFullSnapshot, importIndexedDBFullSnapshot } from "../services/db";
import { useToastStore } from "../stores/toastStore";
import { useState } from "react";

function backupKindLabel(kind) {
  if (kind === "INDEXEDDB") return "Device (offline)";
  return "Server";
}

export default function BackupsPage() {
  const { data: backups = [] } = useBackups(true);
  const { data: recovery } = useRecoveryInfo(true);
  const trigger = useTriggerBackup();
  const postDevice = usePostIndexedDBBackup();
  const showToast = useToastStore((s) => s.showToast);
  const [restoringId, setRestoringId] = useState(null);

  const serverBackups = backups.filter((b) => b.kind !== "INDEXEDDB");
  const deviceBackups = backups.filter((b) => b.kind === "INDEXEDDB");

  const onTriggerServer = async () => {
    try {
      await trigger.mutateAsync();
      showToast("Server backup created.", "success");
    } catch {
      showToast("Server backup failed.", "error");
    }
  };

  const onBackupDevice = async () => {
    try {
      const snapshot = await exportIndexedDBFullSnapshot();
      await postDevice.mutateAsync(snapshot);
      showToast("Device data backed up to the cloud.", "success");
    } catch {
      showToast("Device backup failed.", "error");
    }
  };

  const onRestoreDevice = async (backupId) => {
    const ok = window.confirm(
      "This will replace all offline data on this device (cached products, queued transactions, drafts) with the selected backup. This cannot be undone. Continue?"
    );
    if (!ok) return;
    setRestoringId(backupId);
    try {
      const payload = await downloadBackupPayload(backupId);
      if (payload.kind !== "INDEXEDDB" || !payload.snapshot) {
        showToast("That backup is not a device snapshot.", "error");
        return;
      }
      await importIndexedDBFullSnapshot(payload.snapshot);
      showToast("Restore complete. Reloading…", "success");
      window.setTimeout(() => window.location.reload(), 400);
    } catch {
      showToast("Restore failed.", "error");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <section className="space-y-8">
      <h1 className="text-2xl font-bold">Backups</h1>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold">Server database</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Exports products, customers, transactions, and settings from the hosted database to a JSON file on
          the server.
        </p>
        <button
          type="button"
          onClick={onTriggerServer}
          disabled={trigger.isPending}
          className="mt-3 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-teal-500 dark:text-stone-950"
        >
          {trigger.isPending ? "Working…" : "Run server backup"}
        </button>
        <ul className="mt-4 space-y-2 text-sm">
          {serverBackups.map((b) => (
            <li
              key={b.id}
              className="rounded border border-stone-200 px-3 py-2 dark:border-stone-700"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{backupKindLabel(b.kind)}</span>
                <span>{b.status}</span>
                <span>{new Date(b.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-stone-500">{b.filePath}</p>
            </li>
          ))}
          {serverBackups.length === 0 ? (
            <li className="text-stone-500">No server backups yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold">This device (offline data)</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Backs up the local IndexedDB used for offline mode: product cache, transaction queue, outbox, and
          related stores. After a successful sync, an automatic device backup may run at most once per 24
          hours.
        </p>
        <button
          type="button"
          onClick={onBackupDevice}
          disabled={postDevice.isPending}
          className="mt-3 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-teal-500 dark:text-stone-950"
        >
          {postDevice.isPending ? "Uploading…" : "Backup this device now"}
        </button>
        <ul className="mt-4 space-y-2 text-sm">
          {deviceBackups.map((b) => (
            <li
              key={b.id}
              className="rounded border border-stone-200 px-3 py-2 dark:border-stone-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{new Date(b.createdAt).toLocaleString()}</span>
                <span className="text-xs text-stone-500">
                  {(b.sizeBytes / 1024).toFixed(1)} KB
                </span>
                <button
                  type="button"
                  onClick={() => onRestoreDevice(b.id)}
                  disabled={restoringId === b.id}
                  className="rounded border border-amber-600 px-2 py-1 text-xs font-semibold text-amber-800 disabled:opacity-60 dark:border-amber-500 dark:text-amber-200"
                >
                  {restoringId === b.id ? "Restoring…" : "Restore on this device"}
                </button>
              </div>
            </li>
          ))}
          {deviceBackups.length === 0 ? (
            <li className="text-stone-500">No device backups in the cloud yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold">Recovery preparation</h2>
        <p className="mt-1 text-stone-600 dark:text-stone-400">{recovery?.restorePreparation}</p>
      </div>
    </section>
  );
}
