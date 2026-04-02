import { useBackups, useRecoveryInfo, useTriggerBackup } from "../hooks/useSystem";
import { useToastStore } from "../stores/toastStore";

export default function BackupsPage() {
  const { data: backups = [] } = useBackups(true);
  const { data: recovery } = useRecoveryInfo(true);
  const trigger = useTriggerBackup();
  const showToast = useToastStore((s) => s.showToast);

  const onTrigger = async () => {
    try {
      await trigger.mutateAsync();
      showToast("Backup created.", "success");
    } catch {
      showToast("Backup failed.", "error");
    }
  };

  return (
    <section>
      <h1 className="text-2xl font-bold">Backups</h1>
      <button
        type="button"
        onClick={onTrigger}
        className="mt-3 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
      >
        Trigger Manual Backup
      </button>
      <div className="mt-4 space-y-2 text-sm">
        {backups.map((b) => (
          <div key={b.id} className="rounded border border-stone-200 px-3 py-2 dark:border-stone-700">
            <div className="flex flex-wrap justify-between gap-2">
              <span>{b.status}</span>
              <span>{new Date(b.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-stone-500">{b.filePath}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold">Recovery Preparation</h2>
        <p className="mt-1 text-stone-600 dark:text-stone-400">{recovery?.restorePreparation}</p>
      </div>
    </section>
  );
}
