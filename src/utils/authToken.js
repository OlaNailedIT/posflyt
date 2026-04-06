/** Key used alongside Zustand persist for direct token reads (API interceptor, AuthGuard). */
export const AUTH_TOKEN_KEY = "auth_token";

/**
 * Read JWT from persisted Zustand (`posflyt-auth`) or legacy `auth_token` key.
 * Synchronous; safe before Zustand rehydrates in-memory state.
 */
export function getStoredAuthTokenSync() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("posflyt-auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      const t = parsed?.state?.token;
      if (t) return t;
    }
  } catch {
    // ignore
  }
  return localStorage.getItem(AUTH_TOKEN_KEY) || null;
}
