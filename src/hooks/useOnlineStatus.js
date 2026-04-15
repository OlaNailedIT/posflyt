import { useEffect } from "react";
import { useOfflineStore } from "../stores/offlineStore";

export function useOnlineStatus() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setOnline = useOfflineStore((s) => s.setOnline);
  const setNetworkStability = useOfflineStore((s) => s.setNetworkStability);

  /** Align store with the browser on mount (HMR / tab restore can leave a stale flag). */
  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
  }, [setOnline]);

  useEffect(() => {
    let stabilizeTimer;
    const markTransition = () => {
      setNetworkStability("transitioning");
      clearTimeout(stabilizeTimer);
      stabilizeTimer = setTimeout(() => setNetworkStability("stable"), 8000);
    };
    const onOnline = () => {
      setOnline(true);
      markTransition();
    };
    const onOffline = () => {
      setOnline(false);
      markTransition();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(stabilizeTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [setOnline, setNetworkStability]);

  return isOnline;
}
