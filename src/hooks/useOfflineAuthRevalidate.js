import { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { refreshAccessTokenSilently } from "../services/authRefresh";
import { getAuthSession } from "../services/api";

/**
 * When connectivity returns, upgrade offline-only sessions to JWT via refresh cookie,
 * then refresh staff profile from the server (role / revocation).
 */
export function useOfflineAuthRevalidate() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const { offlineSessionActive, token } = useAuthStore.getState();
      if (!offlineSessionActive) return;

      if (!token) {
        await refreshAccessTokenSilently();
        if (cancelled) return;
      }

      const t = useAuthStore.getState().token;
      if (!t) return;

      try {
        const data = await getAuthSession();
        if (cancelled || !data?.user) return;
        useAuthStore.getState().setUser(data.user);
      } catch {
        // 401 → global api handler
      }
    };

    window.addEventListener("online", run);
    void run();
    return () => {
      cancelled = true;
      window.removeEventListener("online", run);
    };
  }, []);
}
