import { processQueue } from "./syncEngine";

/**
 * Registers reconnect + periodic sync. UFEC execution stays in `useOfflineSync` (registered via `syncCoordinator`).
 * @returns {() => void} cleanup (tests / hot reload)
 */
export function startOfflineSyncBootstrap() {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => {
    void processQueue(false);
  };
  window.addEventListener("online", onOnline);
  const timer = window.setInterval(() => {
    void processQueue(false);
  }, 30_000);

  return () => {
    window.removeEventListener("online", onOnline);
    window.clearInterval(timer);
  };
}
