import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useNotificationStore } from "../stores/notificationStore";

/**
 * Phase 7.13.2: header alerts with one-tap navigation to inventory (low stock) or Settings sync panel.
 */
export default function SmartAlertsBell() {
  const notifications = useNotificationStore((s) => s.notifications);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const count = notifications.length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        className="relative rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        aria-label={count ? `Alerts, ${count} active` : "Alerts"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>🔔</span>
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-stone-950">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open && (
        <div className="absolute right-0 z-[60] mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-stone-200 bg-white p-2 shadow-xl dark:border-stone-700 dark:bg-stone-900">
          <p className="border-b border-stone-100 px-2 pb-2 text-xs font-semibold text-stone-500 dark:border-stone-700 dark:text-stone-400">
            Smart alerts
          </p>
          {!notifications.length ? (
            <p className="px-2 py-3 text-sm text-stone-500 dark:text-stone-400">No active alerts.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto py-2">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-stone-100 bg-stone-50 px-2 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
                >
                  <p className="text-stone-800 dark:text-stone-100">{n.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n.actionRoute ? (
                      <Link
                        to={n.actionRoute}
                        onClick={() => setOpen(false)}
                        className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
                      >
                        {n.actionText || "Open"}
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
