import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Production-only: registers the app Service Worker (via vite-plugin-pwa / Workbox)
 * and shows a banner when a new build is available. User confirms refresh.
 */
function PwaUpdateInner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError: () => {},
  });

  if (!needRefresh) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[110] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 shadow-lg dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
      role="alert"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">A new version of POSflyt is ready.</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-md bg-teal-600 px-3 py-1.5 text-white hover:bg-teal-700"
            onClick={() => updateServiceWorker()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-md border border-stone-300 px-3 py-1.5 hover:bg-stone-50 dark:border-stone-600 dark:hover:bg-stone-800"
            onClick={() => setNeedRefresh(false)}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PwaUpdatePrompt() {
  if (!import.meta.env.PROD) return null;
  return <PwaUpdateInner />;
}
