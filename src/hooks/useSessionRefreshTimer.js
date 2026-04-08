import { useEffect } from "react";
import { refreshAccessTokenSilently } from "../services/authRefresh";
import { useAuthStore } from "../stores/authStore";
import { getJwtExpMs } from "../utils/jwtClient";

const REFRESH_BEFORE_EXPIRY_MS = 60_000;

/**
 * Proactively refresh shortly before access JWT expiry (refresh session via HttpOnly cookie).
 * Falls back to 401 + interceptor refresh for edge cases.
 */
export function useSessionRefreshTimer() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return undefined;

    const expMs = getJwtExpMs(token);
    if (!expMs) return undefined;

    const msUntil = expMs - Date.now() - REFRESH_BEFORE_EXPIRY_MS;
    const delay = msUntil <= 0 ? 0 : msUntil;

    const id = window.setTimeout(() => {
      refreshAccessTokenSilently().catch(() => {});
    }, delay);

    return () => window.clearTimeout(id);
  }, [token]);
}
